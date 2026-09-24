"""SLA and time tracking.

ServiceNow records how long each ticket sat in each state, but its clock never
stops: it counts nights, weekends and public holidays the same as a Tuesday
morning. The team works 09:00-18:00, Monday to Friday, and observes the Tamil
Nadu holidays already listed in main.py. So a ticket reported as 37 days old
has had far less than 37 days of anyone's attention, and judging the team on
the raw figure is judging them for the hours they were not at work.

This module puts the two together. The duration sheet is uploaded here and
matched to the ticket data on ticket number, which supplies the created and
closed timestamps — and those make the working-time figure exact rather than
estimated, using the same business_hours_between the rest of the tool uses.

What is exact and what is apportioned is worth being precise about, because
they are different claims:

  * A ticket's working time is exact. It comes from real timestamps.
  * A single stage's working time is apportioned. The sheet gives stage
    durations but no timestamps for them, so there is no way to know which
    hours of "14 d 21 h in review" fell inside a working day. Each stage is
    given its share of the ticket's exact working time, in proportion to its
    share of the elapsed time. Across many tickets that is sound; for one
    stage of one ticket it is an estimate, and the API says so.
"""
from __future__ import annotations

import base64
import io
import json
import math
import re
from typing import Callable, Optional

import pandas as pd
import xlsxwriter
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/sla", tags=["sla"])

_get_conn: Optional[Callable] = None
_diagnose: Optional[Callable] = None
_ticket_frame: Optional[Callable] = None
_business_hours: Optional[Callable] = None


def configure(get_conn: Callable, diagnose: Optional[Callable] = None,
              ticket_frame: Optional[Callable] = None,
              business_hours: Optional[Callable] = None) -> None:
    """Dependencies are injected rather than imported so this module never
    imports main, which imports it."""
    global _get_conn, _diagnose, _ticket_frame, _business_hours
    _get_conn = get_conn
    _diagnose = diagnose
    _ticket_frame = ticket_frame
    _business_hours = business_hours
    _init_schema()


# ── Stages ───────────────────────────────────────────────────────────────────
# Which states mean the team is working and which mean it is waiting on someone
# else. This split is the difference between a fair SLA figure and an unfair
# one: on the supplied data, On Hold and In review together are well over half
# of all recorded time, and none of it is time anyone could have been working.
#
# It is a judgement about how the team uses ServiceNow, not a fact about the
# data, so it lives here as one editable list and is reported alongside every
# figure that depends on it.
OURS = ("Assigned", "Work in progress", "Open")
WAITING = ("On Hold", "In review", "Pending Confirmation")
# End states. A duration recorded against them is the tail after the work
# finished, so it belongs to neither clock.
TERMINAL = ("Confirmation Completed", "Closed Completed", "Closed Rejected")
STAGES = OURS + WAITING + TERMINAL

_STAGE_LOOKUP = {s.lower(): s for s in STAGES}

# "14 d 21 h 46 m 50 s", "6 s", "" — any part may be absent.
_DURATION_RE = re.compile(
    r"^\s*(?:(\d+)\s*d)?\s*(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?\s*(?:(\d+)\s*s)?\s*$", re.I)
_TICKET_RE = re.compile(r"^(PC|INC|RITM|TASK)\d+$", re.I)


def parse_duration(value) -> Optional[float]:
    """Seconds for a "14 d 21 h 46 m 50 s" string, or None when empty."""
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    m = _DURATION_RE.match(text)
    if not m or not any(m.groups()):
        return None
    d, h, mi, s = (int(x) if x else 0 for x in m.groups())
    return d * 86400 + h * 3600 + mi * 60 + s


def _looks_like_ticket(value) -> bool:
    return bool(_TICKET_RE.match(str(value or "").strip()))


# ── Reading the sheet ────────────────────────────────────────────────────────

def pick_sheet(book: dict) -> tuple:
    """The sheet with the most ticket numbers in its first column.

    The export has a flat sheet and a pivoted one holding the same rows with
    sub-category subtotals interleaved. Choosing by how many real ticket
    numbers a sheet carries picks the flat one without depending on its name,
    and still works if only the pivoted sheet is sent — the subtotal rows have
    a sub-category where a ticket number should be, so they simply do not
    count and are skipped on read.
    """
    best, best_name, best_score = None, "", (-1, -1)
    for name, frame in book.items():
        if frame.empty:
            continue
        hits = int(frame.iloc[:, 0].map(_looks_like_ticket).sum())
        # Both sheets of the supplied export carry the same 594 tickets, but only
        # the flat one names the service. Ticket count decides first; a service
        # column breaks the tie, so the sheet that can be grouped by service wins.
        has_service = int(any(str(c).strip().lower() in ("service", "sub-category", "sub category")
                              for c in frame.columns))
        score = (hits, has_service)
        if score > best_score:
            best, best_name, best_score = frame, name, score
    if best is None or best_score[0] <= 0:
        raise HTTPException(400, "No sheet in that file has ticket numbers in its first column")
    return best, best_name


def parse_sheet(frame: pd.DataFrame) -> list:
    frame = frame.rename(columns={c: re.sub(r"\s+", " ", str(c)).strip() for c in frame.columns})
    columns = list(frame.columns)
    # Stage columns are matched by name, so a reordered or partial export still
    # lands correctly and an unexpected column is ignored rather than guessed at.
    stage_cols = {c: _STAGE_LOOKUP[c.lower()] for c in columns if c.lower() in _STAGE_LOOKUP}
    if not stage_cols:
        raise HTTPException(
            400,
            "None of the stage columns were found. Expected some of: "
            + ", ".join(STAGES) + f". Columns present: {', '.join(map(str, columns))}",
        )
    service_col = next((c for c in columns if c.lower() in ("service", "sub-category", "sub category")), None)

    rows = []
    for record in frame.to_dict(orient="records"):
        number = _text(record.get(columns[0]))
        if not _looks_like_ticket(number):
            continue          # subtotal or blank row
        stages = {}
        for col, stage in stage_cols.items():
            seconds = parse_duration(record.get(col))
            if seconds:
                stages[stage] = seconds
        rows.append({
            "number": number.upper(),
            "service": _text(record.get(service_col)) if service_col else "",
            "stages": stages,
            "tracked_seconds": sum(stages.values()),
        })
    if not rows:
        raise HTTPException(400, "No ticket rows found in that sheet")
    return rows


# ── Storage ──────────────────────────────────────────────────────────────────

_SCHEMA = """
CREATE TABLE IF NOT EXISTS sla_sheet (
    id           INT PRIMARY KEY DEFAULT 1,
    rows         JSONB NOT NULL,
    row_count    INT NOT NULL DEFAULT 0,
    uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    uploaded_by  TEXT,
    filename     TEXT,
    CONSTRAINT sla_sheet_single CHECK (id = 1)
);
"""


class NoDatabase(HTTPException):
    def __init__(self, detail: Optional[str] = None):
        super().__init__(503, detail or "No database configured — set DATABASE_URL on the service.")


def _conn():
    if _get_conn is None:
        raise NoDatabase()
    c = _get_conn()
    if c is None:
        reason = None
        if _diagnose is not None:
            try:
                reason = _diagnose()
            except Exception:
                reason = None
        raise NoDatabase(reason)
    return c


def _init_schema() -> None:
    try:
        c = _conn()
    except HTTPException:
        print("[SLA] No database — table not created", flush=True)
        return
    try:
        with c, c.cursor() as cur:
            cur.execute(_SCHEMA)
        print("[SLA] Table ready", flush=True)
    except Exception as exc:
        print(f"[SLA] Schema init failed: {exc}", flush=True)
    finally:
        try:
            c.close()
        except Exception:
            pass


def load_rows() -> tuple:
    c = _conn()
    try:
        with c, c.cursor() as cur:
            cur.execute(_SCHEMA)
            cur.execute("SELECT rows, row_count, uploaded_at, uploaded_by, filename FROM sla_sheet WHERE id = 1")
            got = cur.fetchone()
    finally:
        try:
            c.close()
        except Exception:
            pass
    if not got:
        return [], {}
    rows = got[0] if isinstance(got[0], list) else json.loads(got[0])
    return rows, {"row_count": got[1], "uploaded_at": got[2].isoformat() if got[2] else None,
                  "uploaded_by": got[3], "filename": got[4]}


def save_rows(rows: list, filename: str, who: Optional[str]) -> None:
    c = _conn()
    try:
        with c, c.cursor() as cur:
            cur.execute(_SCHEMA)
            cur.execute(
                """INSERT INTO sla_sheet (id, rows, row_count, uploaded_at, uploaded_by, filename)
                   VALUES (1, %s, %s, now(), %s, %s)
                   ON CONFLICT (id) DO UPDATE SET
                     rows = EXCLUDED.rows, row_count = EXCLUDED.row_count,
                     uploaded_at = now(), uploaded_by = EXCLUDED.uploaded_by,
                     filename = EXCLUDED.filename""",
                (json.dumps(rows), len(rows), who, filename),
            )
    finally:
        try:
            c.close()
        except Exception:
            pass


# ── Joining to the ticket data ───────────────────────────────────────────────

def _text(value) -> str:
    """A cell as text, where pandas' idea of blank is blank.

    A missing string in a DataFrame comes back as the float NaN, and `value or
    ""` keeps it because NaN is truthy. That put a float where a title or an
    Area belonged and broke the whole response, since JSON has no NaN.
    """
    if value is None:
        return ""
    try:
        if pd.isna(value):
            return ""
    except (TypeError, ValueError):
        pass                      # arrays and the like are never blank
    return str(value).strip()


def _finite(value):
    """A number JSON can carry, or None. NaN and infinity are neither."""
    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _ticket_lookup() -> dict:
    """Ticket number → the fields the report groups by, plus its timestamps."""
    if _ticket_frame is None:
        return {}
    try:
        df = _ticket_frame()
    except Exception:                                           # noqa: BLE001
        return {}
    if df is None or df.empty or "ticket_number" not in df.columns:
        return {}
    keep = [c for c in ("ticket_number", "created_date", "closed_date", "area", "team",
                        "assigned_to", "short_description", "sub_category", "state")
            if c in df.columns]
    out = {}
    for rec in df[keep].to_dict(orient="records"):
        number = _text(rec.get("ticket_number")).upper()
        if number:
            out[number] = rec
    return out


HOURS_PER_WORKING_DAY = 9.0      # 09:00-18:00, matching main.py


def enrich(rows: list) -> list:
    """Each SLA row with its ticket's fields and its working-time figures."""
    tickets = _ticket_lookup()
    out = []
    for row in rows:
        ticket = tickets.get(row["number"], {})
        # A ticket that is still open has no closed date, and pandas spells that
        # NaT — which is not None, so it has to be tested for rather than
        # checked against None. Both figures below need two real timestamps.
        created = ticket.get("created_date")
        closed = ticket.get("closed_date")
        if created is None or closed is None or pd.isna(created) or pd.isna(closed):
            created = closed = None

        elapsed_seconds = None
        if created is not None:
            delta = (pd.Timestamp(closed) - pd.Timestamp(created)).total_seconds()
            elapsed_seconds = delta if delta > 0 else 0.0

        working_seconds = None
        if _business_hours is not None and created is not None:
            working_seconds = _finite(_business_hours(created, closed))
            if working_seconds is not None:
                working_seconds *= 3600.0

        # Stage shares come from the tracked durations; the quantity being
        # shared out is the ticket's exact working time.
        tracked = row.get("tracked_seconds") or 0
        stage_working = {}
        if working_seconds is not None and tracked > 0:
            for stage, seconds in row["stages"].items():
                stage_working[stage] = working_seconds * (seconds / tracked)

        ours = sum(v for s, v in row["stages"].items() if s in OURS)
        waiting = sum(v for s, v in row["stages"].items() if s in WAITING)
        ours_working = sum(v for s, v in stage_working.items() if s in OURS) or None
        waiting_working = sum(v for s, v in stage_working.items() if s in WAITING) or None

        out.append({
            **row,
            "matched": bool(ticket),
            "area": _text(ticket.get("area")),
            "team": _text(ticket.get("team")),
            "assigned_to": _text(ticket.get("assigned_to")),
            "title": _text(ticket.get("short_description")),
            "state": _text(ticket.get("state")),
            "sub_category": _text(ticket.get("sub_category")) or _text(row.get("service")),
            "created": str(created) if created is not None else "",
            "closed": str(closed) if closed is not None else "",
            "elapsed_seconds": elapsed_seconds,
            "working_seconds": working_seconds,
            # What the round-the-clock tracker counted that nobody could have
            # been working — the number this report exists to surface.
            "off_hours_seconds": (None if elapsed_seconds is None or working_seconds is None
                                  else max(0.0, elapsed_seconds - working_seconds)),
            "stage_working": stage_working,
            "ours_seconds": ours,
            "waiting_seconds": waiting,
            "ours_working_seconds": ours_working,
            "waiting_working_seconds": waiting_working,
        })
    return out


# ── Metrics ──────────────────────────────────────────────────────────────────

def _days(seconds) -> Optional[float]:
    seconds = _finite(seconds)
    return None if seconds is None else round(seconds / 86400.0, 2)


def _working_days(seconds) -> Optional[float]:
    """Working days, where a day is nine hours — not twenty-four. Dividing
    working seconds by 86400 would quietly report a fifth of the real figure."""
    seconds = _finite(seconds)
    return None if seconds is None else round(seconds / (HOURS_PER_WORKING_DAY * 3600.0), 2)


def _avg(values: list) -> Optional[float]:
    real = [v for v in (_finite(v) for v in values) if v is not None]
    return round(sum(real) / len(real), 2) if real else None


def _group(rows: list, field: str) -> list:
    groups: dict = {}
    for r in rows:
        key = (r.get(field) or "").strip() or "(blank)"
        groups.setdefault(key, []).append(r)
    out = []
    for name, items in groups.items():
        timed = [r for r in items if r["working_seconds"] is not None]
        out.append({
            "name": name,
            "tickets": len(items),
            "timed": len(timed),
            "avg_elapsed_days": _avg([_days(r["elapsed_seconds"]) for r in items]),
            "avg_working_days": _avg([_working_days(r["working_seconds"]) for r in items]),
            # The same working time counted in whole days rather than nine-hour
            # ones. It reads lower, and it is the only version that can be put on
            # an axis beside the elapsed figure: there the gap between the two
            # bars is exactly the off-hours time, because both are days of the
            # same length. Charting nine-hour days against calendar days would
            # make that gap a number of nothing.
            "avg_working_calendar_days": _avg([_days(r["working_seconds"]) for r in items]),
            "avg_off_hours_days": _avg([_days(r["off_hours_seconds"]) for r in items]),
            "avg_ours_days": _avg([_working_days(r["ours_working_seconds"]) for r in items]),
            "avg_waiting_days": _avg([_working_days(r["waiting_working_seconds"]) for r in items]),
            "off_hours_days": round(sum((r["off_hours_seconds"] or 0) for r in items) / 86400.0, 1),
        })
    return sorted(out, key=lambda g: (-g["tickets"], g["name"]))


def compute(rows: list) -> dict:
    enriched = enrich(rows)
    matched = [r for r in enriched if r["matched"]]
    timed = [r for r in enriched if r["working_seconds"] is not None]

    elapsed_total = sum((r["elapsed_seconds"] or 0) for r in timed)
    working_total = sum((r["working_seconds"] or 0) for r in timed)
    off_total = sum((r["off_hours_seconds"] or 0) for r in timed)

    stage_totals = {}
    for r in enriched:
        for stage, seconds in r["stages"].items():
            g = stage_totals.setdefault(stage, {"stage": stage, "tracked_seconds": 0.0,
                                                "working_seconds": 0.0, "tickets": 0,
                                                "side": ("Ours" if stage in OURS else
                                                         "Waiting" if stage in WAITING else "Closed")})
            g["tracked_seconds"] += seconds
            g["tickets"] += 1
            g["working_seconds"] += r["stage_working"].get(stage, 0.0)
    by_stage = sorted(stage_totals.values(), key=lambda g: -g["tracked_seconds"])
    for g in by_stage:
        g["tracked_days"] = round(g["tracked_seconds"] / 86400.0, 1)
        g["working_days"] = round(g["working_seconds"] / (HOURS_PER_WORKING_DAY * 3600.0), 1)

    ours_working = sum((r["ours_working_seconds"] or 0) for r in timed)
    waiting_working = sum((r["waiting_working_seconds"] or 0) for r in timed)

    worst = sorted([r for r in timed if r["waiting_working_seconds"]],
                   key=lambda r: -(r["waiting_working_seconds"] or 0))[:20]

    return {
        "tickets": len(enriched),
        "matched": len(matched),
        "unmatched": len(enriched) - len(matched),
        "timed": len(timed),
        "elapsed_days": round(elapsed_total / 86400.0, 1),
        "working_days": round(working_total / (HOURS_PER_WORKING_DAY * 3600.0), 1),
        # Recorded, working and off-hours in one unit, so the three add up on the
        # page: elapsed_days = working_calendar_days + off_hours_days.
        "working_calendar_days": round(working_total / 86400.0, 1),
        "off_hours_days": round(off_total / 86400.0, 1),
        "off_hours_share": round(off_total / elapsed_total * 100, 1) if elapsed_total else 0.0,
        "avg_elapsed_days": _avg([_days(r["elapsed_seconds"]) for r in timed]),
        "avg_working_days": _avg([_working_days(r["working_seconds"]) for r in timed]),
        "ours_working_days": round(ours_working / (HOURS_PER_WORKING_DAY * 3600.0), 1),
        "waiting_working_days": round(waiting_working / (HOURS_PER_WORKING_DAY * 3600.0), 1),
        "waiting_share": round(waiting_working / (ours_working + waiting_working) * 100, 1)
                         if (ours_working + waiting_working) else 0.0,
        "by_area": _group(timed, "area"),
        "by_team": _group(timed, "team"),
        "by_service": _group(timed, "sub_category"),
        "by_stage": by_stage,
        "worst": [{"number": r["number"], "title": r["title"], "area": r["area"], "team": r["team"],
                   "elapsed_days": _days(r["elapsed_seconds"]),
                   "working_days": _working_days(r["working_seconds"]),
                   "ours_days": _working_days(r["ours_working_seconds"]),
                   "waiting_days": _working_days(r["waiting_working_seconds"])} for r in worst],
        "unmatched_numbers": [r["number"] for r in enriched if not r["matched"]][:40],
        "stage_split": {"ours": list(OURS), "waiting": list(WAITING), "terminal": list(TERMINAL)},
        "rows": [{k: v for k, v in r.items() if k != "stage_working"} for r in enriched],
    }


def headline(m: dict) -> list:
    lines = []
    if not m["timed"]:
        return lines
    lines.append(
        f"{m['timed']} of {m['tickets']} tickets have both a created and a closed date, so their "
        f"working time is exact. Between them ServiceNow recorded {m['elapsed_days']:,.0f} calendar "
        f"days, of which {m['working_calendar_days']:,.0f} fell inside 09:00-18:00, Monday to "
        f"Friday, holidays excluded — {m['working_days']:,.0f} working days of nine hours.")
    lines.append(
        f"{m['off_hours_days']:,.0f} days — {m['off_hours_share']}% of everything the tracker "
        f"counted — fell outside working hours. That is time no one could have been working, and it "
        f"is counted against the team by any figure taken straight from ServiceNow.")
    if m["avg_elapsed_days"] and m["avg_working_days"]:
        lines.append(
            f"The average ticket reads {m['avg_elapsed_days']} calendar days but "
            f"{m['avg_working_days']} working days of actual attention.")
    if m["waiting_share"]:
        lines.append(
            f"Of that working time, {m['waiting_share']}% was spent in states waiting on someone "
            f"outside the team ({', '.join(WAITING)}) rather than being worked on.")
    if m["by_team"]:
        worst = max(m["by_team"], key=lambda t: t["avg_waiting_days"] or 0)
        if worst["avg_waiting_days"]:
            lines.append(
                f"{worst['name']} waits longest: {worst['avg_waiting_days']} working days per ticket "
                f"on average across {worst['tickets']} tickets.")
    if m["unmatched"]:
        one = m["unmatched"] == 1
        lines.append(
            f"{m['unmatched']} ticket{'' if one else 's'} in the sheet {'was' if one else 'were'} "
            f"not found in the ServiceNow data, so {'it carries' if one else 'they carry'} no Area "
            f"or frontline and {'is' if one else 'are'} left out of the groupings.")
    return lines



TABLE_COLUMNS = ["Ticket", "Title", "Service", "Area", "Frontline", "Assigned To", "State",
                 "Created", "Closed", "Calendar days", "Working days", "Off-hours days",
                 "Ours (working days)", "Waiting (working days)"] + [f"{s} (days)" for s in STAGES]


def table_rows(rows: list) -> list:
    """One flat row per ticket for the master view.

    The stage durations are a nested map in the stored shape, which a table
    cannot render; here each stage becomes its own column so the sheet can be
    read and sorted like any other dataset in the master page.
    """
    out = []
    for r in enrich(rows):
        flat = {
            "Ticket": r["number"], "Title": r["title"], "Service": r["sub_category"],
            "Area": r["area"], "Frontline": r["team"], "Assigned To": r["assigned_to"],
            "State": r["state"], "Created": r["created"][:16], "Closed": r["closed"][:16],
            "Calendar days": _fmt(_days(r["elapsed_seconds"])),
            "Working days": _fmt(_working_days(r["working_seconds"])),
            "Off-hours days": _fmt(_days(r["off_hours_seconds"])),
            "Ours (working days)": _fmt(_working_days(r["ours_working_seconds"])),
            "Waiting (working days)": _fmt(_working_days(r["waiting_working_seconds"])),
        }
        for stage in STAGES:
            flat[f"{stage} (days)"] = _fmt(_days(r["stages"].get(stage)))
        out.append(flat)
    return out


def _fmt(value) -> str:
    return "" if value is None else f"{value:,.2f}"

# ── API ──────────────────────────────────────────────────────────────────────

def json_safe(value):
    """The same structure with nothing in it that JSON cannot express.

    Every figure here is already guarded at the point it is computed, but a
    single NaN anywhere fails the whole response with a message that names no
    field — so the responses are swept once more rather than trusting that the
    next field added will remember. NaN becomes null, which reads on the page
    as "no figure" rather than taking the report down.
    """
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, dict):
        return {k: json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_safe(v) for v in value]
    return value


class UploadBody(BaseModel):
    xlsx_base64: str = ""
    csv: str = ""
    filename: str = "SLA.xlsx"
    uploaded_by: str = ""


@router.post("/upload")
async def upload(body: UploadBody):
    if body.xlsx_base64:
        try:
            book = pd.read_excel(io.BytesIO(base64.b64decode(body.xlsx_base64)), sheet_name=None)
        except Exception as exc:
            raise HTTPException(400, f"Could not read the spreadsheet: {exc}")
        frame, sheet_name = pick_sheet(book)
    elif body.csv.strip():
        try:
            frame = pd.read_csv(io.StringIO(body.csv))
        except Exception as exc:
            raise HTTPException(400, f"Could not read the CSV: {exc}")
        sheet_name = "csv"
    else:
        raise HTTPException(400, "Attach a spreadsheet or CSV")

    rows = parse_sheet(frame)
    save_rows(rows, body.filename, body.uploaded_by or None)
    return {"saved": True, "row_count": len(rows), "sheet": sheet_name}


@router.get("")
async def get_rows():
    rows, meta = load_rows()
    return json_safe({"rows": table_rows(rows), "columns": TABLE_COLUMNS,
                      "stages": list(STAGES), **meta})


@router.get("/metrics")
async def metrics():
    rows, meta = load_rows()
    if not rows:
        raise HTTPException(404, "No SLA sheet has been uploaded yet")
    m = compute(rows)
    return json_safe({**m, "report": headline(m), **meta})


@router.delete("")
async def clear():
    c = _conn()
    try:
        with c, c.cursor() as cur:
            cur.execute(_SCHEMA)
            cur.execute("DELETE FROM sla_sheet WHERE id = 1")
    finally:
        try:
            c.close()
        except Exception:
            pass
    return {"cleared": True}


@router.get("/report.xlsx")
async def report_xlsx():
    rows, _ = load_rows()
    if not rows:
        raise HTTPException(404, "No SLA sheet has been uploaded yet")
    m = compute(rows)

    buf = io.BytesIO()
    wb = xlsxwriter.Workbook(buf, {"in_memory": True})
    hdr = wb.add_format({"bold": True, "bg_color": "#1450f5", "font_color": "#ffffff", "border": 1})
    bold = wb.add_format({"bold": True})
    wrap = wb.add_format({"text_wrap": True, "valign": "top"})
    num = wb.add_format({"num_format": "#,##0.0"})

    ws = wb.add_worksheet("Summary")
    ws.set_column(0, 0, 112)
    ws.write(0, 0, "SLA and time tracking — 09:00-18:00, Mon-Fri, holidays excluded", bold)
    for i, line in enumerate(headline(m), start=2):
        ws.write(i, 0, line, wrap)

    def table(name, columns, records):
        s = wb.add_worksheet(name[:31])
        s.write_row(0, 0, [c[0] for c in columns], hdr)
        for i, rec in enumerate(records, start=1):
            for j, (_, key) in enumerate(columns):
                v = rec.get(key)
                if isinstance(v, (int, float)) and not isinstance(v, bool):
                    s.write_number(i, j, v, num)
                else:
                    s.write_string(i, j, "" if v is None else str(v))
        for j, c in enumerate(columns):
            s.set_column(j, j, 34 if j == 0 else 16)

    grp = [("Name", "name"), ("Tickets", "tickets"), ("Avg calendar days", "avg_elapsed_days"),
           ("Avg off-hours days", "avg_off_hours_days"),
           ("Avg working days (9h)", "avg_working_days"), ("Avg ours (9h)", "avg_ours_days"),
           ("Avg waiting (9h)", "avg_waiting_days"), ("Total off-hours days", "off_hours_days")]
    table("By Area", grp, m["by_area"])
    table("By Frontline", grp, m["by_team"])
    table("By Service", grp, m["by_service"])
    table("By Stage", [("Stage", "stage"), ("Side", "side"), ("Tickets", "tickets"),
                       ("Tracked days", "tracked_days"), ("Working days", "working_days")], m["by_stage"])
    table("Longest waits", [("Ticket", "number"), ("Title", "title"), ("Area", "area"),
                            ("Frontline", "team"), ("Calendar days", "elapsed_days"),
                            ("Working days", "working_days"), ("Ours", "ours_days"),
                            ("Waiting", "waiting_days")], m["worst"])

    data = wb.add_worksheet("Tickets")
    cols = ["number", "title", "sub_category", "area", "team", "assigned_to", "state",
            "created", "closed"]
    labels = ["Ticket", "Title", "Service", "Area", "Frontline", "Assigned To", "State",
              "Created", "Closed", "Calendar days", "Working days", "Off-hours days",
              "Ours (working days)", "Waiting (working days)"]
    data.write_row(0, 0, labels, hdr)
    for i, r in enumerate(m["rows"], start=1):
        for j, key in enumerate(cols):
            data.write_string(i, j, str(r.get(key, "") or ""))
        for j, value in enumerate([_days(r["elapsed_seconds"]), _working_days(r["working_seconds"]),
                                   _days(r["off_hours_seconds"]),
                                   _working_days(r["ours_working_seconds"]),
                                   _working_days(r["waiting_working_seconds"])], start=len(cols)):
            if value is None:
                data.write_string(i, j, "")
            else:
                data.write_number(i, j, value, num)
    data.set_column(0, 0, 14)
    data.set_column(1, 1, 52)
    data.set_column(2, 8, 20)

    wb.close()
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="sla-time-tracking.xlsx"'},
    )
