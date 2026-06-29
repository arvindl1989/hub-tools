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
from datetime import datetime, date, timedelta
from openai import AsyncOpenAI

import traceback
from fastapi import Request
from fastapi.responses import JSONResponse

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

# ── Persistence (PostgreSQL via DATABASE_URL env var) ─────────────────────────

def _get_conn():
    url = os.environ.get("DATABASE_URL")
    if not url:
        return None
    try:
        import psycopg2
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql://", 1)
        # Railway and most cloud Postgres require SSL — add if not already specified
        if "sslmode" not in url:
            sep = "&" if "?" in url else "?"
            url = url + sep + "sslmode=require"
        conn = psycopg2.connect(url, connect_timeout=10)
        print(f"[DB] Connected to PostgreSQL", flush=True)
        return conn
    except Exception as e:
        print(f"[DB] Connection failed: {e}", flush=True)
        return None

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

# People to exclude from all analysis (not part of the core team).
EXCLUDED_PEOPLE: set[str] = {
    "Dheera Sameera",
    "Pooja V",
    "Suresh karthik",
    "Suresh Karthik",
}

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
    sessions[sid] = df

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
    sessions[sid] = df
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

# ── Overview ───────────────────────────────────────────────────────────────────

@app.get("/api/sessions/{sid}/overview")
def overview(sid: str, assigned_to: str = '', team: str = '', area: str = '', sub_category: str = '', date_from: str = '', date_to: str = ''):
    df = _get_session(sid)

    # Apply date range filters if provided
    if date_from:
        df = df[df["created_date"].dropna() >= pd.Timestamp(date_from)]
    if date_to:
        df = df[df["created_date"].dropna() <= pd.Timestamp(date_to)]

    # Apply dimension filters if provided
    if assigned_to:
        df = df[df["assigned_to"] == assigned_to]
    if team and "team" in df.columns:
        df = df[df["team"] == team]
    if area and "area" in df.columns:
        df = df[df["area"] == area]
    if sub_category and "sub_category" in df.columns:
        df = df[df["sub_category"] == sub_category]

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
                periods[k]["closed_completed"] = int(grp["state"].isin(["Closed Completed"]).sum())
                periods[k]["closed_rejected"]  = int(grp["state"].isin(["Closed Rejected"]).sum())

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

        r["open_pipeline"] = int((created_by_end & in_pipeline).sum())

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

    # Remove excluded people from all analysis
    if "assigned_to" in df.columns:
        df = df[~df["assigned_to"].isin(EXCLUDED_PEOPLE)].copy()

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
def user_activity(sid: str):
    df = _get_session(sid)
    if "ticket_creator" not in df.columns or "created_date" not in df.columns:
        return []

    today = date.today()
    tmp = df.dropna(subset=["ticket_creator", "created_date"]).copy()
    if tmp.empty:
        return []

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
        "total":       total,
        "resolved":    resolved,
        "unique":      unique,
        "in_pipeline": active_ct,
        "dependency":  dependency,
        "done_pct":    round(resolved / total * 100) if total > 0 else 0,
        "by_state":    by_state,
    }


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
    if team         and "team"         in df.columns: df = df[df["team"]         == team]
    if area         and "area"         in df.columns: df = df[df["area"]         == area]
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
_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzaW_Z6bgnEO6SYLVQdh7M7JyouoGwwyR8UZ5G3V8MrRh-YcZv5FFGMpPn37aJ7GncOAA/exec"

@app.get("/api/tickets")
async def get_tickets():
    """Proxy the Apps Script fetch server-side to avoid browser CORS/redirect issues."""
    import httpx
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=30) as client:
            resp = await client.get(_APPS_SCRIPT_URL)
            resp.raise_for_status()
            return resp.json()
    except Exception as exc:
        raise HTTPException(502, f"Could not fetch ticket data: {exc}")


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
