from fastapi import FastAPI, File, UploadFile, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
import pandas as pd
import numpy as np
import io
import os
import uuid
from pathlib import Path
from typing import Optional
from datetime import datetime, date, timedelta

app = FastAPI(title="Ticket Analytics API", version="1.0.0")


@app.get("/healthz")
def health():
    return {"status": "ok"}


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

sessions: dict[str, pd.DataFrame] = {}

# ── Configuration ─────────────────────────────────────────────────────────────

BANDWIDTH_RATES: dict[str, float] = {
    "Website Content Management":          1.6,
    "Content Production – Graphic Design": 1.3,
    "Demand Creation – Global":            0.4,
    "Email – Local":                       1.1,
    "Retention – Activations":             0.4,
}

BANDWIDTH_HOURS_PER_DAY  = 8
BANDWIDTH_DAYS_PER_WEEK  = 5
BANDWIDTH_WEEKLY_CAPACITY = BANDWIDTH_HOURS_PER_DAY * BANDWIDTH_DAYS_PER_WEEK  # 40 h

# Keys match exact Sub-Category values from the Excel (em-dash –)
SLA_RULES: dict[str, int] = {
    "Website Content Management": 10,
    "Content Production – Graphic Design": 10,
    "Demand Creation – Global": 30,
    "Email – Local": 7,
    "Retention – Activations": 30,
}

EXCLUDED_STATES = {"Closed Completed", "Closed Rejected", "Confirmation Completed"}

COLUMN_ALIASES: dict[str, list[str]] = {
    "ticket_number":       ["Number", "Ticket Number", "TicketNumber", "Ticket ID", "ID"],
    "short_description":   ["Short description", "Short Description", "Description", "Summary", "Title"],
    "assigned_to":         ["Assigned to", "Assigned To", "AssignedTo", "Assignee"],
    "state":               ["State", "Status"],
    "created_date":        ["Created", "Created Date", "CreatedDate", "Date Created", "Date Opened"],
    "preferred_live_date": ["Preferred Live Date", "PreferredLiveDate", "Live Date"],
    "due_date":            ["Due date", "Due Date", "DueDate"],
    "closed_date":         ["Closed", "Closed Date", "ClosedDate", "Date Closed", "Resolved Date"],
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


def process_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    df = normalize_columns(df.copy())

    for dc in ["created_date", "preferred_live_date", "due_date", "closed_date"]:
        if dc in df.columns:
            df[dc] = pd.to_datetime(df[dc], errors="coerce", dayfirst=False)

    str_cols = ["state", "sub_category", "assigned_to", "area", "team",
                "ticket_creator", "ticket_number", "short_description", "tags", "watch_list"]
    for sc in str_cols:
        if sc in df.columns:
            df[sc] = df[sc].astype(str).str.strip().replace({"nan": pd.NA, "None": pd.NA, "": pd.NA})

    # Calculate SLA due dates from Created date using working-days rules
    def _sla(row):
        sc = row.get("sub_category")
        cd = row.get("created_date")
        if pd.notna(sc) and pd.notna(cd):
            days = SLA_RULES.get(str(sc).strip())
            if days:
                return add_working_days(cd, days)
        return pd.NaT

    df["sla_due_date"] = df.apply(_sla, axis=1)

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

# ── Overview ───────────────────────────────────────────────────────────────────

@app.get("/api/sessions/{sid}/overview")
def overview(sid: str):
    df = _get_session(sid)
    active = df[df["is_active"]]

    def _list(col):
        return sorted(df[col].dropna().unique().tolist()) if col in df.columns else []

    today = date.today()
    closed_this_week = 0
    if "closed_date" in df.columns:
        week_start = today - timedelta(days=today.weekday())
        closed_this_week = int(
            df["closed_date"].dropna()
            .apply(lambda d: d.date() if isinstance(d, pd.Timestamp) else d)
            .ge(week_start).sum()
        )

    ages = active["ticket_age"].dropna()

    return {
        "total_active": int(len(active)),
        "total_all": int(len(df)),
        "overdue_sla": int((active["days_to_sla"].dropna() < 0).sum()),
        "due_within_5": int(
            ((active["days_to_sla"].dropna() >= 0) & (active["days_to_sla"].dropna() <= 5)).sum()
        ),
        "pending_confirmation": int((active.get("state", pd.Series()) == "Pending Confirmation").sum()),
        "closed_this_week": closed_this_week,
        "avg_age": round(float(ages.mean()), 1) if len(ages) else 0,
        "assigned_to_list":   _list("assigned_to"),
        "sub_category_list":  _list("sub_category"),
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

    result = sorted(periods.values(), key=lambda x: x["period"])
    for r in result:
        r["net"] = r["inflow"] - r["outflow"]
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

@app.get("/api/bandwidth-rates")
def get_bandwidth_rates():
    return BANDWIDTH_RATES

@app.put("/api/bandwidth-rates")
def update_bandwidth_rates(rates: dict[str, float]):
    BANDWIDTH_RATES.clear()
    BANDWIDTH_RATES.update(rates)
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

        result.append({
            "creator": str(creator),
            "team": team,
            "area": area,
            "total_tickets": int(len(grp)),
            "last_ticket_date": last_ts.isoformat() if pd.notna(last_ts) else None,
            "days_since_last": int(days_since),
            "remove_access": days_since > 56,
            "engagement_tier": tier,
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
    return {"message": "SLA rules updated", "rules": SLA_RULES}

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
    if date_col not in df.columns or "sub_category" not in df.columns:
        return {"rows": [], "sub_categories": []}
    tmp = _filter_by_range(df, date_col, date_from, date_to)
    tmp = _apply_dim_filters(tmp, assigned_to=assigned_to, area=area, team=team, sub_category=sub_category)
    tmp = tmp.dropna(subset=[date_col, "sub_category"]).copy()
    if tmp.empty:
        return {"rows": [], "sub_categories": []}
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
    if assigned_to  and "assigned_to"  in df.columns: df = df[df["assigned_to"]  == assigned_to]
    if team         and "team"         in df.columns: df = df[df["team"]         == team]
    if area         and "area"         in df.columns: df = df[df["area"]         == area]
    if sub_category and "sub_category" in df.columns: df = df[df["sub_category"] == sub_category]
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
    col = tmp[date_col]
    if date_from:
        try:
            tmp = tmp[col >= pd.Timestamp(date_from)]
        except Exception:
            pass
    if date_to:
        try:
            tmp = tmp[col <= pd.Timestamp(date_to) + pd.Timedelta(days=1)]
        except Exception:
            pass
    return tmp


# ── Serve built React app (production) ────────────────────────────────────────
_STATIC_DIR = Path(__file__).parent / "dist"

if _STATIC_DIR.is_dir():
    _INDEX_HTML = (_STATIC_DIR / "index.html").read_text()
    app.mount("/assets", StaticFiles(directory=str(_STATIC_DIR / "assets")), name="assets")

    @app.get("/", response_class=HTMLResponse, include_in_schema=False)
    async def serve_root():
        return _INDEX_HTML

    @app.get("/{full_path:path}", response_class=HTMLResponse, include_in_schema=False)
    async def spa_fallback(full_path: str):
        return _INDEX_HTML
