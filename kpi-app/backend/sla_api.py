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

def _avg(values: list) -> Optional[float]:
    real = [v for v in (_finite(v) for v in values) if v is not None]
    return round(sum(real) / len(real), 2) if real else None


def _hours(seconds) -> Optional[float]:
    seconds = _finite(seconds)
    return None if seconds is None else round(seconds / 3600.0, 1)


def _group(rows: list, field: str) -> list:
    """One entry per Area, frontline or service.

    Durations leave here as seconds and are turned into hours or days by
    whatever is displaying them. Sending a unit over the wire is what let a
    nine-hour working day and a twenty-four-hour calendar day end up on the
    same axis, so the unit is now chosen once, where the figure is read.
    """
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
            "avg_elapsed_seconds": _avg([r["elapsed_seconds"] for r in items]),
            "avg_working_seconds": _avg([r["working_seconds"] for r in items]),
            "avg_off_hours_seconds": _avg([r["off_hours_seconds"] for r in items]),
            "avg_ours_seconds": _avg([r["ours_working_seconds"] for r in items]),
            "avg_waiting_seconds": _avg([r["waiting_working_seconds"] for r in items]),
            "off_hours_seconds": sum((r["off_hours_seconds"] or 0) for r in items),
            **saving(items),
        })
    return sorted(out, key=lambda g: (-g["tickets"], g["name"]))


def _stage_seconds(rows: list, stages) -> float:
    """Working time across a set of stages, summed over these tickets."""
    return sum(seconds
               for r in rows
               for stage, seconds in r["stage_working"].items()
               if stage in stages)


def saving(rows: list) -> dict:
    """Hours the team is charged for that it was not working the ticket.

    ServiceNow bills a ticket from creation to close. Of that, only the states
    where the team holds the ticket — Assigned, Work in progress, Open — are
    hours anyone could have spent on it. What is left is the saving: the ticket
    sitting with someone else, the hours after it was closed, and the nights,
    weekends and holidays the tracker counted anyway.

        recorded = worked + waiting + after close + off the clock
        saved    = recorded - worked

    Work in progress is called out inside `worked` because it is the sharpest
    reading of hands-on time: Assigned and Open are the team's hours in the
    sense that no one else is holding the ticket, not in the sense that someone
    is at it.
    """
    recorded = sum((r["elapsed_seconds"] or 0) for r in rows)
    worked = _stage_seconds(rows, OURS)
    waiting = _stage_seconds(rows, WAITING)
    after_close = _stage_seconds(rows, TERMINAL)
    off_hours = sum((r["off_hours_seconds"] or 0) for r in rows)
    saved = max(0.0, recorded - worked)
    return {
        "recorded_seconds": recorded,
        "worked_seconds": worked,
        "wip_seconds": _stage_seconds(rows, ("Work in progress",)),
        "waiting_stage_seconds": waiting,
        "after_close_seconds": after_close,
        "off_the_clock_seconds": off_hours,
        "saved_seconds": saved,
        "saved_share": round(saved / recorded * 100, 1) if recorded else 0.0,
        "avg_worked_seconds": (worked / len(rows)) if rows else None,
        "avg_wip_seconds": (_stage_seconds(rows, ("Work in progress",)) / len(rows)) if rows else None,
        "avg_saved_seconds": (saved / len(rows)) if rows else None,
    }


# Which field each filter narrows, and what it is called on the page.
FILTER_FIELDS = {"area": "area", "team": "team", "service": "sub_category"}


def filter_options(rows: list) -> dict:
    """The values each filter can take, busiest first.

    Built from every row rather than from what the current filters leave, so
    choosing an Area does not empty the frontline list and strand whoever is
    reading it with no way back.
    """
    out = {}
    for name, field in FILTER_FIELDS.items():
        counts: dict = {}
        for r in rows:
            value = (r.get(field) or "").strip()
            if value:
                counts[value] = counts.get(value, 0) + 1
        out[name] = [{"name": k, "count": v}
                     for k, v in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))]
    return out


def apply_filters(rows: list, selected: dict) -> list:
    for name, field in FILTER_FIELDS.items():
        wanted = (selected.get(name) or "").strip()
        if wanted:
            rows = [r for r in rows if (r.get(field) or "").strip() == wanted]
    return rows


def compute(rows: list, selected: Optional[dict] = None) -> dict:
    everything = enrich(rows)
    options = filter_options(everything)
    selected = {k: v for k, v in (selected or {}).items() if v}
    enriched = apply_filters(everything, selected) if selected else everything

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
        # Per ticket that actually passed through the stage — the figure that
        # says what a state costs, which a total across every ticket does not.
        g["avg_working_seconds"] = (g["working_seconds"] / g["tickets"]) if g["tickets"] else None
        g["avg_tracked_seconds"] = (g["tracked_seconds"] / g["tickets"]) if g["tickets"] else None

    ours_working = sum((r["ours_working_seconds"] or 0) for r in timed)
    waiting_working = sum((r["waiting_working_seconds"] or 0) for r in timed)

    worst = sorted([r for r in timed if r["waiting_working_seconds"]],
                   key=lambda r: -(r["waiting_working_seconds"] or 0))[:20]

    return {
        "tickets": len(enriched),
        "matched": len(matched),
        "unmatched": len(enriched) - len(matched),
        "timed": len(timed),
        "total_tickets": len(everything),
        "filters": options,
        "selected": selected,
        "elapsed_seconds": elapsed_total,
        "working_seconds": working_total,
        "off_hours_seconds": off_total,
        "off_hours_share": round(off_total / elapsed_total * 100, 1) if elapsed_total else 0.0,
        "avg_elapsed_seconds": _avg([r["elapsed_seconds"] for r in timed]),
        "avg_working_seconds": _avg([r["working_seconds"] for r in timed]),
        "ours_working_seconds": ours_working,
        "waiting_working_seconds": waiting_working,
        **saving(timed),
        "waiting_share": round(waiting_working / (ours_working + waiting_working) * 100, 1)
                         if (ours_working + waiting_working) else 0.0,
        "by_area": _group(timed, "area"),
        "by_team": _group(timed, "team"),
        "by_service": _group(timed, "sub_category"),
        "by_stage": by_stage,
        "worst": [{"number": r["number"], "title": r["title"], "area": r["area"], "team": r["team"],
                   "service": r["sub_category"],
                   "elapsed_seconds": r["elapsed_seconds"],
                   "working_seconds": r["working_seconds"],
                   "ours_seconds": r["ours_working_seconds"],
                   "waiting_seconds": r["waiting_working_seconds"]} for r in worst],
        "unmatched_numbers": [r["number"] for r in enriched if not r["matched"]][:40],
        "stage_split": {"ours": list(OURS), "waiting": list(WAITING), "terminal": list(TERMINAL)},
        "rows": [{k: v for k, v in r.items() if k != "stage_working"} for r in enriched],
    }


def _tickets(n: int) -> str:
    return f"{n} ticket" if n == 1 else f"{n} tickets"


def describe_scope(selected: dict) -> str:
    """" in EU", " in EU · NORD", or nothing at all.

    A filtered report reads as if it were the whole estate unless it says
    otherwise, so the narrative and the Excel pack both carry what was chosen.
    """
    parts = [v for v in (selected.get("area"), selected.get("team"),
                         selected.get("service")) if v]
    return f" {' · '.join(parts)}" if parts else ""


def headline(m: dict) -> list:
    lines = []
    if not m["timed"]:
        return lines

    scope = describe_scope(m["selected"])
    elapsed_days = (m["elapsed_seconds"] or 0) / 86400.0
    working_days = (m["working_seconds"] or 0) / 86400.0
    working_hours = (m["working_seconds"] or 0) / 3600.0
    off_days = (m["off_hours_seconds"] or 0) / 86400.0

    lines.append(
        f"{m['timed']} of {m['tickets']}{scope} tickets have both a created and a closed date, so "
        f"their working time is exact. Between them ServiceNow recorded {elapsed_days:,.0f} calendar "
        f"days, of which {working_days:,.0f} fell inside 09:00-18:00, Monday to Friday, holidays "
        f"excluded — {working_hours:,.0f} working hours.")
    lines.append(
        f"{off_days:,.0f} days — {m['off_hours_share']}% of everything the tracker counted — fell "
        f"outside working hours. That is time no one could have been working, and it is counted "
        f"against the team by any figure taken straight from ServiceNow.")
    if m["avg_elapsed_seconds"] and m["avg_working_seconds"]:
        lines.append(
            f"The average ticket reads {m['avg_elapsed_seconds'] / 86400.0:.1f} calendar days but "
            f"{m['avg_working_seconds'] / 3600.0:.1f} working hours of actual attention.")
    if m["waiting_share"]:
        lines.append(
            f"Of that working time, {m['waiting_share']}% was spent in states waiting on someone "
            f"outside the team ({', '.join(WAITING)}) rather than being worked on.")
    # What a ticket costs in the state the team is actually working it, which is
    # the figure hours were wanted for: days flatten it to a number near zero.
    wip = next((s for s in m["by_stage"] if s["stage"] == "Work in progress"), None)
    if wip and wip.get("avg_working_seconds"):
        lines.append(
            f"A ticket that reaches Work in progress spends "
            f"{wip['avg_working_seconds'] / 3600.0:.1f} working hours there on average, across "
            f"{_tickets(wip['tickets'])}.")
    if m["saved_seconds"]:
        lines.append(
            f"ServiceNow charges these tickets {m['recorded_seconds'] / 3600.0:,.0f} hours end to "
            f"end, but only {m['worked_seconds'] / 3600.0:,.0f} of those are hours the team held "
            f"the ticket inside working time — {m['wip_seconds'] / 3600.0:,.0f} of them in Work in "
            f"progress. The other {m['saved_seconds'] / 3600.0:,.0f} hours "
            f"({m['saved_share']}%) are hours saved: the ticket waiting on someone else, sitting "
            f"closed, or the clock running overnight and at weekends.")
    if m["by_team"]:
        best = max(m["by_team"], key=lambda t: t["saved_seconds"] or 0)
        if best["saved_seconds"]:
            lines.append(
                f"{best['name']} saves the most: {best['saved_seconds'] / 3600.0:,.0f} of its "
                f"{best['recorded_seconds'] / 3600.0:,.0f} recorded hours were not hours it could "
                f"have been working, across {_tickets(best['timed'])}.")
        worst = max(m["by_team"], key=lambda t: t["avg_waiting_seconds"] or 0)
        if worst["avg_waiting_seconds"]:
            lines.append(
                f"{worst['name']} waits longest: {worst['avg_waiting_seconds'] / 3600.0:.1f} working "
                f"hours per ticket on average across {_tickets(worst['tickets'])}.")
    if m["unmatched"]:
        one = m["unmatched"] == 1
        lines.append(
            f"{m['unmatched']} ticket{'' if one else 's'} in the sheet {'was' if one else 'were'} "
            f"not found in the ServiceNow data, so {'it carries' if one else 'they carry'} no Area "
            f"or frontline and {'is' if one else 'are'} left out of the groupings.")
    return lines



# Hours throughout: a stage a ticket sat in for an afternoon is 0.19 days, which
# reads as nothing, and 4.5 hours, which reads as an afternoon.
TABLE_COLUMNS = ["Ticket", "Title", "Service", "Area", "Frontline", "Assigned To", "State",
                 "Created", "Closed", "Calendar hours", "Working hours", "Off-hours",
                 "Ours (working h)", "Waiting (working h)"] + [f"{s} (h)" for s in STAGES]


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
            "Calendar hours": _fmt(_hours(r["elapsed_seconds"])),
            "Working hours": _fmt(_hours(r["working_seconds"])),
            "Off-hours": _fmt(_hours(r["off_hours_seconds"])),
            "Ours (working h)": _fmt(_hours(r["ours_working_seconds"])),
            "Waiting (working h)": _fmt(_hours(r["waiting_working_seconds"])),
        }
        for stage in STAGES:
            flat[f"{stage} (h)"] = _fmt(_hours(r["stages"].get(stage)))
        out.append(flat)
    return out


def _fmt(value) -> str:
    return "" if value is None else f"{value:,.1f}"

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
async def metrics(area: str = "", team: str = "", service: str = ""):
    rows, meta = load_rows()
    if not rows:
        raise HTTPException(404, "No SLA sheet has been uploaded yet")
    m = compute(rows, {"area": area, "team": team, "service": service})
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
async def report_xlsx(area: str = "", team: str = "", service: str = ""):
    rows, _ = load_rows()
    if not rows:
        raise HTTPException(404, "No SLA sheet has been uploaded yet")
    m = compute(rows, {"area": area, "team": team, "service": service})
    scope = describe_scope(m["selected"])

    buf = io.BytesIO()
    wb = xlsxwriter.Workbook(buf, {"in_memory": True})
    hdr = wb.add_format({"bold": True, "bg_color": "#1450f5", "font_color": "#ffffff", "border": 1})
    bold = wb.add_format({"bold": True})
    wrap = wb.add_format({"text_wrap": True, "valign": "top"})
    num = wb.add_format({"num_format": "#,##0.0"})

    ws = wb.add_worksheet("Summary")
    ws.set_column(0, 0, 112)
    ws.write(0, 0, f"SLA and time tracking{scope} — 09:00-18:00, Mon-Fri, holidays excluded", bold)
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

    # Every duration is held in seconds and turned into hours here, once, so the
    # pack cannot disagree with the page about what a number means.
    def in_hours(records, keys):
        out = []
        for rec in records:
            copy = dict(rec)
            for key in keys:
                copy[key] = _hours(rec.get(key))
            out.append(copy)
        return out

    grp_keys = ["avg_elapsed_seconds", "avg_off_hours_seconds", "avg_working_seconds",
                "avg_ours_seconds", "avg_waiting_seconds", "off_hours_seconds",
                "recorded_seconds", "worked_seconds", "wip_seconds", "saved_seconds",
                "avg_worked_seconds", "avg_wip_seconds", "avg_saved_seconds"]
    grp = [("Name", "name"), ("Tickets", "tickets"),
           ("Recorded hours", "recorded_seconds"), ("Worked hours", "worked_seconds"),
           ("Work in progress hours", "wip_seconds"), ("Hours saved", "saved_seconds"),
           ("Saved %", "saved_share"),
           ("Avg worked (h)", "avg_worked_seconds"), ("Avg WIP (h)", "avg_wip_seconds"),
           ("Avg saved (h)", "avg_saved_seconds"),
           ("Avg calendar hours", "avg_elapsed_seconds"),
           ("Avg off-hours", "avg_off_hours_seconds"),
           ("Avg working hours", "avg_working_seconds"), ("Avg ours (h)", "avg_ours_seconds"),
           ("Avg waiting (h)", "avg_waiting_seconds"), ("Total off-hours", "off_hours_seconds")]
    table("By Area", grp, in_hours(m["by_area"], grp_keys))
    table("By Frontline", grp, in_hours(m["by_team"], grp_keys))
    table("By Service", grp, in_hours(m["by_service"], grp_keys))
    table("By Stage", [("Stage", "stage"), ("Side", "side"), ("Tickets", "tickets"),
                       ("Tracked hours", "tracked_seconds"), ("Working hours", "working_seconds"),
                       ("Avg working hours per ticket", "avg_working_seconds")],
          in_hours(m["by_stage"], ["tracked_seconds", "working_seconds", "avg_working_seconds"]))
    table("Longest waits", [("Ticket", "number"), ("Title", "title"), ("Area", "area"),
                            ("Frontline", "team"), ("Service", "service"),
                            ("Calendar hours", "elapsed_seconds"),
                            ("Working hours", "working_seconds"), ("Ours (h)", "ours_seconds"),
                            ("Waiting (h)", "waiting_seconds")],
          in_hours(m["worst"], ["elapsed_seconds", "working_seconds", "ours_seconds", "waiting_seconds"]))

    data = wb.add_worksheet("Tickets")
    cols = ["number", "title", "sub_category", "area", "team", "assigned_to", "state",
            "created", "closed"]
    labels = ["Ticket", "Title", "Service", "Area", "Frontline", "Assigned To", "State",
              "Created", "Closed", "Calendar hours", "Working hours", "Off-hours",
              "Ours (working h)", "Waiting (working h)"] + [f"{stage} (h)" for stage in STAGES]
    data.write_row(0, 0, labels, hdr)
    for i, r in enumerate(m["rows"], start=1):
        for j, key in enumerate(cols):
            data.write_string(i, j, str(r.get(key, "") or ""))
        figures = [_hours(r["elapsed_seconds"]), _hours(r["working_seconds"]),
                   _hours(r["off_hours_seconds"]), _hours(r["ours_working_seconds"]),
                   _hours(r["waiting_working_seconds"])]
        figures += [_hours(r["stages"].get(stage)) for stage in STAGES]
        for j, value in enumerate(figures, start=len(cols)):
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
