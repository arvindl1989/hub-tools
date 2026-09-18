"""Service 2 — the journey delivery sheet.

A hand-maintained spreadsheet of journey requests: what was planned in which
quarter, what was delivered, what was rejected, and for which Area and
frontline. It is uploaded rather than synced, so an upload replaces the sheet
wholesale — there is no ServiceNow list behind it to reconcile against.

The aggregation lives here rather than in the browser so the KPI page and the
leadership export cannot drift apart: both read the same computed numbers.
"""
from __future__ import annotations

import base64
import io
import json
import re
from typing import Callable, Optional

import pandas as pd
import xlsxwriter
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/journeys", tags=["journeys"])

_get_conn: Optional[Callable] = None
_diagnose: Optional[Callable] = None


def configure(get_conn: Callable, diagnose: Optional[Callable] = None) -> None:
    global _get_conn, _diagnose
    _get_conn = get_conn
    _diagnose = diagnose
    _init_schema()


# ── Columns ──────────────────────────────────────────────────────────────────
# The source sheet's headers carry a typo and trailing spaces, and two of them
# differ only by a space — "Jounreys" is the individual request, "Journey " is
# the journey template it belongs to. Renaming them here means the rest of the
# code and every chart label reads as intended, and a later corrected sheet
# still lands on the same names.
_RENAME = {
    "jounreys": "Journey Instance",
    "journeys": "Journey Instance",
    "journey instance": "Journey Instance",
    "status": "Status",
    "completed in": "Completed In",
    "planned in": "Planned In",
    "area": "Area",
    "frontline": "Frontline",
    "type": "Type",
    "service lin": "Service Line",
    "service line": "Service Line",
    "journey": "Journey",
}
REQUIRED = ["Status", "Planned In", "Area", "Frontline", "Journey"]
COLUMNS = ["Row ID", "Journey Instance", "Journey", "Status", "Planned In",
           "Completed In", "Area", "Frontline", "Type", "Service Line"]

DONE, IN_PROGRESS, REJECTED, UNASSIGNED = "Done", "In Progress", "Rejected", "Un Assigned"
# What the user's definition of utilisation is: a planned slot counts as used
# when the work is done or under way, and unused when it was rejected or never
# picked up.
UTILISED = (DONE, IN_PROGRESS)

_STATUS_MAP = {
    "done": DONE, "complete": DONE, "completed": DONE,
    "in-progress": IN_PROGRESS, "in progress": IN_PROGRESS, "inprogress": IN_PROGRESS,
    "wip": IN_PROGRESS, "ongoing": IN_PROGRESS,
    "rejected": REJECTED, "reject": REJECTED, "cancelled": REJECTED, "canceled": REJECTED,
    "un assigned": UNASSIGNED, "unassigned": UNASSIGNED, "un-assigned": UNASSIGNED,
    "not assigned": UNASSIGNED,
}


def normalise_status(value: str) -> str:
    """Map a hand-typed status onto one of the four buckets.

    The sheet is maintained by hand, so "in-progress" arrives in whatever
    spelling and casing the author used that day; matching on a normalised key
    keeps a stray capital from creating a fifth status nobody charts.
    """
    key = re.sub(r"\s+", " ", str(value or "").strip()).lower()
    return _STATUS_MAP.get(key, str(value or "").strip())


_QUARTER_RE = re.compile(r"^Q([1-4])\s+(\d{4})$", re.I)


def quarter_index(value: str) -> Optional[int]:
    """A sortable number for "Q2 2026", or None for "-" and "Moved to Q4".

    Returning None rather than guessing is what keeps "Moved to Q4" — which
    names no year — out of the on-time arithmetic, where it would otherwise
    have to be invented into some quarter.
    """
    m = _QUARTER_RE.match(str(value or "").strip())
    if not m:
        return None
    return int(m.group(2)) * 4 + int(m.group(1))


# ── Storage ──────────────────────────────────────────────────────────────────

_SCHEMA = """
CREATE TABLE IF NOT EXISTS journey_sheet (
    id           INT PRIMARY KEY DEFAULT 1,
    rows         JSONB NOT NULL,
    row_count    INT NOT NULL DEFAULT 0,
    uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    uploaded_by  TEXT,
    filename     TEXT,
    CONSTRAINT journey_sheet_single CHECK (id = 1)
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
        print("[JOURNEYS] No database — table not created", flush=True)
        return
    try:
        with c, c.cursor() as cur:
            cur.execute(_SCHEMA)
        print("[JOURNEYS] Table ready", flush=True)
    except Exception as exc:
        print(f"[JOURNEYS] Schema init failed: {exc}", flush=True)
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
            cur.execute("SELECT rows, row_count, uploaded_at, uploaded_by, filename "
                        "FROM journey_sheet WHERE id = 1")
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
                """INSERT INTO journey_sheet (id, rows, row_count, uploaded_at, uploaded_by, filename)
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


# ── Parsing ──────────────────────────────────────────────────────────────────

def parse_sheet(frame: pd.DataFrame) -> list:
    frame = frame.rename(columns={
        col: _RENAME.get(re.sub(r"\s+", " ", str(col)).strip().lower(),
                          re.sub(r"\s+", " ", str(col)).strip())
        for col in frame.columns
    })
    missing = [c for c in REQUIRED if c not in frame.columns]
    if missing:
        raise HTTPException(
            400,
            f"The sheet is missing: {', '.join(missing)}. "
            f"Columns found: {', '.join(str(c) for c in frame.columns)}",
        )
    frame = frame.astype(object).where(pd.notna(frame), None)

    rows = []
    for i, record in enumerate(frame.to_dict(orient="records"), start=1):
        cleaned = {}
        for key, value in record.items():
            text = "" if value is None else re.sub(r"\s+", " ", str(value)).strip()
            cleaned[key] = text
        # A row with nothing in it is padding at the bottom of a spreadsheet,
        # not a journey.
        if not any(cleaned.get(c) for c in REQUIRED):
            continue
        cleaned["Status"] = normalise_status(cleaned.get("Status", ""))
        # Positional, assigned on upload. The sheet has no identifier of its
        # own and an upload replaces it wholesale, so there is nothing to keep
        # a content-derived key stable against — and hashing content would
        # silently merge two genuinely separate requests that happen to read
        # the same.
        cleaned["Row ID"] = f"J-{i:03d}"
        rows.append({c: cleaned.get(c, "") for c in COLUMNS})
    if not rows:
        raise HTTPException(400, "No data rows found in the sheet")
    return rows


# ── Metrics ──────────────────────────────────────────────────────────────────

# A frontline with one planned journey that was rejected is at 100% dropped and
# would outrank a frontline that dropped six of seven, which is the one actually
# worth a conversation. Four is the smallest sample that keeps the single-row
# frontlines out without hiding anything real on this sheet.
MIN_SAMPLE = 4


def _pct(part: int, whole: int) -> float:
    return round(part / whole * 100, 1) if whole else 0.0


def _bucket(rows: list, field: str) -> list:
    groups: dict = {}
    for row in rows:
        key = row.get(field) or "(blank)"
        g = groups.setdefault(key, {field.lower(): key, "total": 0, DONE: 0, IN_PROGRESS: 0,
                                    REJECTED: 0, UNASSIGNED: 0})
        g["total"] += 1
        if row["Status"] in g:
            g[row["Status"]] += 1
    out = []
    for g in groups.values():
        used = g[DONE] + g[IN_PROGRESS]
        out.append({
            "name": g[field.lower()], "total": g["total"],
            "done": g[DONE], "in_progress": g[IN_PROGRESS],
            "rejected": g[REJECTED], "unassigned": g[UNASSIGNED],
            "utilised": used,
            "done_pct": _pct(g[DONE], g["total"]),
            "rejected_pct": _pct(g[REJECTED] + g[UNASSIGNED], g["total"]),
            "util_pct": _pct(used, g["total"]),
        })
    return sorted(out, key=lambda r: (-r["total"], r["name"]))


def compute_metrics(rows: list) -> dict:
    total = len(rows)
    counts = {s: sum(1 for r in rows if r["Status"] == s)
              for s in (DONE, IN_PROGRESS, REJECTED, UNASSIGNED)}
    used = counts[DONE] + counts[IN_PROGRESS]

    quarters = {}
    for row in rows:
        q = row.get("Planned In") or "(blank)"
        g = quarters.setdefault(q, {"quarter": q, "total": 0, DONE: 0, IN_PROGRESS: 0,
                                     REJECTED: 0, UNASSIGNED: 0})
        g["total"] += 1
        if row["Status"] in g:
            g[row["Status"]] += 1
    by_quarter = []
    for g in quarters.values():
        u = g[DONE] + g[IN_PROGRESS]
        by_quarter.append({
            "quarter": g["quarter"], "planned": g["total"],
            "done": g[DONE], "in_progress": g[IN_PROGRESS],
            "rejected": g[REJECTED], "unassigned": g[UNASSIGNED],
            "utilised": u, "not_utilised": g["total"] - u,
            "util_pct": _pct(u, g["total"]),
            "sort": quarter_index(g["quarter"]) or 0,
        })
    by_quarter.sort(key=lambda r: (r["sort"], r["quarter"]))

    # Heat map: journey template against frontline, the axes asked for.
    journeys = [j["name"] for j in _bucket(rows, "Journey")]
    frontlines = [f["name"] for f in _bucket(rows, "Frontline")]
    cells = {}
    for row in rows:
        cells[(row.get("Journey") or "(blank)", row.get("Frontline") or "(blank)")] = \
            cells.get((row.get("Journey") or "(blank)", row.get("Frontline") or "(blank)"), 0) + 1
    grid = [[cells.get((j, f), 0) for f in frontlines] for j in journeys]

    # Delivery against plan. Only rows that were actually worked on can be on
    # or off plan; a rejected row was never going to land in a quarter.
    slip = {"on_plan": 0, "later": 0, "earlier": 0, "moved": 0,
            "no_quarter": 0, "not_delivered": 0}
    late_rows = []
    for row in rows:
        if row["Status"] not in UTILISED:
            slip["not_delivered"] += 1
            continue
        completed = row.get("Completed In") or ""
        if completed.lower().startswith("moved"):
            slip["moved"] += 1
            continue
        pi, ci = quarter_index(row.get("Planned In")), quarter_index(completed)
        if ci is None:
            slip["no_quarter"] += 1
        elif pi is None or ci == pi:
            slip["on_plan"] += 1
        elif ci > pi:
            slip["later"] += 1
            late_rows.append({"instance": row.get("Journey Instance", ""),
                              "planned": row.get("Planned In", ""), "completed": completed,
                              "frontline": row.get("Frontline", "")})
        else:
            slip["earlier"] += 1

    # Rows whose status and completion quarter contradict each other. Reported
    # rather than corrected: only the people who maintain the sheet know which
    # of the two fields is the wrong one.
    contradictions = [
        {"row_id": r["Row ID"], "instance": r.get("Journey Instance", ""),
         "status": r["Status"], "completed": r.get("Completed In", "")}
        for r in rows
        if r["Status"] not in UTILISED and (r.get("Completed In") or "") not in ("", "-")
    ]

    sizeable = [f for f in _bucket(rows, "Frontline") if f["total"] >= MIN_SAMPLE]
    attention = None
    if sizeable:
        worst = max(sizeable, key=lambda f: (f["rejected_pct"], f["total"]))
        # Only worth calling out if something is actually being dropped.
        if worst["rejected_pct"] > 0:
            attention = {
                "name": worst["name"],
                "dropped_pct": worst["rejected_pct"],
                "dropped": worst["rejected"] + worst["unassigned"],
                "total": worst["total"],
                "min_sample": MIN_SAMPLE,
            }

    return {
        "total": total,
        "status_counts": counts,
        "attention": attention,
        "utilised": used,
        "not_utilised": total - used,
        "util_pct": _pct(used, total),
        "by_quarter": by_quarter,
        "by_area": _bucket(rows, "Area"),
        "by_frontline": _bucket(rows, "Frontline"),
        "by_service_line": _bucket(rows, "Service Line"),
        "by_type": _bucket(rows, "Type"),
        "by_journey": _bucket(rows, "Journey"),
        "heatmap": {"journeys": journeys, "frontlines": frontlines, "grid": grid,
                    "max": max((max(r) for r in grid), default=0)},
        "slippage": slip,
        "late_rows": late_rows[:25],
        "contradictions": contradictions,
    }


def headline_report(m: dict) -> list:
    """The few sentences a leadership audience needs, derived from the numbers
    rather than written by hand, so the narrative cannot contradict the charts."""
    lines = []
    if not m["total"]:
        return lines
    lines.append(
        f"{m['total']} journeys were planned across the period. {m['utilised']} "
        f"({m['util_pct']}%) were delivered or are under way; {m['not_utilised']} "
        f"were rejected or never picked up.")

    worst = [q for q in m["by_quarter"] if q["planned"] >= 5]
    if worst:
        low = min(worst, key=lambda q: q["util_pct"])
        lines.append(
            f"{low['quarter']} is the weakest quarter for plan utilisation at "
            f"{low['util_pct']}% — {low['planned']} planned, {low['not_utilised']} not taken up.")

    fl = [f for f in m["by_frontline"] if f["total"] >= MIN_SAMPLE]
    if fl:
        top = max(fl, key=lambda f: f["done_pct"])
        bottom = max(fl, key=lambda f: f["rejected_pct"])
        lines.append(
            f"{top['name']} converts best of the larger frontlines at {top['done_pct']}% done "
            f"({top['done']} of {top['total']}), while {bottom['name']} rejects "
            f"{bottom['rejected_pct']}% of what it plans ({bottom['rejected'] + bottom['unassigned']} "
            f"of {bottom['total']}) — the clearest place to ask why demand is being planned and dropped.")

    if m["by_journey"]:
        lead = m["by_journey"][0]
        lines.append(
            f"{lead['name']} accounts for {lead['total']} of {m['total']} journeys "
            f"({_pct(lead['total'], m['total'])}%), making it the single biggest draw on the team.")

    s = m["slippage"]
    landed = s["on_plan"] + s["later"] + s["earlier"]
    if landed:
        moved = f"; {s['moved']} were pushed out entirely" if s["moved"] else ""
        lines.append(
            f"Of the work that landed, {s['on_plan']} hit its planned quarter and {s['later']} "
            f"arrived later{moved}.")

    if m["contradictions"]:
        lines.append(
            f"{len(m['contradictions'])} rows carry a completion quarter while still marked "
            f"rejected or unassigned. They are counted as not utilised here, but the sheet "
            f"needs correcting before these figures are quoted externally.")
    return lines


# ── API ──────────────────────────────────────────────────────────────────────

class UploadBody(BaseModel):
    xlsx_base64: str = ""
    csv: str = ""
    filename: str = "Journey_Data.xlsx"
    uploaded_by: str = ""


@router.post("/upload")
async def upload(body: UploadBody):
    if body.xlsx_base64:
        try:
            frame = pd.read_excel(io.BytesIO(base64.b64decode(body.xlsx_base64)))
        except Exception as exc:
            raise HTTPException(400, f"Could not read the spreadsheet: {exc}")
    elif body.csv.strip():
        try:
            frame = pd.read_csv(io.StringIO(body.csv))
        except Exception as exc:
            raise HTTPException(400, f"Could not read the CSV: {exc}")
    else:
        raise HTTPException(400, "Attach a spreadsheet or CSV")

    rows = parse_sheet(frame)
    save_rows(rows, body.filename, body.uploaded_by or None)
    return {"saved": True, "row_count": len(rows), "columns": COLUMNS}


@router.get("")
async def get_rows():
    rows, meta = load_rows()
    return {"rows": rows, "columns": COLUMNS, **meta}


@router.get("/metrics")
async def metrics():
    rows, meta = load_rows()
    if not rows:
        raise HTTPException(404, "No Service 2 sheet has been uploaded yet")
    m = compute_metrics(rows)
    return {**m, "report": headline_report(m), **meta}


@router.delete("")
async def clear():
    c = _conn()
    try:
        with c, c.cursor() as cur:
            cur.execute(_SCHEMA)
            cur.execute("DELETE FROM journey_sheet WHERE id = 1")
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
        raise HTTPException(404, "No Service 2 sheet has been uploaded yet")
    m = compute_metrics(rows)

    buf = io.BytesIO()
    wb = xlsxwriter.Workbook(buf, {"in_memory": True})
    hdr = wb.add_format({"bold": True, "bg_color": "#1450f5", "font_color": "#ffffff", "border": 1})
    bold = wb.add_format({"bold": True})
    wrap = wb.add_format({"text_wrap": True, "valign": "top"})
    pct = wb.add_format({"num_format": '0.0"%"'})

    ws = wb.add_worksheet("Summary")
    ws.set_column(0, 0, 110)
    ws.write(0, 0, "Service 2 — journey delivery", bold)
    row = 2
    for line in headline_report(m):
        ws.write(row, 0, line, wrap)
        row += 1

    def table(name, columns, records):
        s = wb.add_worksheet(name[:31])
        s.write_row(0, 0, [c[0] for c in columns], hdr)
        for i, rec in enumerate(records, start=1):
            for j, (_, key, is_pct) in enumerate(columns):
                value = rec.get(key, "")
                if is_pct and isinstance(value, (int, float)):
                    s.write_number(i, j, value, pct)
                elif isinstance(value, (int, float)) and not isinstance(value, bool):
                    s.write_number(i, j, value)
                else:
                    s.write_string(i, j, "" if value is None else str(value))
        for j, c in enumerate(columns):
            s.set_column(j, j, 34 if j == 0 else 14)

    table("Plan utilisation", [("Planned In", "quarter", False), ("Planned", "planned", False),
                               ("Done", "done", False), ("In Progress", "in_progress", False),
                               ("Rejected", "rejected", False), ("Un Assigned", "unassigned", False),
                               ("Utilised", "utilised", False), ("Utilisation", "util_pct", True)],
          m["by_quarter"])
    for sheet, key in [("By Area", "by_area"), ("By Frontline", "by_frontline"),
                       ("By Service Line", "by_service_line"), ("By Journey", "by_journey")]:
        table(sheet, [("Name", "name", False), ("Total", "total", False), ("Done", "done", False),
                      ("In Progress", "in_progress", False), ("Rejected", "rejected", False),
                      ("Un Assigned", "unassigned", False), ("Done %", "done_pct", True),
                      ("Rejected %", "rejected_pct", True)], m[key])

    hm = wb.add_worksheet("Journey x Frontline")
    hm.write_row(0, 1, m["heatmap"]["frontlines"], hdr)
    hm.set_column(0, 0, 34)
    for i, journey in enumerate(m["heatmap"]["journeys"], start=1):
        hm.write_string(i, 0, journey)
        for j, value in enumerate(m["heatmap"]["grid"][i - 1], start=1):
            hm.write_number(i, j, value)

    data = wb.add_worksheet("Rows")
    data.write_row(0, 0, COLUMNS, hdr)
    for i, r in enumerate(rows, start=1):
        for j, col in enumerate(COLUMNS):
            data.write_string(i, j, str(r.get(col, "")))
    for j in range(len(COLUMNS)):
        data.set_column(j, j, 40 if j in (1, 2) else 15)

    if m["contradictions"]:
        issues = wb.add_worksheet("Data issues")
        issues.write_row(0, 0, ["Row ID", "Journey Instance", "Status", "Completed In"], hdr)
        for i, c in enumerate(m["contradictions"], start=1):
            issues.write_row(i, 0, [c["row_id"], c["instance"], c["status"], c["completed"]])
        issues.set_column(1, 1, 60)

    wb.close()
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="service2-journey-report.xlsx"'},
    )
