from fastapi import FastAPI, File, UploadFile, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
import pandas as pd
import xlsxwriter
import numpy as np
import io
import os
import uuid
import json
from pathlib import Path
from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime, date, time, timedelta
from openai import AsyncOpenAI

import traceback
from fastapi import Request
from fastapi.responses import JSONResponse

from deck_builder import (
    fill_pptx_template, compute_marketing_deck_tokens, compute_key_request_candidates, TEMPLATE_PATH,
)

app = FastAPI(title="Ticket Analytics API", version="1.0.0")


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    tb = traceback.format_exc()
    print(f"[ERROR] Unhandled exception on {request.method} {request.url.path}:\n{tb}", flush=True)
    return JSONResponse(status_code=500, content={"detail": f"{type(exc).__name__}: {exc}"})


@app.get("/healthz")
async def health():
    return {"status": "ok"}


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

sessions: dict[str, pd.DataFrame] = {}
_MAX_SESSIONS = 20  # every page load creates a fresh session; drop the oldest

def _register_session(sid: str, df: pd.DataFrame) -> None:
    sessions[sid] = df
    while len(sessions) > _MAX_SESSIONS:
        sessions.pop(next(iter(sessions)))


# Browsers must never cache the app shell — after a deploy a cached index.html
# would keep pointing at old hashed bundles until a hard refresh.
@app.middleware("http")
async def _no_cache_html(request, call_next):
    response = await call_next(request)
    ct = response.headers.get("content-type", "")
    if "text/html" in ct:
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
        response.headers["Pragma"] = "no-cache"
    return response

# ── Persistence (PostgreSQL via DATABASE_URL env var) ─────────────────────────

# Why the last _get_conn() attempt produced nothing. Without this, "DATABASE_URL
# was never set" and "it's set but the connection is broken" both surface to the
# user as an identical "no database attached" message, which sends them off
# re-attaching a database that was already attached.
_LAST_DB_ERROR: Optional[str] = None


def _get_conn():
    global _LAST_DB_ERROR
    url = os.environ.get("DATABASE_URL")
    if not url:
        _LAST_DB_ERROR = None
        return None
    try:
        import psycopg2
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql://", 1)
        # Public cloud Postgres wants TLS; Railway's private endpoint
        # (*.railway.internal) does not terminate it, and forcing require there
        # fails with "server does not support SSL". prefer negotiates TLS when
        # the server offers it and connects plainly when it does not, so one
        # setting is correct for the internal host, localhost and public hosts.
        if "sslmode" not in url:
            host_is_private = (
                ".railway.internal" in url
                or "@localhost" in url
                or "@127.0.0.1" in url
                or ".internal:" in url
            )
            sep = "&" if "?" in url else "?"
            url = url + sep + ("sslmode=prefer" if host_is_private else "sslmode=require")
        conn = psycopg2.connect(url, connect_timeout=10)
        _LAST_DB_ERROR = None
        print(f"[DB] Connected to PostgreSQL", flush=True)
        return conn
    except Exception as e:
        _LAST_DB_ERROR = f"{type(e).__name__}: {e}"
        print(f"[DB] Connection failed: {e}", flush=True)
        return None


def db_diagnosis() -> str:
    """One-line reason there is no usable connection, safe to show a user.

    Only the hostname is ever included — never the credentials embedded in
    DATABASE_URL, which would otherwise end up on screen and in the logs.
    """
    url = os.environ.get("DATABASE_URL")
    if not url:
        return ("DATABASE_URL is not set on this service. In Railway, adding a "
                "Postgres database does not hand its URL to the app "
                "automatically — add a variable named DATABASE_URL on the app "
                "service with the value ${{Postgres.DATABASE_URL}}, then redeploy.")
    host = "?"
    try:
        from urllib.parse import urlparse
        host = urlparse(url).hostname or "?"
    except Exception:
        pass
    if _LAST_DB_ERROR:
        return (f"DATABASE_URL is set (host {host}) but the connection failed — "
                f"{_LAST_DB_ERROR}")
    return f"DATABASE_URL is set (host {host}) but no connection could be opened."

def _init_db():
    conn = _get_conn()
    if not conn:
        print("[DB] Skipping init — no DB connection", flush=True)
        return
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS kpi_settings (
                        key TEXT PRIMARY KEY,
                        value TEXT NOT NULL
                    )
                """)
        print("[DB] Table kpi_settings ready", flush=True)
    except Exception as e:
        print(f"[DB] Init error: {e}", flush=True)
    finally:
        conn.close()

_SETTINGS_FILE = os.path.join(os.path.dirname(__file__), "kpi_settings.json")

def _file_load(key: str) -> dict | None:
    try:
        with open(_SETTINGS_FILE) as f:
            return json.load(f).get(key)
    except Exception:
        return None

def _file_save(key: str, value: dict) -> None:
    try:
        try:
            with open(_SETTINGS_FILE) as f:
                all_s = json.load(f)
        except Exception:
            all_s = {}
        all_s[key] = value
        with open(_SETTINGS_FILE, "w") as f:
            json.dump(all_s, f)
        print(f"[SETTINGS] Saved '{key}' to file", flush=True)
    except Exception as e:
        print(f"[SETTINGS] File save error for '{key}': {e}", flush=True)

def _load_setting(key: str, default: dict) -> dict:
    conn = _get_conn()
    if not conn:
        # Fall back to local JSON file
        saved = _file_load(key)
        if saved is not None:
            merged = dict(default)
            merged.update(saved)
            print(f"[SETTINGS] Loaded '{key}' from file", flush=True)
            return merged
        print(f"[SETTINGS] No DB or file — using default for '{key}'", flush=True)
        return dict(default)
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute("SELECT value FROM kpi_settings WHERE key = %s", (key,))
                row = cur.fetchone()
                if row:
                    loaded = json.loads(row[0])
                    merged = dict(default)
                    merged.update(loaded)
                    print(f"[DB] Loaded '{key}' from DB", flush=True)
                    return merged
        print(f"[DB] No saved value for '{key}' — using default", flush=True)
        return dict(default)
    except Exception as e:
        print(f"[DB] Error loading '{key}': {e}", flush=True)
        return dict(default)
    finally:
        conn.close()

def _save_setting(key: str, value: dict) -> None:
    conn = _get_conn()
    if not conn:
        # Fall back to local JSON file
        _file_save(key, value)
        return
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO kpi_settings (key, value) VALUES (%s, %s)
                    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
                """, (key, json.dumps(value)))
        print(f"[DB] Saved '{key}' to DB", flush=True)
    except Exception as e:
        print(f"[DB] Error saving '{key}': {e}", flush=True)
        # Fall back to file on DB error
        _file_save(key, value)
    finally:
        conn.close()

_init_db()

# ── Configuration ─────────────────────────────────────────────────────────────

BANDWIDTH_RATES: dict[str, float] = _load_setting("bandwidth_rates", {
    "Website Content Management":          1.6,
    "Content Production – Graphic Design": 1.3,
    "Demand Creation – Global":            0.4,
    "Email – Local":                       1.1,
    "Retention – Activations":             0.4,
    "Demand Engagement Activations":       0.63,
})

BANDWIDTH_HOURS_PER_DAY  = 8
BANDWIDTH_DAYS_PER_WEEK  = 5
BANDWIDTH_WEEKLY_CAPACITY = BANDWIDTH_HOURS_PER_DAY * BANDWIDTH_DAYS_PER_WEEK  # 40 h

DEFAULT_PEOPLE: list[str] = [
    "Ajith A",
    "Akshaya Praveen",
    "Akshayaa Rajeswari AS",
    "Arvind Lakshminarayanan",
    "Ranjithkumar Ashokkumar",
    "Nitish JK",
]

# Mapping from old short names → new full sheet names, used to migrate persisted settings.
PEOPLE_MIGRATION: dict[str, str] = {
    "Ajith":      "Ajith A",
    "Akshaya P":  "Akshaya Praveen",
    "Akshayaa R": "Akshayaa Rajeswari AS",
    "Arvind":     "Arvind Lakshminarayanan",
    "Arvind L":   "Arvind Lakshminarayanan",
    "Nitish":     "Nitish JK",
    "Ranjith":    "Ranjithkumar Ashokkumar",
}

def _migrate_people(settings: dict) -> dict:
    """Re-key the 'people' dict from old short names to current full sheet names."""
    if not settings.get("people"):
        return settings
    migrated = {PEOPLE_MIGRATION.get(k, k): v for k, v in settings["people"].items()}
    return {**settings, "people": migrated}

CAPACITY_SETTINGS: dict = _migrate_people(_load_setting("capacity_settings", {
    "mode": "annual",
    "default_working_days": 250,
    "default_holidays": 24,
    "people": {},
    "presets": {},
}))

SLA_RULES: dict[str, int] = _load_setting("sla_rules", {
    "Website Content Management": 10,
    "Content Production – Graphic Design": 10,
    "Demand Creation – Global": 30,
    "Email – Local": 7,
    "Retention – Activations": 30,
    "Demand Engagement Activations": 14,
})

CADENCE_SETTINGS: dict = _migrate_people(_load_setting("cadence_settings", {
    "team": {"activities": []},
    "people": {},
}))

TRAINING_SETTINGS: dict = _migrate_people(_load_setting("training_settings", {
    "people": {},
}))

# Maps raw sheet assignee names → override names (applied at parse time).
# Only needed for edge cases where a sheet name differs from DEFAULT_PEOPLE.
ASSIGNEE_ALIASES: dict[str, str] = _load_setting("assignee_aliases", {})

EXCLUDED_STATES = {"Closed Completed", "Closed Rejected", "Confirmation Completed"}

COLUMN_ALIASES: dict[str, list[str]] = {
    "ticket_number":       ["Number", "Ticket Number", "TicketNumber", "Ticket ID", "ID"],
    "short_description":   ["Short description", "Short Description", "Description", "Summary", "Title"],
    "assigned_to":         ["Assigned to", "Assigned To", "AssignedTo", "Assignee"],
    "state":               ["State", "Status"],
    "created_date":        ["Created", "Created Date", "CreatedDate", "Date Created", "Date Opened"],
    "preferred_live_date": ["Preferred Live Date", "PreferredLiveDate", "Live Date"],
    "due_date":            ["Due date", "Due Date", "DueDate"],
    "closed_date":         ["Closed", "Closed Date", "ClosedDate", "Date Closed", "Resolved Date",
                           "Resolution Date", "Date Resolved", "Resolved", "Closed On", "Close Date",
                           "Closure Date", "Date of Closure", "Completion Date", "Date Completed"],
    "sub_category":        ["Sub-Category", "Sub Category", "SubCategory", "Sub-category", "Category"],
    "ticket_creator":      ["Requested by", "Requested By", "Ticket Creator", "Creator", "Created By", "Raised By"],
    "watch_list":          ["Watch list", "Watch List", "WatchList", "Watchers"],
    "team":                ["Team", "team", "Business Unit"],
    "area":                ["Area", "Department", "Region", "Business Area"],
    "tags":                ["Tags", "tags", "Tag"],
}

# ── Working-day helpers ───────────────────────────────────────────────────────

# Public holidays observed by the hub (Tamil Nadu). Holidays landing on a
# weekend are harmless duplicates — the weekend mask already excludes them.
# 2025 and 2026 are as supplied; 2024 is best-effort for the same festival set
# and should be confirmed.
HOLIDAYS_BY_YEAR: dict[int, list[str]] = {
    2024: [
        "2024-01-01",  # New Year's Day
        "2024-01-15",  # Pongal
        "2024-01-26",  # Republic Day
        "2024-04-14",  # Tamil New Year (Sun)
        "2024-05-01",  # May Day
        "2024-08-15",  # Independence Day
        "2024-09-07",  # Ganesh Chaturthi (Sat)
        "2024-10-02",  # Gandhi Jayanti
        "2024-10-11",  # Ayudha Pooja
        "2024-10-31",  # Diwali
        "2024-12-25",  # Christmas
    ],
    2025: [
        "2025-01-01",  # New Year's Day
        "2025-01-14",  # Pongal
        "2025-01-26",  # Republic Day (Sun)
        "2025-04-14",  # Tamil New Year
        "2025-05-01",  # May Day
        "2025-08-15",  # Independence Day
        "2025-08-27",  # Ganesh Chaturthi
        "2025-10-01",  # Ayudha Pooja
        "2025-10-02",  # Gandhi Jayanti
        "2025-10-20",  # Diwali
        "2025-12-25",  # Christmas
    ],
    2026: [
        "2026-01-01",  # New Year's Day
        "2026-01-15",  # Pongal
        "2026-01-26",  # Republic Day
        "2026-04-14",  # Tamil New Year
        "2026-04-23",  # Tamil Nadu Elections
        "2026-05-01",  # May Day
        "2026-08-15",  # Independence Day (Sat)
        "2026-09-14",  # Ganesh Chaturthi
        "2026-10-02",  # Gandhi Jayanti
        "2026-10-19",  # Ayudha Pooja
        "2026-11-09",  # Diwali
        "2026-12-25",  # Christmas
    ],
}
_HOLIDAY_DATES = np.array(
    sorted({d for yr in HOLIDAYS_BY_YEAR.values() for d in yr}), dtype="datetime64[D]"
)
_HOLIDAY_SET = {np.datetime64(d, "D") for d in _HOLIDAY_DATES}

WORK_DAY_START = 9    # 09:00
WORK_DAY_END   = 18   # 18:00
WORK_DAY_HOURS = WORK_DAY_END - WORK_DAY_START   # 9 productive hours per day

# Ticket timestamps are normalised to tz-naive UTC on ingest (see
# _parse_dates_robust), but the 09:00–18:00 window and the holiday list are
# local to the hub. Shift into local time before slicing the working day.
# India observes no DST, so a fixed offset is exact.
BUSINESS_TZ_OFFSET = timedelta(hours=5, minutes=30)   # UTC → IST


def _is_working_day(d: date) -> bool:
    return d.weekday() < 5 and np.datetime64(d, "D") not in _HOLIDAY_SET


def business_hours_between(start, end) -> Optional[float]:
    """Working hours between two instants: 09:00–18:00, Mon–Fri, holidays excluded.

    Currently unused — it backed the Avg Turnaround Time card, which was
    removed. Kept because it is tested and shares the holiday calendar that
    the SLA and attendance features still rely on.

    Time outside the working window contributes nothing, so a ticket raised at
    17:00 Friday and closed at 10:00 Monday counts 2 hours, not 65. Returns None
    when either endpoint is missing.
    """
    if start is None or end is None or pd.isna(start) or pd.isna(end):
        return None
    start = pd.Timestamp(start) + BUSINESS_TZ_OFFSET
    end   = pd.Timestamp(end)   + BUSINESS_TZ_OFFSET
    if end <= start:
        return 0.0

    sd, ed = start.date(), end.date()

    def _clamp(ts, day):
        lo = pd.Timestamp(datetime.combine(day, time(WORK_DAY_START, 0)))
        hi = pd.Timestamp(datetime.combine(day, time(WORK_DAY_END, 0)))
        return min(max(ts, lo), hi), lo, hi

    if sd == ed:
        if not _is_working_day(sd):
            return 0.0
        s, _, _ = _clamp(start, sd)
        e, _, _ = _clamp(end, sd)
        return max((e - s).total_seconds() / 3600.0, 0.0)

    total = 0.0
    if _is_working_day(sd):                      # tail of the first day
        s, _, hi = _clamp(start, sd)
        total += (hi - s).total_seconds() / 3600.0
    if _is_working_day(ed):                      # head of the last day
        e, lo, _ = _clamp(end, ed)
        total += (e - lo).total_seconds() / 3600.0
    # Whole working days strictly between the two dates. busday_count is
    # [begin, end), so begin=sd+1, end=ed covers sd+1 … ed-1.
    full_days = int(np.busday_count(
        np.datetime64(sd, "D") + 1, np.datetime64(ed, "D"), holidays=_HOLIDAY_DATES
    ))
    total += max(full_days, 0) * WORK_DAY_HOURS
    return round(total, 2)


def add_working_days(start, num_days: int):
    """Return SLA due date: num_days working days from start, where start = Day 1."""
    if pd.isna(start):
        return pd.NaT
    try:
        current = start.date() if isinstance(start, (pd.Timestamp, datetime)) else start
        while current.weekday() >= 5:          # advance past weekend to Day 1
            current += timedelta(days=1)
        days_counted = 1
        while days_counted < num_days:
            current += timedelta(days=1)
            if current.weekday() < 5:
                days_counted += 1
        return pd.Timestamp(current)
    except Exception:
        return pd.NaT


def calendar_days_to(target, today: date) -> Optional[int]:
    if target is None or (isinstance(target, float) and np.isnan(target)):
        return None
    try:
        t = target.date() if isinstance(target, (pd.Timestamp, datetime)) else target
        return (t - today).days
    except Exception:
        return None


def working_days_remaining(sla_date, today: date) -> Optional[int]:
    """Working days from today (inclusive) to sla_date (inclusive).
    Returns a negative number if the SLA is already overdue."""
    if sla_date is None or (isinstance(sla_date, float) and np.isnan(sla_date)):
        return None
    try:
        t = sla_date.date() if isinstance(sla_date, (pd.Timestamp, datetime)) else sla_date
        # np.busday_count(d1, d2) counts Mon-Fri days in [d1, d2)
        # Adding timedelta(1) makes it inclusive of t
        return int(np.busday_count(today.isoformat(), (t + timedelta(days=1)).isoformat()))
    except Exception:
        return None

# ── Priority engine ────────────────────────────────────────────────────────────

_LABEL_RANK = {"Overdue": 5, "Critical": 4, "High": 3, "Medium": 2, "Normal": 1}

def _date_urgency(days: Optional[int]) -> tuple[int, str]:
    """Return (score, label) for a single deadline expressed as days-remaining."""
    if days is None:
        return 0, "Normal"
    if days < 0:
        return 1000 + abs(days) * 10, "Overdue"
    if days <= 2:
        return 700, "Critical"
    if days <= 5:
        return 450, "High"
    if days <= 10:
        return 200, "Medium"
    return max(0, 100 - days), "Normal"


def compute_priority(row: dict, today: date) -> dict:
    days_sla = calendar_days_to(row.get("sla_due_date"), today)
    days_pld = calendar_days_to(row.get("preferred_live_date"), today)

    sla_score, sla_label = _date_urgency(days_sla)
    pld_score, pld_label = _date_urgency(days_pld)

    # Label = most urgent of the two dates (PLD has equal standing to SLA)
    label = sla_label if _LABEL_RANK[sla_label] >= _LABEL_RANK[pld_label] else pld_label

    # Score = dominant date + 50 % of the secondary date (avoid double-counting)
    if sla_score >= pld_score:
        score = sla_score + pld_score // 2
    else:
        score = pld_score + sla_score // 2

    # Ticket age as tiebreaker (capped so it never flips the label)
    age = None
    if pd.notna(row.get("created_date")):
        cd = row["created_date"]
        cd = cd.date() if isinstance(cd, (pd.Timestamp, datetime)) else cd
        age = max((today - cd).days, 0)
        score += min(age, 100)

    row["days_to_sla"] = days_sla
    row["days_to_pld"] = days_pld
    row["ticket_age"]  = age
    row["priority_score"] = score
    row["priority_label"] = label
    return row

# ── Excel processing ───────────────────────────────────────────────────────────

def normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    rename: dict[str, str] = {}
    for col in df.columns:
        key = col.strip()
        for internal, variants in COLUMN_ALIASES.items():
            if key in variants or key.lower() in [v.lower() for v in variants]:
                rename[col] = internal
                break
    return df.rename(columns=rename)


def _parse_dates_robust(series: pd.Series) -> pd.Series:
    """Parse dates — handles tz-aware ISO strings from Apps Script and plain dates from Excel."""
    try:
        # utc=True converts ALL inputs to UTC-aware, then tz_convert(None) strips to tz-naive
        s = pd.to_datetime(series, errors="coerce", dayfirst=False, utc=True)
        result = s.dt.tz_convert(None)
        # Force ns precision so datetime64[s] (pandas 2.0+) doesn't break date comparisons
        return result.astype("datetime64[ns]")
    except Exception:
        pass
    # Per-value fallback for unusual formats
    def _parse_one(v):
        if v is None or (isinstance(v, float) and np.isnan(v)) or v == "":
            return pd.NaT
        try:
            ts = pd.Timestamp(v)
            if ts.tzinfo:
                ts = ts.tz_convert("UTC").replace(tzinfo=None)
            return ts
        except Exception:
            return pd.NaT
    return pd.Series([_parse_one(v) for v in series], index=series.index, dtype="datetime64[ns]")


def process_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    df = normalize_columns(df.copy())

    detected_cols = [c for c in ["created_date", "preferred_live_date", "due_date", "closed_date"] if c in df.columns]
    print(f"[PARSE] Columns detected: {list(df.columns)}", flush=True)

    for dc in ["created_date", "preferred_live_date", "due_date", "closed_date"]:
        if dc in df.columns:
            sample = df[dc].dropna().head(3).tolist()
            print(f"[PARSE] {dc} sample (raw): {sample}", flush=True)
            s = _parse_dates_robust(df[dc])
            parsed_count = s.notna().sum()
            print(f"[PARSE] {dc} parsed {parsed_count}/{len(s)} rows", flush=True)
            df[dc] = s

    str_cols = ["state", "sub_category", "assigned_to", "area", "team",
                "ticket_creator", "ticket_number", "short_description", "tags", "watch_list"]
    for sc in str_cols:
        if sc in df.columns:
            df[sc] = df[sc].astype(str).str.strip().replace({"nan": pd.NA, "None": pd.NA, "": pd.NA})

    # Apply only explicit aliases (no auto prefix-match — sheet names are used as-is)
    if "assigned_to" in df.columns and ASSIGNEE_ALIASES:
        df["assigned_to"] = df["assigned_to"].map(lambda n: ASSIGNEE_ALIASES.get(str(n), n) if pd.notna(n) else n)

    # Calculate SLA due dates from Created date using working-days rules
    def _sla(row):
        sc = row.get("sub_category")
        cd = row.get("created_date")
        if pd.notna(sc) and pd.notna(cd):
            days = SLA_RULES.get(str(sc).strip())
            if days:
                return add_working_days(cd, days)
        return pd.NaT

    df["sla_due_date"] = pd.to_datetime(df.apply(_sla, axis=1), errors="coerce").astype("datetime64[ns]")

    if "state" in df.columns:
        df["is_active"] = ~df["state"].isin(EXCLUDED_STATES)
    else:
        df["is_active"] = True

    today = date.today()
    df["days_to_sla"]    = pd.array([pd.NA] * len(df), dtype="Int64")
    df["days_to_pld"]    = pd.array([pd.NA] * len(df), dtype="Int64")
    df["ticket_age"]     = pd.array([pd.NA] * len(df), dtype="Int64")
    df["priority_score"] = pd.array([0]     * len(df), dtype="Int64")
    df["priority_label"] = "N/A"

    for idx, row in df[df["is_active"]].iterrows():
        result = compute_priority(row.to_dict(), today)
        df.at[idx, "days_to_sla"]    = result["days_to_sla"]
        df.at[idx, "days_to_pld"]    = result["days_to_pld"]
        df.at[idx, "ticket_age"]     = result["ticket_age"]
        df.at[idx, "priority_score"] = result["priority_score"]
        df.at[idx, "priority_label"] = result["priority_label"]

    return df


def _safe_val(v):
    if v is pd.NA or v is pd.NaT:
        return None
    if isinstance(v, (pd.Timestamp, datetime)):
        return v.isoformat() if pd.notna(v) else None
    if isinstance(v, np.integer):
        return int(v)
    if isinstance(v, np.floating):
        return None if np.isnan(v) else float(v)
    if isinstance(v, float) and np.isnan(v):
        return None
    return v


def df_to_records(df: pd.DataFrame) -> list[dict]:
    return [{k: _safe_val(v) for k, v in row.items()} for _, row in df.iterrows()]

# ── Upload ─────────────────────────────────────────────────────────────────────

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    if not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(400, "Only .xlsx / .xls files are supported")
    content = await file.read()
    try:
        df = pd.read_excel(io.BytesIO(content), engine="openpyxl")
    except Exception as exc:
        raise HTTPException(400, f"Could not parse Excel file: {exc}")

    df = process_dataframe(df)
    sid = str(uuid.uuid4())
    _register_session(sid, df)

    active = df[df["is_active"]]
    return {
        "session_id": sid,
        "filename": file.filename,
        "total_rows": len(df),
        "total_active": int(len(active)),
        "overdue_sla": int((active["days_to_sla"].dropna() < 0).sum()),
        "due_within_5": int(
            ((active["days_to_sla"].dropna() >= 0) & (active["days_to_sla"].dropna() <= 5)).sum()
        ),
        "columns_detected": list(df.columns),
    }

class JsonUploadBody(BaseModel):
    rows: List[dict]
    source_label: str = "Google Sheet"

@app.post("/api/upload-json")
async def upload_json(body: JsonUploadBody):
    if not body.rows:
        raise HTTPException(400, "rows array is empty")
    print(f"[UPLOAD] Received {len(body.rows)} rows from '{body.source_label}'", flush=True)
    if body.rows:
        print(f"[UPLOAD] First row keys: {list(body.rows[0].keys())}", flush=True)
        # Log sample Created/Closed values to diagnose date format
        for key in body.rows[0].keys():
            if key.lower() in ("created", "closed", "created date", "closed date"):
                print(f"[UPLOAD] Sample '{key}' values: {[r.get(key) for r in body.rows[:3]]}", flush=True)
    try:
        df = pd.DataFrame(body.rows)
    except Exception as exc:
        raise HTTPException(400, f"Could not build DataFrame: {exc}")
    df = process_dataframe(df)
    sid = str(uuid.uuid4())
    _register_session(sid, df)
    active = df[df["is_active"]]
    date_col_status = {
        col: int(df[col].notna().sum())
        for col in ["created_date", "closed_date", "due_date", "preferred_live_date"]
        if col in df.columns
    }
    print(f"[UPLOAD] Session {sid}: {len(df)} rows, date cols={date_col_status}", flush=True)
    return {
        "session_id": sid,
        "filename": body.source_label,
        "total_rows": len(df),
        "total_active": int(len(active)),
        "overdue_sla": int((active["days_to_sla"].dropna() < 0).sum()),
        "due_within_5": int(
            ((active["days_to_sla"].dropna() >= 0) & (active["days_to_sla"].dropna() <= 5)).sum()
        ),
        "date_cols": date_col_status,
        "columns_detected": list(df.columns),
    }

# ── Feedback CSV transform ─────────────────────────────────────────────────
# asmt_metric_result exports one row per (Instance, Metric) — seven metric rows
# per survey response, long/EAV shape. The rest of the feedback pipeline
# (_detect_feedback_columns) expects one row per response with each metric as
# its own column, so this pivots before anything else touches it.
_FEEDBACK_SOURCE_FILTER = "Service Feedback Form"

# Renamed so the pivoted columns line up with what _detect_feedback_columns
# already looks for, and so "Assigned to" (the requester in this export) can
# never be mistaken for the specialist column, which the raw name invites —
# "assigned to" is the FIRST candidate the specialist detector tries.
_FEEDBACK_RENAME = {
    "Instance": "Instance Number",
    "Assigned to": "Requester Name",
    "Updated": "Submitted Date",
}


def transform_feedback_csv(text: str, allowed_specialists: list[str]) -> pd.DataFrame:
    """EAV ServiceNow export -> one row per response, specialists only."""
    raw = pd.read_csv(io.StringIO(text))
    missing = {"Instance", "Metric", "String value", "Source"} - set(raw.columns)
    if missing:
        raise ValueError(f"Export is missing expected columns: {', '.join(sorted(missing))}")

    # Other assessment templates (e.g. "Release Feedback Survey") share a metric
    # name ("Overall Rating") with this one, so filtering by Source rather than
    # by which metrics are present is what actually isolates the right rows.
    raw = raw[raw["Source"].astype(str).str.contains(_FEEDBACK_SOURCE_FILTER, na=False)]
    if raw.empty:
        return pd.DataFrame()

    wide = raw.pivot_table(
        index=["Instance", "Assigned to"], columns="Metric",
        values="String value", aggfunc="first",
    ).reset_index()

    # The submission date lives per metric row, not per instance; take the
    # latest one seen for that instance rather than losing it in the pivot.
    dates = raw.groupby("Instance")["Updated"].max()
    wide = wide.merge(dates, on="Instance", how="left")

    wide = wide.rename(columns=_FEEDBACK_RENAME)
    if "Specialist Name" in wide.columns:
        wide = wide[wide["Specialist Name"].isin(allowed_specialists)]
    return wide


class CsvUploadBody(BaseModel):
    csv: str
    source_label: str = "ServiceNow"
    dataset: str = "tickets"      # which ServiceNow table this export came from
    synced_by: Optional[str] = None


@app.post("/api/upload-csv")
async def upload_csv(body: CsvUploadBody):
    """Take a raw CSV export and store it.

    The ServiceNow browser extension posts here directly rather than writing to
    a Google Sheet first — one hop instead of three, and no Sheets OAuth. CSV is
    parsed with pandas rather than in the extension because quoted fields,
    embedded commas and newlines are exactly what a hand-rolled parser gets
    wrong, and ServiceNow descriptions contain all three.

    Tickets and feedback are different shapes on the ServiceNow side — tickets
    export one row per ticket, feedback exports one row per (survey, metric) —
    so `dataset` picks which path applies before anything shared runs.
    """
    text = (body.csv or "").strip()
    if not text:
        raise HTTPException(400, "csv body is empty")
    # An expired session gets you the login page, not an export. Catching it
    # here means the user is told to log in rather than seeing a parse error.
    head = text[:400].lstrip().lower()
    if head.startswith("<!doctype") or head.startswith("<html") or "<head>" in head:
        raise HTTPException(
            400,
            "ServiceNow returned a web page instead of CSV — the session has probably "
            "expired. Open ServiceNow, sign in, then sync again.",
        )

    if body.dataset == "feedback":
        try:
            frame = transform_feedback_csv(text, DEFAULT_PEOPLE)
        except ValueError as exc:
            raise HTTPException(400, str(exc))
        except Exception as exc:
            raise HTTPException(400, f"Could not parse the CSV: {exc}")
        if frame.empty:
            raise HTTPException(
                400,
                "No feedback rows matched — check the export contains Service Feedback "
                "Form responses for the tracked specialists.",
            )
        rows = frame.astype(object).where(pd.notna(frame), None).to_dict(orient="records")
        result = sn_data_api.save_snapshot("feedback", rows, body.synced_by)
        print(f"[UPLOAD-CSV] {len(rows)} feedback rows stored "
              f"(specialists: {frame['Specialist Name'].value_counts().to_dict() if 'Specialist Name' in frame else {}})",
              flush=True)
        return {
            "persisted": True,
            "dataset": "feedback",
            "total_rows": len(rows),
            "specialists": sorted(frame["Specialist Name"].unique().tolist()) if "Specialist Name" in frame else [],
        }

    try:
        frame = pd.read_csv(io.StringIO(text))
    except Exception as exc:
        raise HTTPException(400, f"Could not parse the CSV: {exc}")
    if frame.empty:
        raise HTTPException(400, "The export contained no rows")

    print(f"[UPLOAD-CSV] {len(frame)} rows from '{body.source_label}' -> {body.dataset}", flush=True)

    # Persist before parsing into a session. The session lives in memory and dies
    # with the process; the snapshot is what makes a sync mean anything tomorrow,
    # and what lets a colleague see this data without syncing it themselves.
    rows = frame.astype(object).where(pd.notna(frame), None).to_dict(orient="records")
    stored = None
    try:
        stored = sn_data_api.save_snapshot(body.dataset, rows, body.synced_by)
    except HTTPException as exc:
        # No database yet — the in-memory session still works, so the sync is
        # useful now even if it will not survive a restart.
        print(f"[UPLOAD-CSV] Snapshot not stored: {exc.detail}", flush=True)
    except Exception as exc:
        print(f"[UPLOAD-CSV] Snapshot failed: {exc}", flush=True)

    # Corrections apply to what the dashboard reads, not just the stored copy.
    if stored:
        try:
            merged, _ = sn_data_api.load_rows(body.dataset)
            if merged:
                frame = pd.DataFrame(merged)
        except Exception:
            pass

    df = process_dataframe(frame)
    sid = str(uuid.uuid4())
    _register_session(sid, df)
    active = df[df["is_active"]]
    return {
        "persisted": bool(stored),
        "dataset": body.dataset,
        "session_id": sid,
        "filename": body.source_label,
        "total_rows": len(df),
        "total_active": int(len(active)),
        "overdue_sla": int((active["days_to_sla"].dropna() < 0).sum()),
        "due_within_5": int(
            ((active["days_to_sla"].dropna() >= 0) & (active["days_to_sla"].dropna() <= 5)).sum()
        ),
        "columns_detected": list(df.columns),
    }


# ── Overview ───────────────────────────────────────────────────────────────────

@app.get("/api/sessions/{sid}/overview")
def overview(sid: str, assigned_to: str = '', team: str = '', area: str = '', sub_category: str = '', date_from: str = '', date_to: str = ''):
    df = _get_session(sid)

    # Apply date range filters if provided
    if date_from:
        df = df[df["created_date"].dropna() >= pd.Timestamp(date_from)]
    if date_to:
        df = df[df["created_date"].dropna() <= pd.Timestamp(date_to)]

    # Apply dimension filters if provided (comma-separated = multi-select)
    df = _apply_dim_filters(df, assigned_to=assigned_to, team=team, area=area, sub_category=sub_category)

    active = df[df["is_active"]]

    def _list(col):
        return sorted(df[col].dropna().unique().tolist()) if col in df.columns else []

    today = date.today()
    closed_this_week = 0
    if "closed_date" in df.columns:
        week_start = today - timedelta(days=today.weekday())
        closed_this_week = int(
            (df["closed_date"].dropna() >= pd.Timestamp(week_start)).sum()
        )

    ages = active["ticket_age"].dropna()

    sub_cats = _list("sub_category")
    if "sub_category" in df.columns and any(sc in df["sub_category"].values for sc in DEMAND_ENGAGEMENT_SUBS):
        if "Demand Engagement Activations" not in sub_cats:
            sub_cats.append("Demand Engagement Activations")
            sub_cats.sort()

    return {
        "total_active": int(len(active)),
        "total_all": int(len(df)),
        "overdue_sla": int((active["days_to_sla"].dropna() < 0).sum()),
        "due_within_5": int(
            ((active["days_to_sla"].dropna() >= 0) & (active["days_to_sla"].dropna() <= 5)).sum()
        ),
        "pending_confirmation": int(
            active["state"].isin(["Pending Confirmation"]).sum() if "state" in df.columns else 0
        ),
        "closed_this_week": closed_this_week,
        "avg_age": round(float(ages.mean()), 1) if len(ages) else 0,
        "assigned_to_list":   _list("assigned_to"),
        "sub_category_list":  sub_cats,
        "state_list":         _list("state"),
        "area_list":          _list("area"),
        "team_list":          _list("team"),
        "creator_list":       _list("ticket_creator"),
    }

# ── Monthly created ────────────────────────────────────────────────────────────

@app.get("/api/sessions/{sid}/monthly-created")
def monthly_created(sid: str):
    df = _get_session(sid)
    if "created_date" not in df.columns:
        return []
    df2 = df.dropna(subset=["created_date"]).copy()
    df2["month"] = df2["created_date"].dt.to_period("M")
    counts = df2.groupby("month").size().reset_index(name="count").sort_values("month")
    return [
        {"month": str(r["month"]), "label": r["month"].strftime("%b %Y"), "count": int(r["count"])}
        for _, r in counts.iterrows()
    ]

# ── Weekly created vs closed ───────────────────────────────────────────────────

@app.get("/api/sessions/{sid}/weekly-comparison")
def weekly_comparison(sid: str):
    df = _get_session(sid)
    weeks: dict[str, dict] = {}

    if "created_date" in df.columns:
        tmp = df.dropna(subset=["created_date"]).copy()
        tmp["wk"] = tmp["created_date"].dt.to_period("W").apply(lambda p: p.start_time.date())
        for wk, grp in tmp.groupby("wk"):
            k = str(wk)
            weeks.setdefault(k, {"week": k, "label": _week_label(wk), "created": 0, "closed": 0})
            weeks[k]["created"] = int(len(grp))

    if "closed_date" in df.columns:
        tmp = df.dropna(subset=["closed_date"]).copy()
        tmp["wk"] = tmp["closed_date"].dt.to_period("W").apply(lambda p: p.start_time.date())
        for wk, grp in tmp.groupby("wk"):
            k = str(wk)
            weeks.setdefault(k, {"week": k, "label": _week_label(wk), "created": 0, "closed": 0})
            weeks[k]["closed"] = int(len(grp))

    return sorted(weeks.values(), key=lambda x: x["week"])

# ── Weekly by assignee ─────────────────────────────────────────────────────────

@app.get("/api/sessions/{sid}/weekly-by-assignee")
def weekly_by_assignee(sid: str, assignees: Optional[str] = Query(None)):
    df = _get_session(sid)
    if "created_date" not in df.columns or "assigned_to" not in df.columns:
        return {"weeks": [], "assignees": []}

    tmp = df.dropna(subset=["created_date", "assigned_to"]).copy()
    if assignees:
        wanted = [a.strip() for a in assignees.split(",")]
        tmp = tmp[tmp["assigned_to"].isin(wanted)]

    tmp["wk"] = tmp["created_date"].dt.to_period("W").apply(lambda p: p.start_time.date())
    all_assignees = sorted(tmp["assigned_to"].unique().tolist())

    pivot = tmp.groupby(["wk", "assigned_to"]).size().unstack(fill_value=0).reset_index()

    result = []
    for _, row in pivot.sort_values("wk").iterrows():
        wk = row["wk"]
        entry = {"week": str(wk), "label": _week_label(wk)}
        for a in all_assignees:
            entry[a] = int(row.get(a, 0))
        result.append(entry)

    return {"weeks": result, "assignees": all_assignees}

# ── By area ────────────────────────────────────────────────────────────────────

@app.get("/api/sessions/{sid}/by-area")
def by_area(
    sid: str,
    date_from:    Optional[str] = None,
    date_to:      Optional[str] = None,
    team:         Optional[str] = None,
    sub_category: Optional[str] = None,
    assigned_to:  Optional[str] = None,
):
    df = _get_session(sid)
    if "area" not in df.columns:
        return []
    tmp = _filter_by_range(df, "created_date", date_from, date_to)
    tmp = _apply_dim_filters(tmp, assigned_to=assigned_to, team=team, sub_category=sub_category)
    counts = tmp.dropna(subset=["area"]).groupby("area").size().reset_index(name="count")
    return [{"area": r["area"], "count": int(r["count"])} for _, r in counts.sort_values("count", ascending=False).iterrows()]

# ── By team ────────────────────────────────────────────────────────────────────

@app.get("/api/sessions/{sid}/by-team")
def by_team(
    sid: str,
    date_from:    Optional[str] = None,
    date_to:      Optional[str] = None,
    area:         Optional[str] = None,
    sub_category: Optional[str] = None,
    assigned_to:  Optional[str] = None,
):
    df = _get_session(sid)
    if "team" not in df.columns:
        return []
    tmp = _filter_by_range(df, "created_date", date_from, date_to)
    tmp = _apply_dim_filters(tmp, assigned_to=assigned_to, area=area, sub_category=sub_category)
    counts = tmp.dropna(subset=["team"]).groupby("team").size().reset_index(name="count")
    return [{"team": r["team"], "count": int(r["count"])} for _, r in counts.sort_values("count", ascending=False).iterrows()]

# ── By assignee ────────────────────────────────────────────────────────────────

@app.get("/api/sessions/{sid}/by-assignee")
def by_assignee(
    sid: str,
    date_from:    Optional[str] = None,
    date_to:      Optional[str] = None,
    team:         Optional[str] = None,
    area:         Optional[str] = None,
    sub_category: Optional[str] = None,
):
    df = _get_session(sid)
    if "assigned_to" not in df.columns:
        return []
    tmp = _filter_by_range(df, "created_date", date_from, date_to)
    tmp = _apply_dim_filters(tmp, team=team, area=area, sub_category=sub_category)
    counts = tmp.dropna(subset=["assigned_to"]).groupby("assigned_to").size().reset_index(name="count")
    return [{"assigned_to": r["assigned_to"], "count": int(r["count"])} for _, r in counts.sort_values("count", ascending=False).iterrows()]

# ── By creator ─────────────────────────────────────────────────────────────────

@app.get("/api/sessions/{sid}/by-creator")
def by_creator(
    sid: str,
    date_from:    Optional[str] = None,
    date_to:      Optional[str] = None,
    team:         Optional[str] = None,
    area:         Optional[str] = None,
    sub_category: Optional[str] = None,
):
    df = _get_session(sid)
    if "ticket_creator" not in df.columns:
        return []
    tmp = _filter_by_range(df, "created_date", date_from, date_to)
    tmp = _apply_dim_filters(tmp, team=team, area=area, sub_category=sub_category)
    counts = (
        tmp.dropna(subset=["ticket_creator"])
        .groupby("ticket_creator").size()
        .reset_index(name="count")
        .sort_values("count", ascending=False)
    )
    return [{"creator": r["ticket_creator"], "count": int(r["count"])} for _, r in counts.iterrows()]

# ── Inflow vs Outflow ──────────────────────────────────────────────────────────

def _fill_period_gaps(periods: dict, freq: str, group_by: str,
                      date_from: Optional[str], date_to: Optional[str], blank) -> None:
    """Insert zero-filled entries for periods that saw no activity.

    groupby only yields periods that actually contain rows, so a week where
    nothing was assigned and nothing was resolved disappears from the series
    entirely — the table then jumps straight from one busy week to the next and
    a quiet stretch reads as though it never happened. That matters most when
    filtering to one person, where the gaps are the point.

    The span is the date filter when one is set (so an explicitly chosen range
    shows all of its weeks, including empty ones at either end), otherwise the
    first to last period that has data.
    """
    observed = sorted(periods)
    lo = date_from or (observed[0] if observed else None)
    hi = date_to or (observed[-1] if observed else None)
    if not lo or not hi:
        return
    try:
        rng = pd.period_range(start=pd.Timestamp(lo), end=pd.Timestamp(hi), freq=freq)
    except Exception:
        return
    for p in rng:
        d = p.start_time.date()
        periods.setdefault(str(d), blank(str(d), d))


@app.get("/api/sessions/{sid}/inflow-outflow")
def inflow_outflow(
    sid: str,
    date_from:    Optional[str] = None,
    date_to:      Optional[str] = None,
    group_by: str = Query("week", pattern="^(week|month)$"),
    assigned_to:  Optional[str] = None,
    team:         Optional[str] = None,
    area:         Optional[str] = None,
    sub_category: Optional[str] = None,
):
    df = _get_session(sid)
    df = _apply_dim_filters(df, assigned_to=assigned_to, team=team, area=area, sub_category=sub_category)

    periods: dict[str, dict] = {}
    freq = "W" if group_by == "week" else "M"

    def _blank(k, p):
        return {"period": k, "label": _period_label(p, group_by),
                "inflow": 0, "outflow": 0, "closed_completed": 0, "closed_rejected": 0}

    if "created_date" in df.columns:
        tmp = _filter_by_range(df, "created_date", date_from, date_to).dropna(subset=["created_date"]).copy()
        tmp["_p"] = tmp["created_date"].dt.to_period(freq).apply(lambda p: p.start_time.date())
        for p, grp in tmp.groupby("_p"):
            k = str(p)
            periods.setdefault(k, _blank(k, p))
            periods[k]["inflow"] = int(len(grp))

    if "closed_date" in df.columns:
        tmp = _filter_by_range(df, "closed_date", date_from, date_to).dropna(subset=["closed_date"]).copy()
        tmp["_p"] = tmp["closed_date"].dt.to_period(freq).apply(lambda p: p.start_time.date())
        has_state = "state" in tmp.columns
        for p, grp in tmp.groupby("_p"):
            k = str(p)
            periods.setdefault(k, _blank(k, p))
            periods[k]["outflow"] = int(len(grp))
            if has_state:
                periods[k]["closed_completed"] = int(grp["state"].isin(["Closed Completed", "Confirmation Completed"]).sum())
                periods[k]["closed_rejected"]  = int(grp["state"].isin(["Closed Rejected"]).sum())

    _fill_period_gaps(periods, freq, group_by, date_from, date_to, _blank)

    result = sorted(periods.values(), key=lambda x: x["period"])
    for r in result:
        r["net"] = r["inflow"] - r["outflow"]

    # Open pipeline snapshot at end of each period.
    # A ticket was in the pipeline at period-end if:
    #   (a) it has a closed_date that is AFTER period-end  (was resolved later), OR
    #   (b) it has NO closed_date AND its current state is not a closed state
    #       (handles tickets in closed states that were never given a closed_date)
    # Tickets created after period-end are excluded.
    # Uses the full dimension-filtered df so tickets created before the date-range
    # filter are still counted if they were open at a given period.
    has_created = "created_date" in df.columns
    has_closed  = "closed_date"  in df.columns
    has_state   = "state"        in df.columns

    for r in result:
        p_start = date.fromisoformat(r["period"])
        p_end   = p_start + timedelta(days=6) if group_by == "week" \
                  else (pd.Timestamp(p_start) + pd.offsets.MonthEnd(0)).date()

        p_end_ts = pd.Timestamp(p_end) + pd.Timedelta(days=1)  # exclusive upper bound (start of next day)

        if not has_created:
            r["open_pipeline"] = 0
            r["pipeline_stages"] = {}
            continue

        # Compare Timestamps directly — avoids None from .dt.date for NaT rows
        created_by_end = df["created_date"].notna() & (df["created_date"] < p_end_ts)

        if has_closed:
            # Closed later → was in pipeline at p_end
            closed_after = df["closed_date"].notna() & (df["closed_date"] >= p_end_ts)
            # No closed_date → use state to decide (exclude known closed states)
            if has_state:
                no_date_active = df["closed_date"].isna() & ~df["state"].isin(EXCLUDED_STATES)
            else:
                no_date_active = df["closed_date"].isna()
            in_pipeline = closed_after | no_date_active
        elif has_state:
            in_pipeline = ~df["state"].isin(EXCLUDED_STATES)
        else:
            in_pipeline = pd.Series(True, index=df.index)

        mask = created_by_end & in_pipeline
        r["open_pipeline"] = int(mask.sum())

        # Stage breakdown of the pipeline snapshot. Tickets that have since
        # reached a closed state (they were open at p_end but resolved later)
        # are grouped under "Resolved Later" — their current state no longer
        # reflects where they sat in the pipeline at the time.
        if has_state:
            stages = df["state"].where(~df["state"].isin(EXCLUDED_STATES), "Resolved Later")
            counts = stages[mask].fillna("Unspecified").value_counts()
            r["pipeline_stages"] = {str(s): int(c) for s, c in counts.items()}
        else:
            r["pipeline_stages"] = {}

    return result


@app.get("/api/sessions/{sid}/inflow-outflow/export")
def inflow_outflow_export(
    sid: str,
    date_from:    Optional[str] = None,
    date_to:      Optional[str] = None,
    group_by: str = Query("week", pattern="^(week|month)$"),
    assigned_to:  Optional[str] = None,
    team:         Optional[str] = None,
    area:         Optional[str] = None,
    sub_category: Optional[str] = None,
):
    """Return an xlsx file with Assigned / Resolved / Resolution Rate rows per period."""
    df = _get_session(sid)
    df = _apply_dim_filters(df, assigned_to=assigned_to, team=team, area=area, sub_category=sub_category)

    periods: dict[str, dict] = {}
    freq = "W" if group_by == "week" else "M"

    if "created_date" in df.columns:
        tmp = _filter_by_range(df, "created_date", date_from, date_to).dropna(subset=["created_date"]).copy()
        tmp["_p"] = tmp["created_date"].dt.to_period(freq).apply(lambda p: p.start_time.date())
        for p, grp in tmp.groupby("_p"):
            k = str(p)
            periods.setdefault(k, {"period": k, "label": _period_label(p, group_by), "inflow": 0, "outflow": 0})
            periods[k]["inflow"] = int(len(grp))

    if "closed_date" in df.columns:
        tmp = _filter_by_range(df, "closed_date", date_from, date_to).dropna(subset=["closed_date"]).copy()
        tmp["_p"] = tmp["closed_date"].dt.to_period(freq).apply(lambda p: p.start_time.date())
        for p, grp in tmp.groupby("_p"):
            k = str(p)
            periods.setdefault(k, {"period": k, "label": _period_label(p, group_by), "inflow": 0, "outflow": 0})
            periods[k]["outflow"] = int(len(grp))

    # Same zero-fill as the on-screen table, so the export matches what was seen.
    _fill_period_gaps(
        periods, freq, group_by, date_from, date_to,
        lambda k, p: {"period": k, "label": _period_label(p, group_by), "inflow": 0, "outflow": 0},
    )

    sorted_periods = sorted(periods.values(), key=lambda x: x["period"])
    period_labels = [r["label"]   for r in sorted_periods]
    inflows       = [r["inflow"]  for r in sorted_periods]
    outflows      = [r["outflow"] for r in sorted_periods]
    rates         = [
        round(outflows[i] / max(inflows[i], 1) * 100, 1) if (inflows[i] > 0 or outflows[i] > 0) else None
        for i in range(len(sorted_periods))
    ]

    total_in   = sum(inflows)
    total_out  = sum(outflows)
    total_rate = round(total_out / max(total_in, 1) * 100, 1) if (total_in > 0 or total_out > 0) else None

    # Open pipeline snapshot per period (same logic as the main endpoint)
    has_created = "created_date" in df.columns
    has_closed  = "closed_date"  in df.columns
    has_state   = "state"        in df.columns
    pipelines   = []
    for r in sorted_periods:
        p_start = date.fromisoformat(r["period"])
        p_end   = p_start + timedelta(days=6) if group_by == "week" \
                  else (pd.Timestamp(p_start) + pd.offsets.MonthEnd(0)).date()
        if not has_created:
            pipelines.append(0)
            continue
        p_end_ts = pd.Timestamp(p_end) + pd.Timedelta(days=1)
        created_by_end = df["created_date"].notna() & (df["created_date"] < p_end_ts)
        if has_closed:
            closed_after   = df["closed_date"].notna() & (df["closed_date"] >= p_end_ts)
            no_date_active = df["closed_date"].isna() & (~df["state"].isin(EXCLUDED_STATES) if has_state else True)
            in_pipeline    = closed_after | no_date_active
        elif has_state:
            in_pipeline    = ~df["state"].isin(EXCLUDED_STATES)
        else:
            in_pipeline    = pd.Series(True, index=df.index)
        pipelines.append(int((created_by_end & in_pipeline).sum()))

    # Derive display name from active filter
    if assigned_to:
        name = assigned_to
    elif team:
        name = f"Team: {team}"
    elif area:
        name = f"Area: {area}"
    elif sub_category:
        name = sub_category
    else:
        name = "All"

    # Build xlsx in memory
    buf = io.BytesIO()
    wb  = xlsxwriter.Workbook(buf, {"in_memory": True})
    ws  = wb.add_worksheet("Inflow vs Outflow")

    # ── Base formats
    hdr_fmt  = wb.add_format({"bold": True, "bg_color": "#1450f5", "font_color": "#ffffff",
                               "border": 1, "align": "center", "valign": "vcenter"})
    name_fmt = wb.add_format({"bold": True, "font_size": 12, "valign": "vcenter"})
    lbl_fmt  = wb.add_format({"bold": True, "font_color": "#374151", "valign": "vcenter"})
    num_fmt  = wb.add_format({"num_format": "#,##0", "align": "center", "valign": "vcenter"})
    tot_fmt  = wb.add_format({"bold": True, "num_format": "#,##0", "bg_color": "#f0f4ff",
                               "align": "center", "valign": "vcenter"})
    blank_fmt= wb.add_format({"valign": "vcenter"})

    # ── Resolution-rate conditional formats (cell + total column)
    def _rate_fmt(bg, fg):
        return wb.add_format({"bold": True, "num_format": '0.0"%"',
                               "bg_color": bg, "font_color": fg,
                               "align": "center", "valign": "vcenter"})

    rate_fmts = [
        (50,  _rate_fmt("#fee2e2", "#991b1b")),   # < 50  → dark red
        (80,  _rate_fmt("#fecaca", "#dc2626")),   # 50-80 → light red
        (100, _rate_fmt("#fef9c3", "#854d0e")),   # 80-99 → yellow
        (150, _rate_fmt("#dcfce7", "#15803d")),   # 100-150 → green
        (None,_rate_fmt("#bbf7d0", "#14532d")),   # > 150 → dark green
    ]

    def _pick_rate_fmt(v):
        if v is None:
            return blank_fmt
        for threshold, fmt in rate_fmts:
            if threshold is None or v < threshold:
                return fmt
        return rate_fmts[-1][1]

    # ── Column widths
    ws.set_column(0, 0, 26)                           # Name
    ws.set_column(1, 1, 18)                           # Metric
    ws.set_column(2, 2, 10)                           # Total
    ws.set_column(3, 3 + len(period_labels), 14)      # Period columns
    ws.set_row(0, 22)

    # ── Header row (row 0)
    ws.write(0, 0, "Name",   hdr_fmt)
    ws.write(0, 1, "Metric", hdr_fmt)
    ws.write(0, 2, "Total",  hdr_fmt)
    for ci, lbl in enumerate(period_labels):
        ws.write(0, 3 + ci, lbl, hdr_fmt)

    # ── Assigned row (row 1)
    ws.write(1, 0, name,       name_fmt)
    ws.write(1, 1, "Assigned", lbl_fmt)
    ws.write(1, 2, total_in,   tot_fmt)
    for ci, v in enumerate(inflows):
        ws.write(1, 3 + ci, v, num_fmt)

    # ── Resolved row (row 2)
    ws.write(2, 0, "", blank_fmt)
    ws.write(2, 1, "Resolved", lbl_fmt)
    ws.write(2, 2, total_out,  tot_fmt)
    for ci, v in enumerate(outflows):
        ws.write(2, 3 + ci, v, num_fmt)

    # ── Resolution Rate row (row 3) — colour-coded cells
    ws.write(3, 0, "", blank_fmt)
    ws.write(3, 1, "Resolution Rate", lbl_fmt)
    ws.write(3, 2, total_rate if total_rate is not None else "", _pick_rate_fmt(total_rate))
    for ci, v in enumerate(rates):
        ws.write(3, 3 + ci, v if v is not None else "", _pick_rate_fmt(v))

    # ── Open Pipeline row (row 4) — colour-coded by direction
    def _pipe_fmt(val, prev):
        if val is None:
            return blank_fmt
        if prev is not None and val < prev:
            return wb.add_format({"bold": True, "num_format": "#,##0", "align": "center",
                                  "valign": "vcenter", "bg_color": "#dcfce7", "font_color": "#15803d"})
        if prev is not None and val > prev:
            return wb.add_format({"bold": True, "num_format": "#,##0", "align": "center",
                                  "valign": "vcenter", "bg_color": "#fee2e2", "font_color": "#991b1b"})
        return wb.add_format({"bold": True, "num_format": "#,##0", "align": "center",
                              "valign": "vcenter", "bg_color": "#fef9c3", "font_color": "#854d0e"})

    pipe_lbl_fmt = wb.add_format({"bold": True, "font_color": "#b45309", "valign": "vcenter",
                                   "top": 2, "top_color": "#e5e8ef"})
    pipe_tot_fmt = wb.add_format({"bold": True, "num_format": "#,##0", "align": "center",
                                  "valign": "vcenter", "bg_color": "#fffbeb", "font_color": "#b45309",
                                  "top": 2, "top_color": "#e5e8ef", "italic": True})
    ws.write(4, 0, "",              wb.add_format({"top": 2, "top_color": "#e5e8ef"}))
    ws.write(4, 1, "Open Pipeline", pipe_lbl_fmt)
    ws.write(4, 2, pipelines[-1] if pipelines else "", pipe_tot_fmt)
    for ci, val in enumerate(pipelines):
        prev = pipelines[ci - 1] if ci > 0 else None
        ws.write(4, 3 + ci, val, _pipe_fmt(val, prev))

    wb.close()
    buf.seek(0)

    safe_name = name.replace(" ", "_").replace(":", "").lower()
    filename  = f"inflow_outflow_{safe_name}.xlsx"

    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/api/sessions/{sid}/inflow-outflow/projections")
def inflow_outflow_projections(
    sid: str,
    group_by: str = Query("week", pattern="^(week|month)$"),
    forecast_periods: int = Query(12, ge=1, le=52),
    assigned_to:  Optional[str] = None,
    team:         Optional[str] = None,
    area:         Optional[str] = None,
    sub_category: Optional[str] = None,
):
    """Generate inflow-outflow projections for upcoming periods by service."""
    df = _get_session(sid)
    df = _apply_dim_filters(df, assigned_to=assigned_to, team=team, area=area, sub_category=sub_category)

    freq = "W" if group_by == "week" else "M"
    periods: dict[str, dict] = {}

    # Collect historical data
    if "created_date" in df.columns:
        tmp = df.dropna(subset=["created_date"]).copy()
        tmp["_p"] = tmp["created_date"].dt.to_period(freq).apply(lambda p: p.start_time.date())
        for p, grp in tmp.groupby("_p"):
            k = str(p)
            periods.setdefault(k, {"period": k, "label": _period_label(p, group_by), "inflow": 0, "outflow": 0, "services": {}})
            periods[k]["inflow"] = int(len(grp))
            if "sub_category" in grp.columns:
                for sc in grp["sub_category"].dropna().unique():
                    sc_count = int((grp["sub_category"] == sc).sum())
                    if sc == "Demand Engagement Activations":
                        sc_list = list(DEMAND_ENGAGEMENT_SUBS)
                    else:
                        sc_list = [sc]
                    for cat in sc_list:
                        periods[k]["services"].setdefault(cat, {"inflow": 0, "outflow": 0})
                        periods[k]["services"][cat]["inflow"] += sc_count // len(sc_list)

    if "closed_date" in df.columns:
        tmp = df.dropna(subset=["closed_date"]).copy()
        tmp["_p"] = tmp["closed_date"].dt.to_period(freq).apply(lambda p: p.start_time.date())
        for p, grp in tmp.groupby("_p"):
            k = str(p)
            periods.setdefault(k, {"period": k, "label": _period_label(p, group_by), "inflow": 0, "outflow": 0, "services": {}})
            periods[k]["outflow"] = int(len(grp))
            if "sub_category" in grp.columns:
                for sc in grp["sub_category"].dropna().unique():
                    sc_count = int((grp["sub_category"] == sc).sum())
                    if sc == "Demand Engagement Activations":
                        sc_list = list(DEMAND_ENGAGEMENT_SUBS)
                    else:
                        sc_list = [sc]
                    for cat in sc_list:
                        periods[k]["services"].setdefault(cat, {"inflow": 0, "outflow": 0})
                        periods[k]["services"][cat]["outflow"] += sc_count // len(sc_list)

    sorted_periods = sorted(periods.values(), key=lambda x: x["period"])

    # Add Demand Engagement Activations aggregate to historical periods
    for period in sorted_periods:
        if all(s in period.get("services", {}) for s in DEMAND_ENGAGEMENT_SUBS):
            period["services"]["Demand Engagement Activations"] = {
                "inflow": sum(period["services"][s].get("inflow", 0) for s in DEMAND_ENGAGEMENT_SUBS),
                "outflow": sum(period["services"][s].get("outflow", 0) for s in DEMAND_ENGAGEMENT_SUBS),
            }

    # Calculate trends and project forward using numpy polyfit
    def _project_trend(values, forecast_count):
        if len(values) < 2:
            return [values[-1] if values else 0] * forecast_count
        try:
            x = np.arange(len(values), dtype=float)
            y = np.array(values, dtype=float)
            coeffs = np.polyfit(x, y, 1)
            future_x = np.arange(len(values), len(values) + forecast_count, dtype=float)
            predictions = np.polyval(coeffs, future_x)
            return [max(0, int(p)) for p in predictions]
        except Exception:
            avg_val = int(np.mean(values)) if len(values) > 0 else 0
            return [avg_val] * forecast_count

    # Build results with history + projections
    result = {
        "historical": sorted_periods,
        "projections": [],
        "by_service": {},
    }

    # Get all services
    all_services = set()
    for period in sorted_periods:
        all_services.update(period.get("services", {}).keys())

    # Project by service
    for service in sorted(all_services):
        inflows = [p["services"].get(service, {}).get("inflow", 0) for p in sorted_periods]
        outflows = [p["services"].get(service, {}).get("outflow", 0) for p in sorted_periods]

        inflow_proj = _project_trend(inflows, forecast_periods)
        outflow_proj = _project_trend(outflows, forecast_periods)

        result["by_service"][service] = {
            "historical_inflow": inflows,
            "historical_outflow": outflows,
            "projected_inflow": inflow_proj,
            "projected_outflow": outflow_proj,
        }

    # Add aggregate for Demand Engagement Activations
    if all(s in result["by_service"] for s in DEMAND_ENGAGEMENT_SUBS):
        dea_inflow_proj = [
            sum(result["by_service"][s]["projected_inflow"][i] for s in DEMAND_ENGAGEMENT_SUBS)
            for i in range(forecast_periods)
        ]
        dea_outflow_proj = [
            sum(result["by_service"][s]["projected_outflow"][i] for s in DEMAND_ENGAGEMENT_SUBS)
            for i in range(forecast_periods)
        ]
        dea_hist_inflow = [sum(p["services"].get(s, {}).get("inflow", 0) for s in DEMAND_ENGAGEMENT_SUBS) for p in sorted_periods]
        dea_hist_outflow = [sum(p["services"].get(s, {}).get("outflow", 0) for s in DEMAND_ENGAGEMENT_SUBS) for p in sorted_periods]
        result["by_service"]["Demand Engagement Activations"] = {
            "historical_inflow": dea_hist_inflow,
            "historical_outflow": dea_hist_outflow,
            "projected_inflow": dea_inflow_proj,
            "projected_outflow": dea_outflow_proj,
        }

    # Project overall
    inflows = [p["inflow"] for p in sorted_periods]
    outflows = [p["outflow"] for p in sorted_periods]
    inflow_proj = _project_trend(inflows, forecast_periods)
    outflow_proj = _project_trend(outflows, forecast_periods)

    # Generate projection periods with service breakdown
    last_period = date.fromisoformat(sorted_periods[-1]["period"]) if sorted_periods else date.today()
    for i in range(forecast_periods):
        if group_by == "week":
            proj_date = last_period + timedelta(weeks=i+1)
        else:
            if (last_period.month + i + 1) > 12:
                year_offset = (last_period.month + i) // 12
                month = (last_period.month + i) % 12 or 12
                proj_date = last_period.replace(year=last_period.year + year_offset, month=month, day=1)
            else:
                proj_date = last_period.replace(month=last_period.month + i + 1, day=1)

        # Build service breakdown for projected period
        services_proj = {}
        for service in sorted(all_services):
            inflow_val = result["by_service"][service]["projected_inflow"][i]
            outflow_val = result["by_service"][service]["projected_outflow"][i]
            services_proj[service] = {"inflow": inflow_val, "outflow": outflow_val}

        # Add Demand Engagement Activations aggregate if all sub-services exist
        if all(s in services_proj for s in DEMAND_ENGAGEMENT_SUBS):
            services_proj["Demand Engagement Activations"] = {
                "inflow": sum(services_proj[s]["inflow"] for s in DEMAND_ENGAGEMENT_SUBS),
                "outflow": sum(services_proj[s]["outflow"] for s in DEMAND_ENGAGEMENT_SUBS),
            }

        result["projections"].append({
            "period": str(proj_date),
            "label": _period_label(proj_date, group_by),
            "inflow": inflow_proj[i],
            "outflow": outflow_proj[i],
            "net": inflow_proj[i] - outflow_proj[i],
            "is_projected": True,
            "services": services_proj,
        })

    return result


# ── SLA performance ────────────────────────────────────────────────────────────

@app.get("/api/sessions/{sid}/sla-performance")
def sla_performance(
    sid: str,
    date_from:    Optional[str] = None,
    date_to:      Optional[str] = None,
    team:         Optional[str] = None,
    area:         Optional[str] = None,
    assigned_to:  Optional[str] = None,
    sub_category: Optional[str] = None,
):
    df = _get_session(sid)
    tmp = _filter_by_range(df, "created_date", date_from, date_to)
    tmp = _apply_dim_filters(tmp, assigned_to=assigned_to, team=team, area=area, sub_category=sub_category)

    CLOSED_STATES = {"Closed Completed", "Confirmation Completed"}
    result = []
    for sc in sorted(tmp["sub_category"].dropna().unique()):
        sc_df = tmp[tmp["sub_category"] == sc]
        closed = sc_df[sc_df["state"].isin(CLOSED_STATES)].dropna(subset=["closed_date", "sla_due_date"])
        on_time = int((closed["closed_date"] <= closed["sla_due_date"]).sum())
        late    = int((closed["closed_date"] >  closed["sla_due_date"]).sum())
        active  = sc_df[sc_df["is_active"]]
        on_track  = int((active["days_to_sla"].dropna() >= 0).sum())
        breached  = int((active["days_to_sla"].dropna() <  0).sum())
        result.append({
            "sub_category":    sc,
            "closed_on_time":  on_time,
            "closed_late":     late,
            "active_on_track": on_track,
            "active_breached": breached,
            "total_closed":    on_time + late,
        })
    return sorted(result, key=lambda x: x["total_closed"], reverse=True)

@app.get("/api/sessions/{sid}/sla-tickets")
def sla_tickets(
    sid: str,
    date_from:    Optional[str] = None,
    date_to:      Optional[str] = None,
    team:         Optional[str] = None,
    area:         Optional[str] = None,
    assigned_to:  Optional[str] = None,
    sub_category: Optional[str] = None,
    status:       Optional[str] = Query(None, pattern="^(on_time|late|breached|open)$"),
    limit:        int = 500,
):
    """Ticket-level detail behind the SLA compliance figures.

    Same filters as /sla-performance, so the rows here add up to the numbers on
    the KPI cards. Resolution is reported in WORKING days, since the SLA target
    is itself a working-day count — comparing the two in calendar days would
    make every ticket look late.
    """
    df = _get_session(sid)
    tmp = _filter_by_range(df, "created_date", date_from, date_to)
    tmp = _apply_dim_filters(tmp, assigned_to=assigned_to, team=team, area=area, sub_category=sub_category)

    CLOSED_STATES = {"Closed Completed", "Confirmation Completed"}
    has = lambda c: c in tmp.columns

    def _working_days(a, b):
        """Working days from a to b inclusive of the start day, matching
        add_working_days() where the creation day counts as Day 1."""
        if pd.isna(a) or pd.isna(b):
            return None
        n = int(np.busday_count(np.datetime64(a.date(), "D"),
                                np.datetime64(b.date(), "D"),
                                holidays=_HOLIDAY_DATES))
        return max(n + 1, 0)

    rows = []
    for _, r in tmp.iterrows():
        created = r.get("created_date")
        closed  = r.get("closed_date")
        due     = r.get("sla_due_date")
        state   = r.get("state")
        is_closed = bool(has("state") and pd.notna(state) and str(state) in CLOSED_STATES) and pd.notna(closed)

        if is_closed and pd.notna(due):
            row_status = "on_time" if closed <= due else "late"
        elif not is_closed:
            d2s = r.get("days_to_sla")
            row_status = "breached" if pd.notna(d2s) and d2s < 0 else "open"
        else:
            row_status = "open"           # closed but no SLA rule for its service

        taken = _working_days(created, closed) if is_closed else None
        target = _working_days(created, due) if pd.notna(due) else None

        rows.append({
            "ticket":       str(r.get("ticket_number") or "") or None,
            "description":  str(r.get("short_description") or "") or None,
            "sub_category": str(r.get("sub_category") or "") or None,
            "assigned_to":  str(r.get("assigned_to") or "") or None,
            "created_date": created.date().isoformat() if pd.notna(created) else None,
            "sla_due_date": due.date().isoformat()     if pd.notna(due)     else None,
            "closed_date":  closed.date().isoformat()  if is_closed         else None,
            "sla_target_days":    target,
            "working_days_taken": taken,
            # Positive = over the SLA allowance, negative = delivered early.
            "variance_days": (taken - target) if (taken is not None and target is not None) else None,
            "state":  str(state) if pd.notna(state) else None,
            "status": row_status,
        })

    # Counted before the status filter is applied, so the UI's tab counts stay
    # a breakdown of the whole set rather than collapsing to the active tab.
    counts = {k: sum(1 for r in rows if r["status"] == k)
              for k in ("on_time", "late", "breached", "open")}
    total = len(rows)

    if status:
        rows = [r for r in rows if r["status"] == status]

    # Worst breaches first, then the rest by most recently created.
    rows.sort(key=lambda r: (
        -(r["variance_days"] if r["variance_days"] is not None else -10**6),
        r["created_date"] or "",
    ))
    return {"total": total, "counts": counts,
            "truncated": len(rows) > limit, "rows": rows[:limit]}


# ── Resolution time ────────────────────────────────────────────────────────────

@app.get("/api/sessions/{sid}/resolution-time")
def resolution_time(
    sid: str,
    date_from:    Optional[str] = None,
    date_to:      Optional[str] = None,
    team:         Optional[str] = None,
    area:         Optional[str] = None,
    assigned_to:  Optional[str] = None,
    sub_category: Optional[str] = None,
):
    df = _get_session(sid)
    CLOSED_STATES = {"Closed Completed", "Confirmation Completed"}
    tmp = df[df["state"].isin(CLOSED_STATES)].copy()
    tmp = _filter_by_range(tmp, "closed_date", date_from, date_to)
    tmp = _apply_dim_filters(tmp, assigned_to=assigned_to, team=team, area=area, sub_category=sub_category)
    tmp = tmp.dropna(subset=["created_date", "closed_date"])
    tmp["resolution_days"] = (tmp["closed_date"] - tmp["created_date"]).dt.days.clip(lower=0)

    def _agg(grp_col, key):
        if grp_col not in tmp.columns or tmp.empty:
            return []
        agg = (
            tmp.groupby(grp_col)["resolution_days"]
            .agg(avg="mean", median="median", count="count")
            .reset_index()
            .sort_values("count", ascending=False)
        )
        return [
            {key: r[grp_col], "avg_days": round(float(r["avg"]), 1),
             "median_days": round(float(r["median"]), 1), "count": int(r["count"])}
            for _, r in agg.iterrows()
        ]

    return {
        "by_sub_category": _agg("sub_category", "sub_category"),
        "by_assignee":     _agg("assigned_to",  "assigned_to"),
        "by_team":         _agg("team",          "team"),
    }

# ── Priority tracker ───────────────────────────────────────────────────────────

@app.get("/api/sessions/{sid}/priority")
def priority_tracker(
    sid: str,
    assigned_to:  Optional[str] = None,
    sub_category: Optional[str] = None,
    state:        Optional[str] = None,
    team:         Optional[str] = None,
    limit: int = Query(500, le=2000),
):
    df = _get_session(sid)
    active = df[df["is_active"]].copy()

    if assigned_to:
        active = active[active.get("assigned_to",  pd.Series(dtype=str)) == assigned_to]
    if sub_category:
        active = active[active.get("sub_category", pd.Series(dtype=str)) == sub_category]
    if state:
        active = active[active.get("state",        pd.Series(dtype=str)) == state]
    if team:
        active = active[active.get("team",         pd.Series(dtype=str)) == team]

    active = active.sort_values("priority_score", ascending=False).head(limit)

    display_cols = [
        "ticket_number", "short_description", "assigned_to", "team", "state",
        "sub_category", "area", "ticket_creator",
        "created_date", "preferred_live_date", "sla_due_date", "due_date",
        "days_to_sla", "days_to_pld", "ticket_age",
        "priority_score", "priority_label", "tags",
    ]
    cols = [c for c in display_cols if c in active.columns]
    return df_to_records(active[cols])

# ── Export ─────────────────────────────────────────────────────────────────────

@app.get("/api/sessions/{sid}/export")
def export_data(
    sid: str,
    format: str = Query("csv", pattern="^(csv|excel)$"),
    assigned_to:  Optional[str] = None,
    sub_category: Optional[str] = None,
    state:        Optional[str] = None,
    team:         Optional[str] = None,
    include_inactive: bool = False,
):
    df = _get_session(sid)
    out = df.copy() if include_inactive else df[df["is_active"]].copy()

    if assigned_to:
        out = out[out.get("assigned_to",  pd.Series(dtype=str)) == assigned_to]
    if sub_category:
        out = out[out.get("sub_category", pd.Series(dtype=str)) == sub_category]
    if state:
        out = out[out.get("state",        pd.Series(dtype=str)) == state]
    if team:
        out = out[out.get("team",         pd.Series(dtype=str)) == team]

    out = out.drop(columns=[c for c in ["is_active"] if c in out.columns])

    if format == "csv":
        buf = io.StringIO()
        out.to_csv(buf, index=False)
        buf.seek(0)
        return StreamingResponse(
            iter([buf.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=tickets_export.csv"},
        )
    else:
        buf = io.BytesIO()
        with pd.ExcelWriter(buf, engine="xlsxwriter") as writer:
            out.to_excel(writer, index=False, sheet_name="Tickets")
        buf.seek(0)
        return StreamingResponse(
            iter([buf.read()]),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=tickets_export.xlsx"},
        )

# ── Team performance matrix ────────────────────────────────────────────────────

@app.get("/api/sessions/{sid}/team-performance")
def team_performance(
    sid: str,
    date_from: Optional[str] = None,
    date_to:   Optional[str] = None,
):
    df = _get_session(sid)
    CLOSED_STATES = {"Closed Completed", "Confirmation Completed"}
    if "assigned_to" not in df.columns:
        return []

    result = []
    for person in sorted(df["assigned_to"].dropna().unique()):
        pdf   = df[df["assigned_to"] == person]
        active = pdf[pdf["is_active"]]
        closed = pdf[pdf["state"].isin(CLOSED_STATES)]
        closed_period = _filter_by_range(closed, "closed_date", date_from, date_to)

        # SLA compliance (all time for the rate; period for closed-count)
        with_sla = closed.dropna(subset=["closed_date", "sla_due_date"])
        on_time  = int((with_sla["closed_date"] <= with_sla["sla_due_date"]).sum())
        total_cls = len(with_sla)
        sla_pct  = round(on_time / total_cls * 100, 1) if total_cls > 0 else None

        # Avg resolution (calendar days created→closed)
        res = closed.dropna(subset=["created_date", "closed_date"]).copy()
        avg_res = None
        if len(res):
            res["rd"] = (res["closed_date"] - res["created_date"]).dt.days.clip(lower=0)
            avg_res = round(float(res["rd"].mean()), 1)

        overdue  = int((active["days_to_sla"].dropna() < 0).sum())
        critical = int(active["priority_label"].isin({"Overdue", "Critical"}).sum())

        result.append({
            "assigned_to":         person,
            "active":              int(len(active)),
            "overdue":             overdue,
            "critical":            critical,
            "closed_total":        int(len(closed)),
            "closed_in_period":    int(len(closed_period)),
            "sla_compliance_pct":  sla_pct,
            "avg_resolution_days": avg_res,
        })

    return sorted(result, key=lambda x: (-(x["overdue"] or 0), -(x["active"] or 0)))


# ── Backlog age distribution ────────────────────────────────────────────────────

@app.get("/api/sessions/{sid}/backlog-age")
def backlog_age(sid: str):
    df = _get_session(sid)
    active = df[df["is_active"]].copy()
    active["ticket_age"] = pd.to_numeric(active.get("ticket_age", pd.Series()), errors="coerce")

    BUCKETS = [
        ("0–7 days",   0,   7,  "#d2f5ff"),
        ("8–30 days",  8,  30,  "#ffe141"),
        ("31–90 days", 31, 90,  "#ffcdd7"),
        ("91+ days",   91, None, "#c0305a"),
    ]
    result = []
    for label, lo, hi, color in BUCKETS:
        if hi is None:
            count = int((active["ticket_age"] >= lo).sum())
        else:
            count = int(((active["ticket_age"] >= lo) & (active["ticket_age"] <= hi)).sum())
        result.append({"label": label, "count": count, "color": color})
    return result


# ── Bandwidth config ──────────────────────────────────────────────────────────

def _effective_cap() -> dict:
    """Return CAPACITY_SETTINGS resolved to the active preset (if not annual)."""
    mode = CAPACITY_SETTINGS.get("mode", "annual")
    if mode == "annual":
        return CAPACITY_SETTINGS
    preset = CAPACITY_SETTINGS.get("presets", {}).get(mode)
    if not preset:
        return CAPACITY_SETTINGS
    return {
        **CAPACITY_SETTINGS,
        "default_working_days": preset.get("default_working_days") or CAPACITY_SETTINGS.get("default_working_days", 250),
        "default_holidays":     preset.get("default_holidays")     or CAPACITY_SETTINGS.get("default_holidays", 24),
    }


@app.get("/api/capacity-settings")
def get_capacity_settings():
    return CAPACITY_SETTINGS

@app.put("/api/capacity-settings")
def update_capacity_settings(settings: dict):
    CAPACITY_SETTINGS.clear()
    CAPACITY_SETTINGS.update(settings)
    _save_setting("capacity_settings", dict(CAPACITY_SETTINGS))
    return CAPACITY_SETTINGS


@app.get("/api/bandwidth-rates")
def get_bandwidth_rates():
    return BANDWIDTH_RATES

@app.put("/api/bandwidth-rates")
def update_bandwidth_rates(rates: dict[str, float]):
    BANDWIDTH_RATES.clear()
    BANDWIDTH_RATES.update(rates)
    _save_setting("bandwidth_rates", dict(BANDWIDTH_RATES))
    return {"message": "Bandwidth rates updated", "rates": BANDWIDTH_RATES}


# ── Bandwidth tracker ──────────────────────────────────────────────────────────

@app.get("/api/sessions/{sid}/bandwidth")
def bandwidth_tracker(sid: str):
    df = _get_session(sid)
    if "assigned_to" not in df.columns:
        return {"members": [], "rates": BANDWIDTH_RATES, "weekly_capacity": BANDWIDTH_WEEKLY_CAPACITY}

    active = df[df["is_active"]].copy()
    hours_per_ticket = {sc: BANDWIDTH_HOURS_PER_DAY / rate for sc, rate in BANDWIDTH_RATES.items()}

    members = []
    for person in sorted(active["assigned_to"].dropna().unique()):
        pdf = active[active["assigned_to"] == person]

        breakdown: dict[str, int] = {}
        committed = 0.0
        for sc, hpt in hours_per_ticket.items():
            cnt = int((pdf["sub_category"] == sc).sum())
            if cnt:
                breakdown[sc] = cnt
                committed += cnt * hpt

        tracked_count   = sum(breakdown.values())
        untracked_count = int(len(pdf)) - tracked_count
        load_pct        = round(committed / BANDWIDTH_WEEKLY_CAPACITY * 100, 1)
        available_h     = max(0.0, round(BANDWIDTH_WEEKLY_CAPACITY - committed, 1))

        capacity_by_type = {sc: round(available_h / hpt, 1) for sc, hpt in hours_per_ticket.items()}

        avg_hpt          = (committed / tracked_count) if tracked_count else BANDWIDTH_HOURS_PER_DAY
        additional_total = round(available_h / avg_hpt, 1) if avg_hpt else 0.0

        if load_pct < 60:
            status = "Available"
        elif load_pct <= 85:
            status = "Busy"
        else:
            status = "Overloaded"

        members.append({
            "assigned_to":       person,
            "active_tickets":    int(len(pdf)),
            "tracked_tickets":   tracked_count,
            "untracked_tickets": untracked_count,
            "ticket_breakdown":  breakdown,
            "committed_hours":   round(committed, 1),
            "available_hours":   available_h,
            "load_pct":          load_pct,
            "additional_total":  additional_total,
            "capacity_by_type":  capacity_by_type,
            "status":            status,
        })

    members.sort(key=lambda x: x["load_pct"], reverse=True)

    return {
        "members":          members,
        "rates":            BANDWIDTH_RATES,
        "hours_per_ticket": {sc: round(h, 2) for sc, h in hours_per_ticket.items()},
        "weekly_capacity":  BANDWIDTH_WEEKLY_CAPACITY,
    }


# ── Utility Rate ───────────────────────────────────────────────────────────────

# Sub-services that are merged into "Demand Engagement Activations" on the UI
DEMAND_ENGAGEMENT_SUBS = {
    "Demand Creation – Global",
    "Email – Local",
    "Retention – Activations",
}

# BAU services displayed on the Utility Rate page (DEA is the merged view)
BAU_SERVICES_DISPLAY = [
    "Website Content Management",
    "Demand Engagement Activations",
    "Content Production – Graphic Design",
]

# Display-name rename applied to Area values on the Feedback tab (sheet/ticket
# data says "EU", the org calls it "EUR")
AREA_RENAME = {"EU": "EUR"}


@app.get("/api/sessions/{sid}/utility-rate")
def utility_rate(
    sid: str,
    date_from:   Optional[str] = None,
    date_to:     Optional[str] = None,
    assigned_to: Optional[str] = None,
    service:     Optional[str] = None,   # one of BAU_SERVICES_DISPLAY or ""
    mode:        str = "all",            # "all" | "closed"
):
    df = _get_session(sid)

    filter_options: dict = {
        "assignees": sorted(df["assigned_to"].dropna().unique().tolist()) if "assigned_to" in df.columns else [],
    }

    CLOSED_STATES = {"Closed Completed", "Confirmation Completed"}
    date_col = "closed_date" if mode == "closed" else "created_date"

    filtered = _filter_by_range(df, date_col, date_from, date_to)
    if mode == "closed" and "state" in filtered.columns:
        filtered = filtered[filtered["state"].isin(CLOSED_STATES)]
    filtered = _apply_dim_filters(filtered, assigned_to=assigned_to)

    # Apply service filter — "Demand Engagement Activations" maps to its 3 sub-services
    if service and "sub_category" in filtered.columns:
        if service == "Demand Engagement Activations":
            filtered = filtered[filtered["sub_category"].isin(DEMAND_ENGAGEMENT_SUBS)]
        else:
            filtered = filtered[filtered["sub_category"] == service]

    # hours_per_ticket for the 5 raw sub-categories (DEA merged rate stored separately)
    raw_hpt = {sc: BANDWIDTH_HOURS_PER_DAY / rate for sc, rate in BANDWIDTH_RATES.items()
               if sc != "Demand Engagement Activations"}
    dea_hpt = BANDWIDTH_HOURS_PER_DAY / BANDWIDTH_RATES.get("Demand Engagement Activations", 0.63)

    # ── Span calculation ──────────────────────────────────────────────────────
    if date_from and date_to:
        try:
            span_days = (pd.Timestamp(date_to) - pd.Timestamp(date_from)).days + 1
        except Exception:
            span_days = 7
    elif date_col in filtered.columns and len(filtered) > 0:
        cd = filtered[date_col].dropna()
        span_days = max(int((cd.max() - cd.min()).days) + 1, 1) if len(cd) > 1 else 7
    else:
        span_days = 7
    span_weeks = max(span_days / 7.0, 1.0)

    def _sub_hours(sub_cat_series) -> float:
        """Estimate committed hours for a Series of sub_category values."""
        total = 0.0
        for sc, hpt in raw_hpt.items():
            total += int((sub_cat_series == sc).sum()) * hpt
        return total

    # ── By service (BAU display view — DEA merged) ────────────────────────────
    by_service = []
    if "sub_category" in filtered.columns:
        for svc in BAU_SERVICES_DISPLAY:
            if svc == "Demand Engagement Activations":
                mask = filtered["sub_category"].isin(DEMAND_ENGAGEMENT_SUBS)
                cnt  = int(mask.sum())
                hrs  = round(cnt * dea_hpt, 1)
                hpt_val = round(dea_hpt, 2)
            else:
                cnt  = int((filtered["sub_category"] == svc).sum())
                hpt_val = round(raw_hpt.get(svc, 0), 2)
                hrs  = round(cnt * hpt_val, 1)
            by_service.append({
                "service":          svc,
                "tickets":          cnt,
                "hours_per_ticket": hpt_val,
                "committed_hours":  hrs,
            })

    # ── By assignee ───────────────────────────────────────────────────────────
    by_assignee: list[dict] = []
    if "assigned_to" in filtered.columns:
        people_in_data = sorted(filtered["assigned_to"].dropna().unique())
        for person in people_in_data:
            pdf = filtered[filtered["assigned_to"] == person]

            # Breakdown by raw sub-category for ticket detail
            breakdown: dict[str, int] = {}
            committed = 0.0
            if "sub_category" in pdf.columns:
                for sc, hpt in raw_hpt.items():
                    cnt = int((pdf["sub_category"] == sc).sum())
                    if cnt:
                        breakdown[sc] = cnt
                        committed += cnt * hpt
                # Merge DEA sub-categories into a single "Demand Engagement Activations" key
                # so the capacity planning table can match against BAU_SERVICES_DISPLAY
                dea_cnt = sum(breakdown.pop(sc, 0) for sc in DEMAND_ENGAGEMENT_SUBS)
                if dea_cnt:
                    breakdown["Demand Engagement Activations"] = dea_cnt

            # Capacity: productivity_days = (working_days - holidays) × 0.75
            _cap = _effective_cap()
            pcfg = _cap.get("people", {}).get(person, {})
            working_days = pcfg.get("working_days") or _cap.get("default_working_days", 250)
            holidays     = pcfg.get("holidays")     or _cap.get("default_holidays", 24)
            availability   = working_days - holidays
            productivity_days = availability * 0.75
            # Prorate to the selected period
            prod_days_period = productivity_days * (span_days / 365.0)
            individual_cap   = round(prod_days_period * BANDWIDTH_HOURS_PER_DAY, 1)
            individual_cap   = max(individual_cap, 1.0)

            util_pct = round(committed / individual_cap * 100, 1) if individual_cap > 0 else 0.0

            avg_days_to_close = None
            min_days_to_close = None
            max_days_to_close = None
            if mode == "closed" and "created_date" in pdf.columns and "closed_date" in pdf.columns:
                res = pdf.dropna(subset=["created_date", "closed_date"]).copy()
                if len(res):
                    res["_dtc"] = (res["closed_date"] - res["created_date"]).dt.days.clip(lower=0)
                    valid = res["_dtc"].dropna()
                    if len(valid):
                        avg_days_to_close = round(float(valid.mean()), 1)
                        min_days_to_close = int(valid.min())
                        max_days_to_close = int(valid.max())

            by_assignee.append({
                "assigned_to":         person,
                "total_tickets":       int(len(pdf)),
                "tracked_tickets":     sum(breakdown.values()),
                "breakdown":           breakdown,
                "committed_hours":     round(committed, 1),
                "capacity_hours":      individual_cap,
                "utility_pct":         util_pct,
                "status":              "Overloaded" if util_pct >= 85 else "Busy" if util_pct >= 60 else "Available",
                "productivity_days":   round(prod_days_period, 1),
                "avg_days_to_close":   avg_days_to_close,
                "min_days_to_close":   min_days_to_close,
                "max_days_to_close":   max_days_to_close,
            })
        by_assignee.sort(key=lambda x: x["utility_pct"], reverse=True)

    team_size = len(by_assignee)
    total_committed_h = round(sum(r["committed_hours"] for r in by_assignee), 1)
    total_capacity_h  = round(sum(r["capacity_hours"]  for r in by_assignee), 1)
    team_util_pct     = round(total_committed_h / total_capacity_h * 100, 1) if total_capacity_h > 0 else 0.0

    for sr in by_service:
        sr["team_util_pct"] = round(sr["committed_hours"] / total_capacity_h * 100, 1) if total_capacity_h > 0 else 0.0

    overall_avg_days_to_close = None
    if mode == "closed" and "created_date" in filtered.columns and "closed_date" in filtered.columns:
        res = filtered.dropna(subset=["created_date", "closed_date"]).copy()
        if len(res):
            res["_dtc"] = (res["closed_date"] - res["created_date"]).dt.days.clip(lower=0)
            valid = res["_dtc"].dropna()
            if len(valid):
                overall_avg_days_to_close = round(float(valid.mean()), 1)

    # ── Weekly trend ──────────────────────────────────────────────────────────
    weekly_trend: list[dict] = []
    if date_col in filtered.columns and "sub_category" in filtered.columns and len(filtered) > 0:
        tracked = filtered[filtered["sub_category"].isin(raw_hpt)].copy()
        if len(tracked) > 0:
            tracked["_week"]  = tracked[date_col].dt.to_period("W").apply(lambda p: p.start_time.date())
            tracked["_hours"] = tracked["sub_category"].map(raw_hpt)
            weekly_per_svc = tracked.groupby(["_week", "sub_category"])["_hours"].sum().reset_index()
            weekly_h = tracked.groupby("_week")["_hours"].sum()
            weekly_cap = team_size * BANDWIDTH_WEEKLY_CAPACITY if team_size > 0 else BANDWIDTH_WEEKLY_CAPACITY
            svc_weekly: dict = {}
            for _, row in weekly_per_svc.iterrows():
                wk = str(row["_week"])
                svc_weekly.setdefault(wk, {})
                svc_weekly[wk][row["sub_category"]] = round(float(row["_hours"]), 1)

            weekly_dtc: dict = {}
            if mode == "closed" and "created_date" in tracked.columns and "closed_date" in tracked.columns:
                dtc_df = tracked.dropna(subset=["created_date", "closed_date"]).copy()
                if len(dtc_df):
                    dtc_df["_dtc"] = (dtc_df["closed_date"] - dtc_df["created_date"]).dt.days.clip(lower=0)
                    wk_dtc = dtc_df.groupby("_week")["_dtc"].mean()
                    weekly_dtc = {str(w): round(float(v), 1) for w, v in wk_dtc.items()}

            weekly_trend = [
                {
                    "week":              str(w),
                    "label":             _week_label(w),
                    "committed_hours":   round(float(h), 1),
                    "capacity_hours":    round(weekly_cap, 1),
                    "utility_pct":       round(float(h) / weekly_cap * 100, 1) if weekly_cap > 0 else 0.0,
                    "by_service":        svc_weekly.get(str(w), {}),
                    "avg_days_to_close": weekly_dtc.get(str(w)),
                }
                for w, h in weekly_h.sort_index().items()
            ]

    # ── By ticket ─────────────────────────────────────────────────────────────
    by_ticket: list[dict] = []
    if "sub_category" in filtered.columns:
        tracked_df = filtered[filtered["sub_category"].isin(raw_hpt)].copy()
        if len(tracked_df) > 0:
            tracked_df["_est_h"] = tracked_df["sub_category"].map(raw_hpt)
            for col in ["ticket_number", "short_description", "assigned_to", "state"]:
                if col not in tracked_df.columns:
                    tracked_df[col] = ""
            sort_col = "closed_date" if (mode == "closed" and "closed_date" in tracked_df.columns) else "created_date"
            tracked_df = tracked_df.sort_values(sort_col, ascending=False).head(500)
            has_dtc = mode == "closed" and "created_date" in tracked_df.columns and "closed_date" in tracked_df.columns
            rows_out = []
            for r in tracked_df.to_dict("records"):
                dtc = None
                if has_dtc:
                    cd  = r.get("created_date")
                    cld = r.get("closed_date")
                    if pd.notna(cd) and pd.notna(cld):
                        try:
                            dtc = max(0, int((pd.Timestamp(cld) - pd.Timestamp(cd)).days))
                        except Exception:
                            pass
                rows_out.append({
                    "ticket_number":     str(r.get("ticket_number", "")).strip(),
                    "short_description": str(r.get("short_description", ""))[:80].strip(),
                    "sub_category":      str(r.get("sub_category", "")),
                    "assigned_to":       str(r.get("assigned_to", "")).strip(),
                    "created_date":      str(r.get("created_date", ""))[:10],
                    "closed_date":       str(r.get("closed_date", ""))[:10] if has_dtc else None,
                    "state":             str(r.get("state", "")).strip(),
                    "estimated_hours":   round(float(r.get("_est_h", 0)), 2),
                    "days_to_close":     dtc,
                })
            by_ticket = rows_out

    return {
        "mode":                      mode,
        "span_days":                 span_days,
        "span_weeks":                round(span_weeks, 1),
        "team_size":                 team_size,
        "total_capacity_h":          total_capacity_h,
        "total_committed_h":         total_committed_h,
        "team_util_pct":             team_util_pct,
        "hours_per_ticket":          {sc: round(h, 2) for sc, h in raw_hpt.items()},
        "by_service":                by_service,
        "by_assignee":               by_assignee,
        "weekly_trend":              weekly_trend,
        "by_ticket":                 by_ticket,
        "filter_options":            filter_options,
        "overall_avg_days_to_close": overall_avg_days_to_close,
    }


# ── User ticket activity ───────────────────────────────────────────────────────

@app.get("/api/sessions/{sid}/user-activity")
def user_activity(
    sid: str,
    date_from:    Optional[str] = None,
    date_to:      Optional[str] = None,
    assigned_to:  Optional[str] = None,
    team:         Optional[str] = None,
    area:         Optional[str] = None,
    sub_category: Optional[str] = None,
):
    df = _get_session(sid)
    if "ticket_creator" not in df.columns or "created_date" not in df.columns:
        return []

    tmp = df.dropna(subset=["ticket_creator", "created_date"]).copy()
    if "area" in tmp.columns:
        tmp["area"] = tmp["area"].map(lambda a: AREA_RENAME.get(a, a) if pd.notna(a) else a)

    # "Days since" is measured from the END of the active date range, not from
    # today — same anchor as /user-metrics, so the two never disagree on screen.
    period_end = (
        pd.Timestamp(date_to).normalize() if date_to
        else pd.Timestamp(tmp["created_date"].max()).normalize() if not tmp.empty
        else pd.NaT
    )

    tmp = _apply_dim_filters(tmp, assigned_to, team, area, sub_category)
    tmp = _filter_by_range(tmp, "created_date", date_from, date_to)
    if tmp.empty or pd.isna(period_end):
        return []
    today = period_end.date()

    result = []
    for creator, grp in tmp.groupby("ticket_creator"):
        last_ts = grp["created_date"].max()
        last_d = last_ts.date() if isinstance(last_ts, (pd.Timestamp, datetime)) else last_ts
        days_since = (today - last_d).days

        team = None
        area = None
        if "team" in grp.columns:
            tc = grp["team"].dropna().value_counts()
            if len(tc):
                team = tc.index[0]
        if "area" in grp.columns:
            ac = grp["area"].dropna().value_counts()
            if len(ac):
                area = ac.index[0]

        if days_since < 28:
            tier = "Active"
        elif days_since <= 56:
            tier = "At Risk"
        else:
            tier = "Remove Access"

        service_breakdown: dict[str, int] = {}
        if "sub_category" in grp.columns:
            for sc in BANDWIDTH_RATES.keys():
                cnt = int((grp["sub_category"] == sc).sum())
                if cnt:
                    service_breakdown[sc] = cnt

        result.append({
            "creator": str(creator),
            "team": team,
            "area": area,
            "total_tickets": int(len(grp)),
            "last_ticket_date": last_ts.isoformat() if pd.notna(last_ts) else None,
            "days_since_last": int(days_since),
            "remove_access": days_since > 56,
            "engagement_tier": tier,
            "service_breakdown": service_breakdown,
        })

    return sorted(result, key=lambda x: x["days_since_last"], reverse=True)


# ── User Activity metrics: Reach / Volume / Lifecycle / Growth / Rates ────────

# Services actually offered — the real sub-categories, excluding the
# "Demand Engagement Activations" roll-up, which is an aggregate view of three
# of them rather than a service in its own right. Denominator for Service Adoption.
CANONICAL_SERVICES = [s for s in BANDWIDTH_RATES if s != "Demand Engagement Activations"]

# Lifecycle thresholds, in days since the user's most recent request measured
# from periodEnd. Mutually exclusive and collectively exhaustive over [0, ∞).
LIFECYCLE_ACTIVE_MAX  = 30   # Active:  0–30
LIFECYCLE_REGULAR_MAX = 90   # Regular: 31–90, Dormant: 91+

NEW_USER_WINDOW_DAYS = 90    # first-ever request within this many days of periodEnd
AT_RISK_MIN_DAYS     = 60    # At-Risk: last request 60–90 days ago…
AT_RISK_MAX_DAYS     = 90
AT_RISK_MIN_LIFETIME = 3     # …and ≥3 lifetime requests, i.e. previously regular

UNASSIGNED = "Unassigned"


def _safe_div(num, den, pct: bool = False, nd: int = 1):
    """None (the UI renders "—") rather than NaN/Infinity when the denominator is 0."""
    if not den:
        return None
    return round(float(num) / float(den) * (100 if pct else 1), nd)


@app.get("/api/sessions/{sid}/user-metrics")
def user_metrics(
    sid: str,
    date_from:    Optional[str] = None,
    date_to:      Optional[str] = None,
    assigned_to:  Optional[str] = None,
    team:         Optional[str] = None,
    area:         Optional[str] = None,
    sub_category: Optional[str] = None,
    top_n:        int = 10,
):
    """Every box on the User Activity page, computed in one pass over the data.

    All recency buckets are measured from `period_end` — the END of the active
    date range, NOT today. Filtering to Jan–Mar makes "last 30 days" mean the
    final 30 days of March. period_end is deliberately derived from the date
    filter (falling back to the newest request in the whole session), so
    changing a dimension filter never shifts the recency windows underneath it.
    """
    df = _get_session(sid)

    def _dim_lists(src: pd.DataFrame):
        """Filter-bar options — always from the unfiltered session, so choosing
        one value never empties the other dropdowns."""
        def _u(col):
            if col not in src.columns:
                return []
            return sorted({str(v).strip() for v in src[col].dropna() if str(v).strip()})
        areas = sorted({AREA_RENAME.get(a, a) for a in _u("area")})
        services = _u("sub_category")
        if any(s in services for s in DEMAND_ENGAGEMENT_SUBS) and "Demand Engagement Activations" not in services:
            services = sorted(services + ["Demand Engagement Activations"])
        return {
            "areas": areas,
            "fl_segments": _u("team"),
            "services": services,
            "users": _u("assigned_to"),
        }

    lists = _dim_lists(df)
    empty = {
        **lists,
        "period_end": None,
        "reach": {"global_teams": 0, "areas": 0, "frontlines": 0},
        "volume": {"total_requests": 0, "avg_per_user": None, "median_per_user": None},
        "lifecycle": {"active": [], "regular": [], "dormant": []},
        "growth": {"new_users": [], "top_requestors": [], "at_risk": [], "top_share_pct": None},
        "rates": {"utility_rate": None, "engagement_pct": None, "repeat_pct": None,
                  "service_adoption_pct": None, "services_used": 0,
                  "services_offered": len(CANONICAL_SERVICES)},
        "total_users": 0,
        "top_n": top_n,
    }

    if "ticket_creator" not in df.columns or "created_date" not in df.columns:
        return empty

    base = df.dropna(subset=["ticket_creator", "created_date"]).copy()
    if base.empty:
        return empty
    base["ticket_creator"] = base["ticket_creator"].astype(str).str.strip()
    base = base[base["ticket_creator"] != ""]
    if "area" in base.columns:
        base["area"] = base["area"].map(lambda a: AREA_RENAME.get(a, a) if pd.notna(a) else a)

    # period_end anchors every recency window. End of the date filter if one is
    # set; otherwise the newest request in the session (i.e. the implicit range end).
    if date_to:
        period_end = pd.Timestamp(date_to).normalize()
    else:
        period_end = pd.Timestamp(base["created_date"].max()).normalize()
    if pd.isna(period_end):
        return empty

    # Dimension filters apply to both scopes; the date range applies only to
    # `scoped`. `lifetime` is what makes "first-ever request" and "≥3 lifetime
    # requests" mean lifetime rather than in-range.
    lifetime = _apply_dim_filters(base, assigned_to, team, area, sub_category)
    scoped = _filter_by_range(lifetime, "created_date", date_from, date_to)
    if scoped.empty:
        return {**empty, "period_end": period_end.date().isoformat()}

    # ── Single pass: everything below is derived from these three groupbys ────
    g = scoped.groupby("ticket_creator", sort=False)
    counts = g.size()
    last_seen = g["created_date"].max()

    def _mode_by_user(src: pd.DataFrame, col: str) -> dict:
        if col not in src.columns:
            return {}
        sub = src.dropna(subset=[col])
        if sub.empty:
            return {}
        return sub.groupby("ticket_creator")[col].agg(
            lambda s: s.value_counts().index[0]
        ).to_dict()

    team_by_user = _mode_by_user(scoped, "team")
    area_by_user = _mode_by_user(scoped, "area")

    lg = lifetime.groupby("ticket_creator", sort=False)
    first_seen_all = lg["created_date"].min()
    lifetime_counts = lg.size()

    users = []
    for name, cnt in counts.items():
        last_ts = last_seen[name]
        days_since = int((period_end - pd.Timestamp(last_ts).normalize()).days)
        first_ts = first_seen_all.get(name)
        users.append({
            "user": name,
            "frontline": str(team_by_user.get(name) or UNASSIGNED),
            "area": str(area_by_user.get(name) or UNASSIGNED),
            "count": int(cnt),
            "days_since_last": days_since,
            "first_request_date": pd.Timestamp(first_ts).date().isoformat() if pd.notna(first_ts) else None,
            "lifetime_count": int(lifetime_counts.get(name, cnt)),
        })
    users.sort(key=lambda u: u["count"], reverse=True)

    total_users = len(users)
    total_requests = int(len(scoped))

    # ── Row 3: lifecycle segments — mutually exclusive, exhaustive ────────────
    active, regular, dormant = [], [], []
    for u in users:
        d = u["days_since_last"]
        (active if d <= LIFECYCLE_ACTIVE_MAX
         else regular if d <= LIFECYCLE_REGULAR_MAX
         else dormant).append(u)
    assert len(active) + len(regular) + len(dormant) == total_users, (
        f"lifecycle segments {len(active)}+{len(regular)}+{len(dormant)} "
        f"!= total_users {total_users}"
    )

    # ── Row 1: reach ─────────────────────────────────────────────────────────
    def _distinct(col):
        if col not in scoped.columns:
            return set()
        return {str(v).strip() for v in scoped[col].dropna() if str(v).strip()}

    areas_reached = _distinct("area")
    frontlines_reached = _distinct("team")
    if {"team", "area"} <= set(scoped.columns):
        global_teams = {
            str(v).strip()
            for v in scoped.loc[scoped["area"] == "Global", "team"].dropna()
            if str(v).strip()
        }
    else:
        global_teams = set()

    # ── Row 5: growth ────────────────────────────────────────────────────────
    new_cutoff = period_end - pd.Timedelta(days=NEW_USER_WINDOW_DAYS)
    new_users = sorted(
        (u for u in users
         if u["first_request_date"] and pd.Timestamp(u["first_request_date"]) >= new_cutoff),
        key=lambda u: (u["first_request_date"], u["count"]), reverse=True,
    )
    top_requestors = users[:top_n]
    at_risk = sorted(
        (u for u in users
         if AT_RISK_MIN_DAYS <= u["days_since_last"] <= AT_RISK_MAX_DAYS
         and u["lifetime_count"] >= AT_RISK_MIN_LIFETIME),
        key=lambda u: u["days_since_last"], reverse=True,
    )

    # ── Row 6: rates ─────────────────────────────────────────────────────────
    services_used = len(_distinct("sub_category") & set(CANONICAL_SERVICES))
    repeat_users = sum(1 for u in users if u["count"] >= 2)

    return {
        **lists,
        "period_end": period_end.date().isoformat(),
        "total_users": total_users,
        "top_n": top_n,
        "reach": {
            "global_teams": len(global_teams),
            "areas": len(areas_reached),
            "frontlines": len(frontlines_reached),
        },
        "volume": {
            "total_requests": total_requests,
            # Averaged over ALL users, not just active ones, so it's directly
            # comparable to the median beside it — that pairing is the whole
            # point of the box (it exposes heavy-requestor skew).
            "avg_per_user": _safe_div(total_requests, total_users),
            "median_per_user": (
                round(float(counts.median()), 1) if total_users else None
            ),
        },
        "lifecycle": {"active": active, "regular": regular, "dormant": dormant},
        "growth": {
            "new_users": new_users,
            "top_requestors": top_requestors,
            "at_risk": at_risk,
            # Share of all requests the top-N users account for — a far more
            # useful headline than "10", which is what a count would always read.
            "top_share_pct": _safe_div(
                sum(u["count"] for u in top_requestors), total_requests, pct=True, nd=0
            ),
        },
        "rates": {
            "utility_rate":         _safe_div(total_requests, len(active)),
            "engagement_pct":       _safe_div(len(active), total_users, pct=True, nd=0),
            "repeat_pct":           _safe_div(repeat_users, total_users, pct=True, nd=0),
            "service_adoption_pct": _safe_div(services_used, len(CANONICAL_SERVICES), pct=True, nd=0),
            "services_used":        services_used,
            "services_offered":     len(CANONICAL_SERVICES),
        },
    }


# ── SLA config ─────────────────────────────────────────────────────────────────

@app.get("/api/sla-rules")
def get_sla_rules():
    return SLA_RULES

@app.put("/api/sla-rules")
def update_sla_rules(rules: dict[str, int]):
    SLA_RULES.clear()
    SLA_RULES.update(rules)
    _save_setting("sla_rules", dict(SLA_RULES))
    return {"message": "SLA rules updated", "rules": SLA_RULES}


@app.get("/api/cadence-settings")
def get_cadence_settings():
    return CADENCE_SETTINGS

@app.put("/api/cadence-settings")
def update_cadence_settings(settings: dict):
    CADENCE_SETTINGS.clear()
    CADENCE_SETTINGS.update(settings)
    _save_setting("cadence_settings", dict(CADENCE_SETTINGS))
    return CADENCE_SETTINGS


@app.get("/api/training-settings")
def get_training_settings():
    return TRAINING_SETTINGS

@app.put("/api/training-settings")
def update_training_settings(settings: dict):
    TRAINING_SETTINGS.clear()
    TRAINING_SETTINGS.update(settings)
    _save_setting("training_settings", dict(TRAINING_SETTINGS))
    return TRAINING_SETTINGS

@app.get("/api/assignee-aliases")
def get_assignee_aliases():
    return ASSIGNEE_ALIASES

@app.put("/api/assignee-aliases")
def update_assignee_aliases(aliases: dict):
    ASSIGNEE_ALIASES.clear()
    ASSIGNEE_ALIASES.update(aliases)
    _save_setting("assignee_aliases", dict(ASSIGNEE_ALIASES))
    return ASSIGNEE_ALIASES

# ── Hub health ─────────────────────────────────────────────────────────────────

@app.get("/api/sessions/{sid}/hub-health")
def hub_health(
    sid: str,
    date_from:    Optional[str] = None,
    date_to:      Optional[str] = None,
    team:         Optional[str] = None,
    area:         Optional[str] = None,
    sub_category: Optional[str] = None,
    assigned_to:  Optional[str] = None,
):
    df  = _get_session(sid)
    tmp = _filter_by_range(df, "created_date", date_from, date_to)
    tmp = _apply_dim_filters(tmp, assigned_to=assigned_to, team=team, area=area, sub_category=sub_category)

    total = len(tmp)
    RESOLVED = {"Closed Completed", "Closed Rejected", "Confirmation Completed"}
    resolved  = int(tmp["state"].isin(RESOLVED).sum()) if "state" in tmp.columns else 0
    closed_completed = int(tmp["state"].isin({"Closed Completed", "Confirmation Completed"}).sum()) if "state" in tmp.columns else 0
    closed_rejected  = int((tmp["state"] == "Closed Rejected").sum()) if "state" in tmp.columns else 0
    active_ct = int(tmp["is_active"].sum())             if "is_active" in tmp.columns else 0
    unique    = int(tmp["ticket_number"].dropna().nunique()) if "ticket_number" in tmp.columns else total

    dependency = 0
    if "state" in tmp.columns:
        dependency = int(tmp["state"].fillna("").str.lower().str.contains("depend|block|hold").sum())

    by_state = []
    if "state" in tmp.columns:
        counts   = tmp.dropna(subset=["state"]).groupby("state").size().reset_index(name="count")
        by_state = [{"state": r["state"], "count": int(r["count"])}
                    for _, r in counts.sort_values("count", ascending=False).iterrows()]

    return {
        "total":            total,
        "resolved":         resolved,
        "closed_completed": closed_completed,
        "closed_rejected":  closed_rejected,
        "unique":           unique,
        "in_pipeline":      active_ct,
        "dependency":       dependency,
        "done_pct":         round(resolved / total * 100) if total > 0 else 0,
        "by_state":         by_state,
    }


# ── Marketing Hub monthly-sharing deck ────────────────────────────────────────
# Fills templates/marketing_hub_deck.pptx from the same figures the Dashboard
# already shows for the selected date range, plus editorial content (key
# requests picked from real tickets, stories, updates, way forward) chosen in
# the frontend's pre-generation review popup — those have no ticket-data
# source, so the popup is where the user writes/edits them before download.

@app.get("/api/sessions/{sid}/marketing-deck/candidates")
def marketing_deck_candidates(sid: str, date_from: str = Query(...), date_to: str = Query(...)):
    """Completed tickets in range, grouped by Key-Requests column, for the
    review popup to list as selectable/rewritable candidates."""
    if not date_from or not date_to:
        raise HTTPException(400, "Select a date range before generating the deck.")
    df = _get_session(sid)
    return compute_key_request_candidates(df, date_from, date_to)


class MarketingDeckBody(BaseModel):
    date_from: str
    date_to: str
    key_requests: Optional[dict] = None
    stories: Optional[List[dict]] = None
    updates: Optional[List[str]] = None
    way_forward: Optional[List[str]] = None


@app.post("/api/sessions/{sid}/marketing-deck")
def marketing_deck(sid: str, body: MarketingDeckBody):
    date_from, date_to = body.date_from, body.date_to
    if not date_from or not date_to:
        raise HTTPException(400, "Select a date range before generating the deck.")

    df = _get_session(sid)
    hh = hub_health(sid, date_from=date_from, date_to=date_to)
    fb = feedback_summary(date_from=date_from, date_to=date_to, sid=sid)

    today = date.today()
    generated_date = f"{today.day} {today.strftime('%B').upper()} {today.year}"

    overrides = {
        "key_requests": body.key_requests,
        "stories": body.stories,
        "updates": body.updates,
        "way_forward": body.way_forward,
    }
    tokens, bar_widths, hide_if_empty = compute_marketing_deck_tokens(df, hh, fb, date_from, date_to, generated_date, overrides)
    pptx_bytes = fill_pptx_template(TEMPLATE_PATH, tokens, bar_widths, hide_if_empty)

    safe_month = tokens["deck_month_year"].replace(" ", "_").replace("–", "-")
    filename = f"Marketing_Hub_Monthly_Sharing_{safe_month}.pptx"

    return StreamingResponse(
        io.BytesIO(pptx_bytes),
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── Generic stacked pivot helper ───────────────────────────────────────────────

def _stacked(df: pd.DataFrame, dim_col: str, top_n: int = 25) -> dict:
    if dim_col not in df.columns or "sub_category" not in df.columns:
        return {"rows": [], "sub_categories": []}
    tmp = df.dropna(subset=[dim_col, "sub_category"])
    if tmp.empty:
        return {"rows": [], "sub_categories": []}
    sub_cats = tmp.groupby("sub_category").size().nlargest(10).index.tolist()
    tmp2     = tmp[tmp["sub_category"].isin(sub_cats)]
    pivot    = tmp2.groupby([dim_col, "sub_category"]).size().unstack(fill_value=0)
    for sc in sub_cats:
        if sc not in pivot.columns:
            pivot[sc] = 0
    pivot["_t"] = pivot[sub_cats].sum(axis=1)
    pivot = pivot.sort_values("_t", ascending=False).head(top_n)[sub_cats]
    rows  = [{dim_col: str(dv), **{sc: int(row.get(sc, 0)) for sc in sub_cats}}
             for dv, row in pivot.iterrows()]
    return {"rows": rows, "sub_categories": sub_cats}


# ── Stacked by area ────────────────────────────────────────────────────────────

@app.get("/api/sessions/{sid}/stacked-by-area")
def stacked_by_area(
    sid: str,
    date_from:    Optional[str] = None,
    date_to:      Optional[str] = None,
    team:         Optional[str] = None,
    sub_category: Optional[str] = None,
    assigned_to:  Optional[str] = None,
):
    df  = _get_session(sid)
    tmp = _filter_by_range(df, "created_date", date_from, date_to)
    tmp = _apply_dim_filters(tmp, assigned_to=assigned_to, team=team, sub_category=sub_category)
    return _stacked(tmp, "area")


# ── Stacked by team ────────────────────────────────────────────────────────────

@app.get("/api/sessions/{sid}/stacked-by-team")
def stacked_by_team(
    sid: str,
    date_from:    Optional[str] = None,
    date_to:      Optional[str] = None,
    area:         Optional[str] = None,
    sub_category: Optional[str] = None,
    assigned_to:  Optional[str] = None,
):
    df  = _get_session(sid)
    tmp = _filter_by_range(df, "created_date", date_from, date_to)
    tmp = _apply_dim_filters(tmp, assigned_to=assigned_to, area=area, sub_category=sub_category)
    return _stacked(tmp, "team")


# ── Stacked by creator ─────────────────────────────────────────────────────────

@app.get("/api/sessions/{sid}/stacked-by-creator")
def stacked_by_creator(
    sid: str,
    date_from:    Optional[str] = None,
    date_to:      Optional[str] = None,
    area:         Optional[str] = None,
    team:         Optional[str] = None,
    sub_category: Optional[str] = None,
    assigned_to:  Optional[str] = None,
    top_n: int    = Query(20, ge=1, le=50),
):
    df  = _get_session(sid)
    tmp = _filter_by_range(df, "created_date", date_from, date_to)
    tmp = _apply_dim_filters(tmp, assigned_to=assigned_to, area=area, team=team, sub_category=sub_category)
    return _stacked(tmp, "ticket_creator", top_n=top_n)


# ── Resolved by specialist ─────────────────────────────────────────────────────

@app.get("/api/sessions/{sid}/resolved-by-specialist")
def resolved_by_specialist(
    sid: str,
    date_from:    Optional[str] = None,
    date_to:      Optional[str] = None,
    area:         Optional[str] = None,
    team:         Optional[str] = None,
    sub_category: Optional[str] = None,
):
    df = _get_session(sid)
    RESOLVED = {"Closed Completed", "Closed Rejected", "Confirmation Completed"}
    if "state" not in df.columns:
        return {"rows": [], "sub_categories": []}
    rdf = df[df["state"].isin(RESOLVED)].copy()
    rdf = _filter_by_range(rdf, "closed_date", date_from, date_to)
    rdf = _apply_dim_filters(rdf, area=area, team=team, sub_category=sub_category)
    return _stacked(rdf, "assigned_to")


# ── Monthly stacked (created × sub_category) ───────────────────────────────────

@app.get("/api/sessions/{sid}/monthly-stacked")
def monthly_stacked(
    sid: str,
    date_from:    Optional[str] = None,
    date_to:      Optional[str] = None,
    area:         Optional[str] = None,
    team:         Optional[str] = None,
    sub_category: Optional[str] = None,
    assigned_to:  Optional[str] = None,
):
    df = _get_session(sid)
    if "created_date" not in df.columns or "sub_category" not in df.columns:
        return {"rows": [], "sub_categories": []}
    tmp = _filter_by_range(df, "created_date", date_from, date_to)
    tmp = _apply_dim_filters(tmp, assigned_to=assigned_to, area=area, team=team, sub_category=sub_category)
    tmp = tmp.dropna(subset=["created_date", "sub_category"]).copy()
    if tmp.empty:
        return {"rows": [], "sub_categories": []}
    sub_cats = tmp.groupby("sub_category").size().nlargest(10).index.tolist()
    tmp2     = tmp[tmp["sub_category"].isin(sub_cats)].copy()
    tmp2["_m"] = tmp2["created_date"].dt.to_period("M")
    pivot = tmp2.groupby(["_m", "sub_category"]).size().unstack(fill_value=0)
    for sc in sub_cats:
        if sc not in pivot.columns:
            pivot[sc] = 0
    pivot = pivot[sub_cats]
    rows  = [{"month": str(m), "label": m.strftime("%b %Y"), **{sc: int(row.get(sc, 0)) for sc in sub_cats}}
             for m, row in pivot.sort_index().iterrows()]
    return {"rows": rows, "sub_categories": sub_cats}


# ── Weekly stacked (inflow or outflow × sub_category) ─────────────────────────

@app.get("/api/sessions/{sid}/weekly-stacked")
def weekly_stacked(
    sid: str,
    date_col:     str = Query("created_date", pattern="^(created_date|closed_date)$"),
    date_from:    Optional[str] = None,
    date_to:      Optional[str] = None,
    area:         Optional[str] = None,
    team:         Optional[str] = None,
    sub_category: Optional[str] = None,
    assigned_to:  Optional[str] = None,
    limit: int    = Query(26, ge=4, le=104),
):
    df = _get_session(sid)
    if date_col not in df.columns:
        return {"rows": [], "sub_categories": []}
    tmp = _filter_by_range(df, date_col, date_from, date_to)
    tmp = _apply_dim_filters(tmp, assigned_to=assigned_to, area=area, team=team, sub_category=sub_category)
    tmp = tmp.dropna(subset=[date_col]).copy()
    if tmp.empty:
        return {"rows": [], "sub_categories": []}
    # Fill missing sub_category so outflow chart shows tickets even without a category
    if "sub_category" in tmp.columns:
        tmp["sub_category"] = tmp["sub_category"].fillna("(Unknown)")
    else:
        tmp["sub_category"] = "(Unknown)"
    sub_cats = tmp.groupby("sub_category").size().nlargest(10).index.tolist()
    tmp2     = tmp[tmp["sub_category"].isin(sub_cats)].copy()
    tmp2["_w"] = tmp2[date_col].dt.to_period("W").apply(lambda p: p.start_time.date())
    pivot = tmp2.groupby(["_w", "sub_category"]).size().unstack(fill_value=0)
    for sc in sub_cats:
        if sc not in pivot.columns:
            pivot[sc] = 0
    pivot = pivot[sub_cats]
    rows  = [{"week": str(w), "label": _week_label(w), **{sc: int(row.get(sc, 0)) for sc in sub_cats}}
             for w, row in pivot.sort_index().iterrows()]
    return {"rows": rows[-limit:], "sub_categories": sub_cats}


# ── Helpers ────────────────────────────────────────────────────────────────────

def _get_session(sid: str) -> pd.DataFrame:
    df = sessions.get(sid)
    if df is None:
        raise HTTPException(404, f"Session '{sid}' not found. Please re-upload your file.")
    return df


@app.get("/api/sessions/{sid}/debug")
def session_debug(sid: str):
    """Returns column metadata and sample values — useful for diagnosing mapping issues."""
    df = _get_session(sid)
    DATE_COLS = ["created_date", "preferred_live_date", "due_date", "closed_date"]
    col_info = {}
    for col in df.columns:
        info: dict = {"dtype": str(df[col].dtype), "non_null": int(df[col].notna().sum())}
        if col in DATE_COLS:
            sample = df[col].dropna().head(3)
            info["sample"] = [str(v) for v in sample]
            if df[col].notna().any():
                info["min"] = str(df[col].dropna().min())
                info["max"] = str(df[col].dropna().max())
        col_info[col] = info
    return {
        "total_rows": len(df),
        "columns": col_info,
        "date_columns_found": [c for c in DATE_COLS if c in df.columns],
        "date_columns_with_data": [c for c in DATE_COLS if c in df.columns and df[c].notna().any()],
    }


def _week_label(d) -> str:
    try:
        if isinstance(d, str):
            d = datetime.strptime(d, "%Y-%m-%d").date()
        return d.strftime("W/C %d %b %Y")
    except Exception:
        return str(d)


def _apply_dim_filters(
    df: pd.DataFrame,
    assigned_to:  Optional[str] = None,
    team:         Optional[str] = None,
    area:         Optional[str] = None,
    sub_category: Optional[str] = None,
) -> pd.DataFrame:
    if assigned_to and "assigned_to" in df.columns:
        names = [n.strip() for n in assigned_to.split(',') if n.strip()]
        df = df[df["assigned_to"].isin(names)]
    if team and "team" in df.columns:
        teams = [t.strip() for t in team.split(',') if t.strip()]
        df = df[df["team"].isin(teams)]
    if area and "area" in df.columns:
        areas = [a.strip() for a in area.split(',') if a.strip()]
        df = df[df["area"].isin(areas)]
    if sub_category and "sub_category" in df.columns:
        cats = [c.strip() for c in sub_category.split(',') if c.strip()]
        if cats:
            expanded_cats = []
            for cat in cats:
                if cat == "Demand Engagement Activations":
                    expanded_cats.extend(DEMAND_ENGAGEMENT_SUBS)
                else:
                    expanded_cats.append(cat)
            df = df[df["sub_category"].isin(expanded_cats)]
    return df


def _period_label(d, group_by: str) -> str:
    try:
        if isinstance(d, str):
            d = datetime.strptime(d, "%Y-%m-%d").date()
        return d.strftime("W/C %d %b %Y") if group_by == "week" else d.strftime("%b %Y")
    except Exception:
        return str(d)


def _filter_by_range(
    df: pd.DataFrame,
    date_col: str,
    date_from: Optional[str],
    date_to: Optional[str],
) -> pd.DataFrame:
    if (not date_from and not date_to) or date_col not in df.columns:
        return df
    tmp = df.copy()
    # Belt-and-suspenders: ensure the column is tz-naive (process_dataframe does
    # this at load time, but guard here in case future code paths skip that step)
    if tmp[date_col].dt.tz is not None:
        tmp[date_col] = tmp[date_col].dt.tz_convert("UTC").dt.tz_localize(None)
    if date_from:
        try:
            tmp = tmp[tmp[date_col] >= pd.Timestamp(date_from)]
        except Exception:
            pass
    if date_to:
        try:
            tmp = tmp[tmp[date_col] <= pd.Timestamp(date_to) + pd.Timedelta(days=1)]
        except Exception:
            pass
    return tmp


# ── Ticket data proxy ─────────────────────────────────────────────────────────
# URL is env-overridable so a redeployed Apps Script is a variable change rather
# than a code edit across three files plus a rebuild.
_APPS_SCRIPT_URL = os.environ.get(
    "TICKETS_APPS_SCRIPT_URL",
    "https://script.google.com/macros/s/AKfycbzaW_Z6bgnEO6SYLVQdh7M7JyouoGwwyR8UZ5G3V8MrRh-YcZv5FFGMpPn37aJ7GncOAA/exec",
)
# The dashboard re-fetches on EVERY page load, so without a cache each tab and
# refresh from every user was a fresh Apps Script execution — enough to exhaust
# Google's daily script-runtime quota. Same TTL shape as the feedback loader.
_TICKETS_CACHE_TTL = 300  # seconds
_tickets_cache: dict = {"ts": 0.0, "rows": None, "fetched_at": None}

# Preferred source when set: a direct CSV export of the ticket sheet, the same
# mechanism the Feedback tab already uses successfully. It is a single request
# with no redirect, so it avoids the /exec -> script.googleusercontent.com hop
# that Apps Script depends on and which fails independently of whether the
# script itself runs. Falls back to Apps Script when unset or failing.
#   https://docs.google.com/spreadsheets/d/<SHEET_ID>/export?format=csv&gid=<GID>
_TICKETS_CSV_URL = os.environ.get("TICKETS_CSV_URL", "").strip()


async def _fetch_ticket_rows() -> tuple[list, str]:
    """Return (rows, source).

    Order of preference: the snapshot the ServiceNow extension synced, then the
    sheet's CSV export, then the Apps Script. The snapshot wins because it comes
    straight from ServiceNow with manual corrections applied, and because the
    Google hops have both failed in production; they stay as a fallback so
    nothing breaks before the first sync.
    """
    import httpx
    attempts: list[str] = []

    try:
        rows, meta = sn_data_api.load_rows("tickets")
        if rows:
            print(f"[TICKETS] Serving {len(rows)} rows from the synced snapshot "
                  f"({meta.get('synced_at')}, {meta.get('overrides_applied', 0)} corrections)", flush=True)
            return rows, "servicenow-snapshot"
    except HTTPException as exc:
        attempts.append(f"snapshot: {exc.detail}")
    except Exception as exc:
        attempts.append(f"snapshot: {exc}")

    if _TICKETS_CSV_URL:
        try:
            async with httpx.AsyncClient(follow_redirects=True, timeout=30) as client:
                resp = await client.get(_TICKETS_CSV_URL)
                resp.raise_for_status()
            if resp.text.lstrip().startswith("<"):
                raise ValueError("got HTML, not CSV — the sheet is probably not shared publicly")
            frame = pd.read_csv(io.StringIO(resp.text))
            # NaN is not valid JSON; None round-trips cleanly to the frontend.
            rows = frame.astype(object).where(pd.notna(frame), None).to_dict(orient="records")
            if not rows:
                raise ValueError("CSV export returned no rows")
            return rows, "csv"
        except Exception as exc:
            attempts.append(f"CSV export: {exc}")

    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=30) as client:
            resp = await client.get(_APPS_SCRIPT_URL)
            resp.raise_for_status()
            rows = resp.json()
        if not isinstance(rows, list):
            # Apps Script serves an HTML error page rather than JSON when the
            # deployment is missing or its output cannot be served.
            raise ValueError("did not return a JSON array — check the deployment URL")
        return rows, "apps-script"
    except Exception as exc:
        attempts.append(f"Apps Script: {exc}")

    raise RuntimeError(" | ".join(attempts))


@app.get("/api/tickets")
async def get_tickets(refresh: bool = False):
    """Proxy the Apps Script fetch server-side (avoids browser CORS/redirects).

    Cached for _TICKETS_CACHE_TTL. If the upstream call fails but we still hold
    a previous copy, that copy is served with X-Sheet-Stale set rather than
    failing the request — a Google hiccup degrades the dashboard instead of
    taking it down. `refresh=true` forces a live fetch.
    """
    import time as _time

    now = _time.time()
    age = now - _tickets_cache["ts"]
    if not refresh and _tickets_cache["rows"] is not None and age < _TICKETS_CACHE_TTL:
        return JSONResponse(
            _tickets_cache["rows"],
            headers={"X-Sheet-Fetched-At": _tickets_cache["fetched_at"] or "",
                     "X-Sheet-Cache": "hit", "X-Sheet-Stale": "false"},
        )

    try:
        rows, source = await _fetch_ticket_rows()
        _tickets_cache.update({"ts": now, "rows": rows,
                               "fetched_at": datetime.now().isoformat(timespec="seconds")})
        print(f"[TICKETS] Fetched {len(rows)} rows via {source}", flush=True)
        return JSONResponse(
            rows,
            headers={"X-Sheet-Fetched-At": _tickets_cache["fetched_at"],
                     "X-Sheet-Cache": "miss", "X-Sheet-Stale": "false",
                     "X-Sheet-Source": source},
        )
    except Exception as exc:
        if _tickets_cache["rows"] is not None:
            print(f"[TICKETS] Upstream failed ({exc}) — serving cached copy from "
                  f"{_tickets_cache['fetched_at']}", flush=True)
            return JSONResponse(
                _tickets_cache["rows"],
                headers={"X-Sheet-Fetched-At": _tickets_cache["fetched_at"] or "",
                         "X-Sheet-Cache": "stale", "X-Sheet-Stale": "true",
                         "X-Sheet-Error": str(exc)[:200]},
            )
        raise HTTPException(502, f"Could not fetch ticket data: {exc}")


# ── Feedback (Sheet 2 of the connected Google Sheet) ──────────────────────────
_FEEDBACK_SHEET_ID = "1FchAuDdhodOiZdoUWfOkqcTYyEkscVXJ38ohwWVU5TY"
_FEEDBACK_GID      = "876285921"
_FEEDBACK_CSV_URL  = os.environ.get(
    "FEEDBACK_CSV_URL",
    f"https://docs.google.com/spreadsheets/d/{_FEEDBACK_SHEET_ID}/export?format=csv&gid={_FEEDBACK_GID}",
)
_FEEDBACK_CACHE_TTL = 300  # seconds
_feedback_cache: dict = {"ts": 0.0, "df": None, "columns": {}}

# Text ratings occasionally used instead of numbers
_TEXT_SCORES = {
    "excellent": 5, "very good": 4, "good": 3, "average": 2, "fair": 2,
    "poor": 1, "very poor": 1, "bad": 1,
}

# Individual rating parameters that may exist as separate sheet columns.
# Fixed display order used everywhere: Overall, Quality, Timeliness, Interaction.
_FEEDBACK_PARAM_ORDER = ("overall", "quality", "timeliness", "interaction")
_FEEDBACK_PARAM_ALIASES = {
    "overall":     ["overall"],
    "quality":     ["quality"],
    "timeliness":  ["timel", "on time", "speed", "turnaround"],
    "interaction": ["interact", "communication", "courtesy"],
}

def _detect_feedback_columns(df: pd.DataFrame) -> dict:
    """Map free-form sheet headers onto canonical feedback fields."""
    cols = {c.strip().lower(): c for c in df.columns}

    def find(cands, exclude=(), skip=()):
        for cand in cands:
            for low, orig in cols.items():
                if orig in skip:
                    continue
                if cand in low and not any(x in low for x in exclude):
                    return orig
        return None

    def find_exact(cands, skip=()):
        for cand in cands:
            for low, orig in cols.items():
                if orig in skip:
                    continue
                if low == cand:
                    return orig
        return None

    # Rating parameters first so the generic score detection can skip them
    params = {k: find(aliases) for k, aliases in _FEEDBACK_PARAM_ALIASES.items()}
    param_cols = [c for c in params.values() if c]

    mapping = {
        "date":    find(["timestamp", "date", "submitted", "created", "time"], skip=param_cols),
        "score":   params.get("overall") or find(["rating", "score", "stars", "csat", "satisfaction"], skip=param_cols),
        "user":    find(["assigned to", "assignee", "specialist", "agent",
                         "resolved by", "team member", "handled by", "owner", "name"],
                        exclude=("ticket", "requester", "client"), skip=param_cols),
        "service": find(["sub category", "sub-category", "subcategory", "service",
                         "category", "type"], skip=param_cols),
        "comment": find(["comment", "remarks", "notes", "review", "suggestion"], skip=param_cols),
        "ticket":  find(["ticket", "number", "id"], skip=param_cols),
        "area":    find(["area", "region"], skip=param_cols),
        "params":  params,
    }

    # Who gave the feedback (form respondent, an individual) — must not steal
    # the specialist column. "frontline" matches a "Frontlines" header.
    mapping["requester"] = find(
        ["requested by", "submitted by", "your name", "requester", "client",
         "customer", "stakeholder", "given by", "frontline", "name", "email"],
        skip=param_cols + [mapping["user"], mapping["ticket"], mapping["area"]],
    )

    # The feedback-giver's team/segment (e.g. a literal "FL" column holding a
    # department like "Customer Marketing") — distinct from their individual
    # name above. Exact-match only: "fl" is too short to safely substring-match.
    mapping["fl_segment"] = find_exact(
        ["fl", "fl segment", "frontline segment", "segment", "business segment", "division"],
        skip=param_cols + [mapping["user"], mapping["ticket"], mapping["area"], mapping["requester"]],
    )

    # Score fallback: any mostly-numeric column with values in a 0–10 band
    if mapping["score"] is None:
        for c in df.columns:
            if c in mapping.values() or c in param_cols:
                continue
            vals = pd.to_numeric(df[c], errors="coerce").dropna()
            if len(vals) >= max(3, len(df) // 2) and vals.between(0, 10).all():
                mapping["score"] = c
                break

    # "Feedback" alone is a comment unless it's the only score-ish column
    if mapping["comment"] is None:
        fb = find(["feedback"], exclude=("rating", "score"), skip=param_cols)
        if fb and fb != mapping["score"]:
            mapping["comment"] = fb

    return mapping

def _load_feedback_df(force: bool = False):
    """Load feedback, preferring the synced ServiceNow snapshot over the sheet.

    Same preference order as tickets, for the same reason: the snapshot comes
    straight from ServiceNow with corrections applied, and the sheet has failed
    in production before. Falls back to the sheet so nothing breaks before a
    first sync has happened.
    """
    import time as _time
    now = _time.time()
    if not force and _feedback_cache["df"] is not None and now - _feedback_cache["ts"] < _FEEDBACK_CACHE_TTL:
        return _feedback_cache["df"], _feedback_cache["columns"]

    try:
        snap_rows, snap_meta = sn_data_api.load_rows("feedback")
    except Exception:
        snap_rows, snap_meta = [], {}

    if snap_rows:
        print(f"[FEEDBACK] Serving {len(snap_rows)} rows from the synced snapshot "
              f"({snap_meta.get('synced_at')})", flush=True)
        raw = pd.DataFrame(snap_rows)
    else:
        import httpx
        try:
            with httpx.Client(follow_redirects=True, timeout=30) as client:
                resp = client.get(_FEEDBACK_CSV_URL)
                resp.raise_for_status()
                raw = pd.read_csv(io.StringIO(resp.text))
        except Exception as exc:
            if _feedback_cache["df"] is not None:   # serve stale on transient failure
                return _feedback_cache["df"], _feedback_cache["columns"]
            raise HTTPException(
                502,
                f"Could not fetch the feedback sheet (make sure link sharing is on): {exc}",
            )

    raw = raw.dropna(how="all").dropna(axis=1, how="all")
    raw.columns = [str(c).strip() for c in raw.columns]
    mapping = _detect_feedback_columns(raw)

    def _to_score(series):
        s = pd.to_numeric(series, errors="coerce")
        txt = series.astype(str).str.strip().str.lower().map(_TEXT_SCORES)
        return s.fillna(txt)

    df = pd.DataFrame(index=raw.index)
    df["date"] = pd.to_datetime(raw[mapping["date"]], errors="coerce", dayfirst=False) if mapping["date"] else pd.NaT

    # Individual rating parameters (timeliness / quality / interaction / overall)
    param_cols = {k: c for k, c in mapping["params"].items() if c}
    for k, c in param_cols.items():
        df[f"param_{k}"] = _to_score(raw[c])

    if mapping["score"]:
        df["score"] = _to_score(raw[mapping["score"]])
    elif param_cols:
        df["score"] = df[[f"param_{k}" for k in param_cols]].mean(axis=1).round(2)
    else:
        df["score"] = pd.NA

    df["user"]       = raw[mapping["user"]].astype(str).str.strip()       if mapping["user"]       else ""
    df["service"]    = raw[mapping["service"]].astype(str).str.strip()    if mapping["service"]    else ""
    df["comment"]    = raw[mapping["comment"]].astype(str).str.strip()    if mapping["comment"]    else ""
    df["ticket"]     = raw[mapping["ticket"]].astype(str).str.strip()     if mapping["ticket"]     else ""
    df["requester"]  = raw[mapping["requester"]].astype(str).str.strip()  if mapping["requester"]  else ""
    df["fl_segment"] = raw[mapping["fl_segment"]].astype(str).str.strip() if mapping["fl_segment"] else ""
    df["sheet_area"] = raw[mapping["area"]].astype(str).str.strip()       if mapping["area"]       else ""
    for c in ("user", "service", "comment", "ticket", "requester", "fl_segment", "sheet_area"):
        df[c] = df[c].fillna("").replace({"nan": "", "None": "", "NaN": ""})

    df = df[df["score"].notna() | (df["comment"] != "")]

    _feedback_cache.update({"ts": now, "df": df, "columns": mapping})
    return df, mapping

@app.get("/api/feedback")
def feedback_summary(
    date_from: Optional[str] = None,
    date_to:   Optional[str] = None,
    user:      Optional[str] = None,
    service:   Optional[str] = None,
    area:      Optional[str] = None,
    fl:        Optional[str] = None,
    group_by:  str = Query("week", pattern="^(week|month)$"),
    refresh:   bool = False,
    sid:       Optional[str] = None,   # ticket session — enables Area join + feedback rate
    entries_user:    Optional[str] = None,
    entries_service: Optional[str] = None,
):
    df, mapping = _load_feedback_df(force=refresh)

    users    = sorted(u for u in df["user"].unique() if u)
    services = sorted(s for s in df["service"].unique() if s)
    fl_segments = sorted(f for f in df["fl_segment"].unique() if f) if "fl_segment" in df.columns else []

    # "Demand Engagement Activations" is a virtual Service filter option —
    # not a real sheet value — that filters to the union of its 3 sub-services.
    if any(sc in services for sc in DEMAND_ENGAGEMENT_SUBS) and "Demand Engagement Activations" not in services:
        services = sorted(services + ["Demand Engagement Activations"])

    # ── Area: prefer the feedback sheet's own Area column; fall back to a
    # ticket-sheet join by ticket number only if the sheet doesn't have one. ──
    ticket_df = sessions.get(sid) if sid else None
    tdf = None  # date-filtered ticket_df — also used by _group() for per-row ticket/rate counts
    area_by_ticket: dict[str, str] = {}
    total_tickets = None
    if ticket_df is not None and "ticket_number" in ticket_df.columns:
        tdf = ticket_df
        if date_from and "created_date" in tdf.columns:
            tdf = tdf[tdf["created_date"].isna() | (tdf["created_date"] >= pd.Timestamp(date_from))]
        if date_to and "created_date" in tdf.columns:
            tdf = tdf[tdf["created_date"].isna() | (tdf["created_date"] <= pd.Timestamp(date_to) + pd.Timedelta(days=1))]
        total_tickets = int(len(tdf))
        if "area" in ticket_df.columns:
            norm = ticket_df.dropna(subset=["ticket_number"]).copy()
            norm["_k"] = norm["ticket_number"].astype(str).str.strip().str.upper()
            area_by_ticket = dict(zip(norm["_k"], norm["area"].fillna("").map(lambda a: AREA_RENAME.get(a, a))))
        if tdf is not None and "area" in tdf.columns:
            tdf = tdf.copy()
            tdf["area"] = tdf["area"].map(lambda a: AREA_RENAME.get(a, a))

    # Frontline/team segments that exist on the TICKET sheet (raw, unfiltered)
    # but have never appeared in the feedback sheet — e.g. Brand, Global Comms,
    # Other PWR — should still show up in the filter + By Frontlines chart at 0.
    if ticket_df is not None and "team" in ticket_df.columns:
        ticket_teams = sorted(t for t in ticket_df["team"].dropna().unique() if t)
        fl_segments = sorted(set(fl_segments) | set(ticket_teams))

    df = df.copy()
    sheet_has_area = "sheet_area" in df.columns and (df["sheet_area"] != "").any()
    if sheet_has_area:
        df["area"] = df["sheet_area"]
    elif area_by_ticket:
        df["area"] = df["ticket"].astype(str).str.strip().str.upper().map(area_by_ticket).fillna("")
    else:
        df["area"] = ""
    df["area"] = df["area"].map(lambda a: AREA_RENAME.get(a, a))
    has_area = bool(sheet_has_area or area_by_ticket)
    areas = sorted(a for a in df["area"].unique() if a) if has_area else []
    if ticket_df is not None and "area" in ticket_df.columns:
        ticket_areas = sorted({AREA_RENAME.get(a, a) for a in ticket_df["area"].dropna().unique() if a})
        if ticket_areas:
            areas = sorted(set(areas) | set(ticket_areas))
            has_area = True

    def _apply_filters(base, u, s, a=None, f=None):
        out = base
        if date_from:
            out = out[out["date"].isna() | (out["date"] >= pd.Timestamp(date_from))]
        if date_to:
            out = out[out["date"].isna() | (out["date"] <= pd.Timestamp(date_to) + pd.Timedelta(days=1))]
        if u:
            out = out[out["user"] == u]
        if s:
            if s == "Demand Engagement Activations":
                out = out[out["service"].isin(DEMAND_ENGAGEMENT_SUBS)]
            else:
                out = out[out["service"] == s]
        if a:
            out = out[out["area"] == a]
        if f:
            out = out[out["fl_segment"] == f]
        return out

    tmp = _apply_filters(df, user, service, area, fl)

    scored = tmp[tmp["score"].notna()]
    scores = scored["score"].astype(float)
    scale_max = 5 if (len(scores) == 0 or scores.max() <= 5) else 10

    def _avg(s):
        return round(float(s.mean()), 2) if len(s) else None

    # Detected rating parameters, in fixed display order: Overall, Quality, Timeliness, Interaction
    param_keys = [k for k in _FEEDBACK_PARAM_ORDER if f"param_{k}" in df.columns]

    # Score distributions (1..scale_max) — overall plus one per rating parameter
    def _dist(series):
        vals = series.dropna().astype(float)
        return [{"score": i, "count": int((vals.round() == i).sum())}
                for i in range(1, scale_max + 1)]

    distribution  = _dist(scored["score"])
    distributions = {k: _dist(tmp[f"param_{k}"]) for k in param_keys}
    param_avgs    = {k: _avg(tmp[f"param_{k}"].dropna().astype(float)) for k in param_keys}

    def _five_star(series):
        vals = series.dropna().astype(float)
        five = int((vals.round() >= scale_max).sum())
        return five, (round(five / len(vals) * 100, 1) if len(vals) else None), int(len(vals))

    five_star_count, five_star_pct, _ = _five_star(scored["score"])
    param_five_star = {}
    for k in param_keys:
        f, p, n = _five_star(tmp[f"param_{k}"])
        param_five_star[k] = {"count": f, "pct": p, "rated": n}

    # ── Feedback rate: rated feedbacks per ticket raised (needs ticket-session join) ──
    feedback_rate = None
    if total_tickets:
        rated_ct = int(len(scored))
        feedback_rate = {
            "feedbacks": rated_ct,
            "tickets": total_tickets,
            "pct": round(rated_ct / total_tickets * 100) if total_tickets else None,
            # Conventional round-half-up (not Python's banker's rounding) so
            # e.g. 2.5 reads as "1 in 3", matching everyday rounding intuition.
            "ratio": int(total_tickets / rated_ct + 0.5) if rated_ct else None,
        }

    # ── Hub Feedback Score classification on the (rounded) Overall score —
    #    on a 5-point scale: 1-2 detractor, 3 passive, 4-5 promoter. Generalized
    #    to other scales by the same 40%/60% split (still 1-2/3/4-5 at scale 5).
    detractor_max = round(scale_max * 0.4)   # 2 on a 5-pt scale
    passive_min = detractor_max + 1          # 3 on a 5-pt scale
    promoter_min = round(scale_max * 0.6) + 1  # 4 on a 5-pt scale

    def _nps_bucket(v):
        if pd.isna(v):
            return None
        r = round(v)
        if r >= promoter_min:
            return "promoter"
        if r <= detractor_max:
            return "detractor"
        return "passive"

    def _range_label(lo, hi):
        return f"{lo}–{hi}" if hi > lo else str(lo)

    nps_src = scored.copy()
    nps_src["_bucket"] = nps_src["score"].apply(_nps_bucket)
    nps_counts = {b: int((nps_src["_bucket"] == b).sum()) for b in ("promoter", "passive", "detractor")}
    nps_total = sum(nps_counts.values())

    # Respondents who submitted without a name (sheet stores this as "Anonymous",
    # "anon", "N/A", etc). Promoters keep excluding them, since a happy
    # anonymous respondent isn't someone to call out by name — but Passives
    # and Detractors surface them (merged into a single "Anonymous" entry) so
    # unhappy anonymous feedback doesn't just vanish from the Top-3 list.
    _ANONYMOUS = {"anonymous", "anon", "n/a", "na"}

    def _top_fls(bucket, n=3, exclude_anon=True):
        grp = nps_src[(nps_src["_bucket"] == bucket) & (nps_src["requester"] != "")].copy()
        is_anon = grp["requester"].str.strip().str.lower().isin(_ANONYMOUS)
        if exclude_anon:
            grp = grp[~is_anon]
        else:
            grp.loc[is_anon, "requester"] = "Anonymous"
        counts = grp.groupby("requester").size().sort_values(ascending=False).head(n)
        result = []
        for name, c in counts.items():
            segs = grp.loc[grp["requester"] == name, "fl_segment"]
            segs = segs[segs != ""]
            fl = segs.mode().iat[0] if len(segs) else ""
            result.append({"name": name, "count": int(c), "fl": fl})
        return result

    nps = {
        "promoters": nps_counts["promoter"], "passives": nps_counts["passive"], "detractors": nps_counts["detractor"],
        "promoter_pct":  round(nps_counts["promoter"]  / nps_total * 100, 1) if nps_total else None,
        "passive_pct":   round(nps_counts["passive"]   / nps_total * 100, 1) if nps_total else None,
        "detractor_pct": round(nps_counts["detractor"] / nps_total * 100, 1) if nps_total else None,
        "score": round((nps_counts["promoter"] - nps_counts["detractor"]) / nps_total * 100, 1) if nps_total else None,
        "detractor_range": _range_label(1, detractor_max),
        "passive_range":   _range_label(passive_min, promoter_min - 1),
        "promoter_range":  _range_label(promoter_min, scale_max),
        "top_promoters":  _top_fls("promoter"),
        "top_passives":   _top_fls("passive", exclude_anon=False),
        "top_detractors": _top_fls("detractor", exclude_anon=False),
    }

    # Inflow per period + avg score + per-specialist split (for stacked bars)
    by_period = []
    dated = scored[scored["date"].notna()]
    if len(dated):
        freq = "W" if group_by == "week" else "M"
        g = dated.copy()
        g["_p"] = g["date"].dt.to_period(freq).apply(lambda p: p.start_time.date())
        for p, grp in sorted(g.groupby("_p"), key=lambda kv: kv[0]):
            by_period.append({
                "period": str(p),
                "label": _period_label(p, group_by),
                "count": int(len(grp)),
                "avg_score": _avg(grp["score"].astype(float)),
                "by_user": {u: int(c) for u, c in grp[grp["user"] != ""].groupby("user").size().items()},
            })

    def _group(col, with_params=False, top_n=None, universe=None, ticket_col=None):
        """`universe`, if given, is the FULL set of category values that can
        exist regardless of the current filters (e.g. every FL segment in the
        sheet) — any value in it with zero matches under the active filters
        still appears in the result at count 0, rather than silently
        disappearing. That's what lets "which FL segments got no feedback
        from this specialist" actually show up instead of just vanishing.

        `ticket_col`, if given (and a ticket session is connected), is the
        matching column on the TICKET sheet (e.g. "assigned_to" for a
        per-specialist group) — adds "tickets" (tickets raised/handled) and
        "feedback_rate_pct" (feedbacks ÷ tickets) to each row."""
        by_val = {}
        for val, grp in scored.groupby(col):
            if not val:
                continue
            row = {
                col: val,
                "count": int(len(grp)),
                "avg_score": _avg(grp["score"].astype(float)),
            }
            if with_params:
                row["params"] = {
                    k: _avg(grp[f"param_{k}"].dropna().astype(float))
                    for k in param_keys
                }
            by_val[val] = row
        for val in (universe or []):
            if val and val not in by_val:
                row = {col: val, "count": 0, "avg_score": None}
                if with_params:
                    row["params"] = {k: None for k in param_keys}
                by_val[val] = row
        if ticket_col and tdf is not None and ticket_col in tdf.columns:
            ticket_counts = tdf[ticket_col].astype(str).str.strip().value_counts()
            for val, row in by_val.items():
                t_ct = int(ticket_counts.get(str(val).strip(), 0))
                row["tickets"] = t_ct
                row["feedback_rate_pct"] = round(row["count"] / t_ct * 100) if t_ct else None
        out = sorted(by_val.values(), key=lambda x: x["count"], reverse=True)
        return out[:top_n] if top_n else out

    # Entries: independent Specialist/Service filters, page-level date range still applies
    entries_df = _apply_filters(df, entries_user, entries_service)
    entries = entries_df.sort_values("date", ascending=False)
    entries_rows = [
        {
            "date": r["date"].date().isoformat() if pd.notna(r["date"]) else None,
            "user": r["user"], "service": r["service"], "ticket": r["ticket"],
            "requester": r["requester"],
            "score": float(r["score"]) if pd.notna(r["score"]) else None,
            "comment": r["comment"],
        }
        for _, r in entries.iterrows()
        if pd.notna(r["score"]) or r["comment"]
    ]

    return {
        "columns_detected": {k: v for k, v in mapping.items()},
        "scale_max": scale_max,
        "param_keys": param_keys,
        "total": int(len(tmp)),
        "rated": int(len(scored)),
        "avg_score": _avg(scores),
        "five_star_count": five_star_count,
        "five_star_pct": five_star_pct,
        "param_five_star": param_five_star,
        "feedback_rate": feedback_rate,
        "nps": nps,
        "distribution": distribution,
        "distributions": distributions,
        "param_avgs": param_avgs,
        "by_period": by_period,
        "by_service": _group("service", with_params=True, ticket_col="sub_category"),
        "by_user": _group("user", with_params=True, ticket_col="assigned_to"),
        "by_requester": _group("requester", top_n=12),
        "by_fl": _group("fl_segment", top_n=12, universe=fl_segments, ticket_col="team"),
        "has_fl_segment": bool(mapping.get("fl_segment")),
        "by_area": _group("area", top_n=12, universe=areas, ticket_col="area") if has_area else [],
        "has_area": has_area,
        "users": users,
        "services": services,
        "areas": areas,
        "fl_segments": fl_segments,
        "entries": entries_rows,
    }


# ── AI proxy endpoints ─────────────────────────────────────────────────────────
# Key is read from the OPENAI_API_KEY environment variable set in Railway.
# Never hardcode a key in this file.

_OPENAI_KEY = os.environ.get("OPENAI_API_KEY", "")

class ChatBody(BaseModel):
    messages: List[dict]

class GenerateBody(BaseModel):
    prompt: str
    max_tokens: int = 150

@app.post("/api/chat")
async def chat_stream(body: ChatBody):
    if not _OPENAI_KEY:
        raise HTTPException(503, "OpenAI API key not configured on server")

    async def stream_generator():
        client = AsyncOpenAI(api_key=_OPENAI_KEY)
        async_stream = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=body.messages,
            stream=True,
        )
        async for chunk in async_stream:
            content = chunk.choices[0].delta.content
            if content:
                yield f"data: {json.dumps({'choices': [{'delta': {'content': content}}]})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        stream_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

@app.post("/api/generate")
async def generate_text(body: GenerateBody):
    if not _OPENAI_KEY:
        raise HTTPException(503, "OpenAI API key not configured on server")
    client = AsyncOpenAI(api_key=_OPENAI_KEY)
    resp = await client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": body.prompt}],
        temperature=0.4,
        max_tokens=body.max_tokens,
    )
    return {"content": resp.choices[0].message.content.strip()}


@app.get("/api/sessions/{sid}/insights")
async def get_insights(
    sid: str,
    date_from:    Optional[str] = Query(None),
    date_to:      Optional[str] = Query(None),
    sub_category: Optional[str] = Query(None),
):
    """Generate AI-powered insights from ticket data for the given date range."""
    if not _OPENAI_KEY:
        raise HTTPException(503, "OpenAI API key not configured on server")

    df = _get_session(sid)
    filtered = _filter_by_range(df, "created_date", date_from, date_to)
    if sub_category and "sub_category" in filtered.columns:
        filtered = filtered[filtered["sub_category"] == sub_category]
    total = len(filtered)

    if total == 0:
        raise HTTPException(400, "No tickets found for the selected filters.")

    today = date.today()

    # ── Build metrics snapshot ────────────────────────────────────────────────

    # Volume stats
    open_tickets   = int((~filtered["state"].isin(EXCLUDED_STATES)).sum()) if "state" in filtered.columns else 0
    closed_tickets = int(filtered["state"].isin(EXCLUDED_STATES).sum()) if "state" in filtered.columns else 0

    # SLA performance per service
    sla_stats: list[dict] = []
    if "sub_category" in filtered.columns and "created_date" in filtered.columns:
        for svc, days_allowed in SLA_RULES.items():
            svc_df = filtered[filtered["sub_category"] == svc]
            if len(svc_df) == 0:
                continue
            svc_df = svc_df.copy()
            svc_df["sla_due"] = svc_df["created_date"].apply(lambda d: add_working_days(d, days_allowed))
            open_svc  = svc_df[~svc_df["state"].isin(EXCLUDED_STATES)] if "state" in svc_df.columns else svc_df
            overdue   = int((open_svc["sla_due"] < pd.Timestamp(today)).sum()) if len(open_svc) else 0
            closed_svc = svc_df[svc_df["state"].isin(EXCLUDED_STATES)] if "state" in svc_df.columns else pd.DataFrame()
            on_time    = 0
            if len(closed_svc) and "closed_date" in closed_svc.columns:
                on_time = int((closed_svc["closed_date"] <= closed_svc["sla_due"]).sum())
            sla_stats.append({
                "service":     svc,
                "total":       len(svc_df),
                "open":        len(open_svc),
                "overdue":     overdue,
                "closed_on_time": on_time,
            })

    # Resolution time (closed tickets only)
    avg_resolution_days: Optional[float] = None
    if "closed_date" in filtered.columns and "created_date" in filtered.columns:
        closed_df = filtered[filtered["state"].isin(EXCLUDED_STATES)].copy() if "state" in filtered.columns else filtered.copy()
        if len(closed_df):
            closed_df["res_days"] = (closed_df["closed_date"] - closed_df["created_date"]).dt.days
            valid = closed_df["res_days"].dropna()
            valid = valid[valid >= 0]
            if len(valid):
                avg_resolution_days = round(float(valid.mean()), 1)

    # Top areas by volume
    area_breakdown: list[dict] = []
    if "area" in filtered.columns:
        area_vc = filtered["area"].value_counts().head(8)
        area_breakdown = [{"area": str(k), "tickets": int(v)} for k, v in area_vc.items()]

    # Top teams by volume
    team_breakdown: list[dict] = []
    if "team" in filtered.columns:
        team_vc = filtered["team"].value_counts().head(8)
        team_breakdown = [{"team": str(k), "tickets": int(v)} for k, v in team_vc.items()]

    # Top assignees by volume
    assignee_breakdown: list[dict] = []
    if "assigned_to" in filtered.columns:
        asgn_vc = filtered["assigned_to"].value_counts().head(10)
        assignee_breakdown = [{"assignee": str(k), "tickets": int(v)} for k, v in asgn_vc.items()]

    # Inflow by month
    monthly_inflow: list[dict] = []
    if "created_date" in filtered.columns:
        tmp = filtered.copy()
        tmp["month"] = tmp["created_date"].dt.to_period("M")
        mo_vc = tmp.groupby("month").size().sort_index()
        monthly_inflow = [{"month": str(m), "tickets": int(c)} for m, c in mo_vc.items()]

    # Backlog age buckets (open tickets only)
    backlog_buckets: dict = {}
    if "state" in filtered.columns and "created_date" in filtered.columns:
        open_df = filtered[~filtered["state"].isin(EXCLUDED_STATES)].copy()
        if len(open_df):
            open_df["age"] = (pd.Timestamp(today) - open_df["created_date"]).dt.days
            b = {"<7d": 0, "7-30d": 0, "30-90d": 0, ">90d": 0}
            for age in open_df["age"].dropna():
                if age < 7:   b["<7d"]   += 1
                elif age < 30: b["7-30d"]  += 1
                elif age < 90: b["30-90d"] += 1
                else:          b[">90d"]   += 1
            backlog_buckets = b

    # ── Build prompt ──────────────────────────────────────────────────────────
    date_range_str = f"{date_from or 'beginning'} to {date_to or 'today'}"
    scope_str = f"service: {sub_category}" if sub_category else "all services"

    prompt = f"""You are a senior operations analyst reviewing ticket data for a marketing services hub.
Analyse the following metrics snapshot for the period {date_range_str} ({scope_str}) and return a structured JSON response.

METRICS SNAPSHOT:
- Total tickets in range: {total}
- Open tickets: {open_tickets}
- Closed/resolved tickets: {closed_tickets}
- Average resolution time: {avg_resolution_days} days
- Top areas: {json.dumps(area_breakdown)}
- Top teams: {json.dumps(team_breakdown)}
- Top assignees (workload): {json.dumps(assignee_breakdown)}
- Monthly inflow trend: {json.dumps(monthly_inflow)}
- Open backlog age distribution: {json.dumps(backlog_buckets)}
- SLA performance per service: {json.dumps(sla_stats)}

Return ONLY a JSON object with exactly this structure (no markdown, no explanation):
{{
  "summary": "<2-3 sentence executive summary of overall performance>",
  "positives": [
    {{"title": "<short positive finding>", "detail": "<1-2 sentence explanation with numbers>"}}
  ],
  "negatives": [
    {{"title": "<short concern>", "detail": "<1-2 sentence explanation with numbers>"}}
  ],
  "anomalies": [
    {{"title": "<unusual pattern or outlier>", "detail": "<1-2 sentence explanation with numbers>"}}
  ],
  "improvements": [
    {{"title": "<actionable improvement suggestion>", "detail": "<1-2 sentence specific recommendation>"}}
  ]
}}

Rules:
- Each array must have 3-5 items
- Every item must cite specific numbers from the metrics
- "improvements" must be concrete and actionable
- Do not repeat the same point across categories
- Be direct and specific, avoid vague statements
"""

    ai_client = AsyncOpenAI(api_key=_OPENAI_KEY)
    resp = await ai_client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
        max_tokens=1800,
        response_format={"type": "json_object"},
    )

    raw = resp.choices[0].message.content.strip()
    try:
        insights = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(500, "AI returned invalid JSON — please retry.")

    return {
        **insights,
        "date_range": {"from": date_from or "", "to": date_to or ""},
        "total_tickets_analysed": total,
    }


# ── Beta attendance tracker ───────────────────────────────────────────────────
# Registered BEFORE the catch-all "/" static mount below, which would otherwise
# swallow these routes. Shares the Postgres connection and holiday calendar but
# is otherwise independent of the legacy Firebase tracker.
import attendance_api
import email_state_api
import sn_data_api

attendance_api.configure(get_conn=_get_conn, holidays_by_year=HOLIDAYS_BY_YEAR,
                         diagnose=db_diagnosis)
email_state_api.configure(get_conn=_get_conn, diagnose=db_diagnosis)
def _invalidate_sn_cache(dataset: str) -> None:
    """A snapshot sync or a correction should be visible immediately, not after
    the tickets/feedback cache's normal TTL — otherwise an edit looks like it
    silently failed for up to five minutes."""
    if dataset == "tickets":
        _tickets_cache["ts"] = 0.0
    elif dataset == "feedback":
        _feedback_cache["ts"] = 0.0


sn_data_api.configure(get_conn=_get_conn, diagnose=db_diagnosis, on_change=_invalidate_sn_cache)
app.include_router(attendance_api.router)
app.include_router(email_state_api.router)
app.include_router(sn_data_api.router)


# ── Serve KPI React app at /kpi/ and hub static tools at / ───────────────────
from fastapi.responses import FileResponse

_KPI_DIR = Path(__file__).parent / "dist"
_WEB_DIR = Path(__file__).parent / "web"

if _KPI_DIR.is_dir() and (_KPI_DIR / "assets").is_dir():
    app.mount("/kpi/assets", StaticFiles(directory=str(_KPI_DIR / "assets")), name="kpi-assets")

@app.get("/kpi", response_class=FileResponse, include_in_schema=False)
async def kpi_root():
    return FileResponse(str(_KPI_DIR / "index.html"))

@app.get("/kpi/{path:path}", response_class=FileResponse, include_in_schema=False)
async def kpi_spa(path: str):
    return FileResponse(str(_KPI_DIR / "index.html"))

if _WEB_DIR.is_dir():
    app.mount("/", StaticFiles(directory=str(_WEB_DIR), html=True), name="web")
