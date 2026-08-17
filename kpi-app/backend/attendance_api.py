"""Beta attendance tracker — Postgres-backed, server-authenticated.

Deliberately shares nothing with the legacy Firebase tracker: different
storage, different endpoints, different password. The two run side by side so
the old one keeps working untouched while this is trialled.

Wired up from main.py via configure() rather than importing from it, which
keeps the dependency one-directional and avoids a circular import.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from datetime import date, datetime, timedelta
from typing import Callable, Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/attendance", tags=["attendance-beta"])

# ── Injected from main.py ─────────────────────────────────────────────────────
_get_conn: Optional[Callable] = None
_diagnose: Optional[Callable] = None
_holidays_by_year: dict[int, list[str]] = {}


def configure(get_conn: Callable, holidays_by_year: dict,
              diagnose: Optional[Callable] = None) -> None:
    global _get_conn, _diagnose, _holidays_by_year
    _get_conn = get_conn
    _diagnose = diagnose
    _holidays_by_year = holidays_by_year or {}
    _init_schema()


# ── Auth ──────────────────────────────────────────────────────────────────────
# Password lives in the environment, never in the page source — unlike the
# legacy tracker, where it ships to the browser in plain text. The token is a
# signed expiry stamp; there is no session store to keep in sync.
BETA_PASSWORD = os.environ.get("ATTENDANCE_BETA_PASSWORD", "KoneAttend@2026")
_SECRET = os.environ.get(
    "ATTENDANCE_BETA_SECRET",
    hashlib.sha256(("attendance-beta::" + BETA_PASSWORD).encode()).hexdigest(),
).encode()
TOKEN_TTL_SECONDS = 12 * 3600

STATUSES = ("present", "wfh", "leave", "halfDayLeave", "onDuty", "travel")
NOTE_COLORS = ("sand", "yellow", "blue", "pink", "mint")


def _sign(payload: dict) -> str:
    raw = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).decode().rstrip("=")
    sig = hmac.new(_SECRET, raw.encode(), hashlib.sha256).hexdigest()[:32]
    return f"{raw}.{sig}"


def _verify(token: str) -> bool:
    try:
        raw, sig = token.rsplit(".", 1)
    except ValueError:
        return False
    expected = hmac.new(_SECRET, raw.encode(), hashlib.sha256).hexdigest()[:32]
    if not hmac.compare_digest(sig, expected):
        return False
    try:
        pad = "=" * (-len(raw) % 4)
        return json.loads(base64.urlsafe_b64decode(raw + pad)).get("exp", 0) > time.time()
    except Exception:
        return False


def require_auth(authorization: str = Header(None)) -> None:
    token = (authorization or "").removeprefix("Bearer ").strip()
    if not token or not _verify(token):
        raise HTTPException(401, "Not authenticated")


class LoginBody(BaseModel):
    password: str


@router.post("/login")
def login(body: LoginBody):
    # compare_digest keeps the check constant-time so the response latency
    # doesn't leak how much of the password matched.
    if not hmac.compare_digest(body.password.strip(), BETA_PASSWORD):
        raise HTTPException(401, "Incorrect password")
    return {"token": _sign({"exp": int(time.time()) + TOKEN_TTL_SECONDS}),
            "expires_in": TOKEN_TTL_SECONDS}


# ── Storage ───────────────────────────────────────────────────────────────────
class NoDatabase(HTTPException):
    # The detail is shown to the user verbatim, so it must say which of the two
    # failure modes actually happened rather than assuming nothing is attached.
    def __init__(self, detail: Optional[str] = None):
        super().__init__(503, detail or "No database configured — set DATABASE_URL on the service.")


def _reason() -> Optional[str]:
    if _diagnose is None:
        return None
    try:
        return _diagnose()
    except Exception:
        return None


def _conn():
    if _get_conn is None:
        raise NoDatabase()
    c = _get_conn()
    if c is None:
        raise NoDatabase(_reason())
    return c


_SCHEMA = """
CREATE TABLE IF NOT EXISTS att_people (
    name       TEXT PRIMARY KEY,
    start_date DATE,
    end_date   DATE,
    sort_order INT NOT NULL DEFAULT 100
);
CREATE TABLE IF NOT EXISTS att_records (
    day        DATE NOT NULL,
    person     TEXT NOT NULL,
    status     TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (day, person)
);
CREATE TABLE IF NOT EXISTS att_notes (
    day        DATE PRIMARY KEY,
    body       TEXT NOT NULL,
    color      TEXT NOT NULL DEFAULT 'yellow',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS att_log (
    id     BIGSERIAL PRIMARY KEY,
    ts     TIMESTAMPTZ NOT NULL DEFAULT now(),
    detail TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS att_meta (
    id      INT PRIMARY KEY DEFAULT 1,
    version BIGINT NOT NULL DEFAULT 0
);
INSERT INTO att_meta (id, version) VALUES (1, 0) ON CONFLICT (id) DO NOTHING;
"""


def _init_schema() -> None:
    try:
        c = _conn()
    except HTTPException:
        print(f"[ATT] No database — beta attendance tables not created ({_reason()})", flush=True)
        return
    try:
        with c, c.cursor() as cur:
            cur.execute(_SCHEMA)
        print("[ATT] Beta attendance tables ready", flush=True)
    except Exception as exc:
        print(f"[ATT] Schema init failed: {exc}", flush=True)
    finally:
        c.close()


def _bump(cur, detail: Optional[str] = None) -> None:
    """Advance the revision counter so polling clients know to re-fetch."""
    cur.execute("UPDATE att_meta SET version = version + 1 WHERE id = 1")
    if detail:
        cur.execute("INSERT INTO att_log (detail) VALUES (%s)", (detail,))


def _version(cur) -> int:
    cur.execute("SELECT version FROM att_meta WHERE id = 1")
    row = cur.fetchone()
    return int(row[0]) if row else 0


# ── Reference data ────────────────────────────────────────────────────────────
@router.get("/bootstrap", dependencies=[Depends(require_auth)])
def bootstrap():
    """Roster, holidays and the current revision — everything static-ish."""
    holidays = {d: "" for yr in _holidays_by_year.values() for d in yr}
    # Holiday names live in main's calendar as comments only, so label them
    # from a lookup that covers the set actually in use.
    names = {
        "01-01": "New Year's Day", "01-14": "Pongal", "01-15": "Pongal",
        "01-26": "Republic Day", "04-14": "Tamil New Year",
        "04-23": "Tamil Nadu Elections", "05-01": "May Day",
        "08-15": "Independence Day", "09-07": "Ganesh Chaturthi",
        "08-27": "Ganesh Chaturthi", "09-14": "Ganesh Chaturthi",
        "10-01": "Ayudha Pooja", "10-11": "Ayudha Pooja", "10-19": "Ayudha Pooja",
        "10-02": "Gandhi Jayanti", "10-20": "Diwali", "10-31": "Diwali",
        "11-09": "Diwali", "12-25": "Christmas",
    }
    holidays = {d: names.get(d[5:], "Holiday") for d in holidays}

    c = _conn()
    try:
        with c, c.cursor() as cur:
            cur.execute("SELECT name, start_date, end_date FROM att_people ORDER BY sort_order, name")
            people = [
                {"name": r[0],
                 "start": r[1].isoformat() if r[1] else None,
                 "end": r[2].isoformat() if r[2] else None}
                for r in cur.fetchall()
            ]
            return {"people": people, "holidays": holidays,
                    "statuses": list(STATUSES), "note_colors": list(NOTE_COLORS),
                    "version": _version(cur)}
    finally:
        c.close()


@router.get("/version", dependencies=[Depends(require_auth)])
def version():
    """Cheap poll target — clients only re-fetch data when this changes."""
    c = _conn()
    try:
        with c, c.cursor() as cur:
            return {"version": _version(cur)}
    finally:
        c.close()


@router.get("/data", dependencies=[Depends(require_auth)])
def get_data(start: str, end: str):
    c = _conn()
    try:
        with c, c.cursor() as cur:
            cur.execute(
                "SELECT day, person, status FROM att_records WHERE day BETWEEN %s AND %s",
                (start, end),
            )
            records: dict[str, dict[str, str]] = {}
            for day, person, status in cur.fetchall():
                records.setdefault(day.isoformat(), {})[person] = status
            cur.execute(
                "SELECT day, body, color FROM att_notes WHERE day BETWEEN %s AND %s",
                (start, end),
            )
            notes = {d.isoformat(): {"body": b, "color": col} for d, b, col in cur.fetchall()}
            return {"records": records, "notes": notes, "version": _version(cur)}
    finally:
        c.close()


# ── Mutations ─────────────────────────────────────────────────────────────────
class MarkBody(BaseModel):
    person: str
    dates: list[str] = Field(min_length=1)
    status: str


@router.post("/mark", dependencies=[Depends(require_auth)])
def mark(body: MarkBody):
    if body.status not in STATUSES:
        raise HTTPException(400, f"Unknown status '{body.status}'")
    c = _conn()
    try:
        with c, c.cursor() as cur:
            for d in body.dates:
                cur.execute(
                    """INSERT INTO att_records (day, person, status) VALUES (%s, %s, %s)
                       ON CONFLICT (day, person)
                       DO UPDATE SET status = EXCLUDED.status, updated_at = now()""",
                    (d, body.person, body.status),
                )
            _bump(cur, f"{body.person} marked {body.status} on {', '.join(sorted(body.dates))}")
            return {"ok": True, "version": _version(cur)}
    finally:
        c.close()


class ClearBody(BaseModel):
    person: str
    dates: list[str] = Field(min_length=1)


@router.post("/clear", dependencies=[Depends(require_auth)])
def clear(body: ClearBody):
    """Remove explicit marks so those days fall back to the default (present)."""
    c = _conn()
    try:
        with c, c.cursor() as cur:
            cur.execute(
                "DELETE FROM att_records WHERE person = %s AND day = ANY(%s::date[])",
                (body.person, body.dates),
            )
            _bump(cur, f"{body.person} cleared on {', '.join(sorted(body.dates))}")
            return {"ok": True, "version": _version(cur)}
    finally:
        c.close()


class NoteBody(BaseModel):
    dates: list[str] = Field(min_length=1)
    body: str = ""
    color: str = "yellow"


@router.post("/note", dependencies=[Depends(require_auth)])
def set_note(payload: NoteBody):
    if payload.color not in NOTE_COLORS:
        raise HTTPException(400, f"Unknown colour '{payload.color}'")
    c = _conn()
    try:
        with c, c.cursor() as cur:
            if payload.body.strip():
                for d in payload.dates:
                    cur.execute(
                        """INSERT INTO att_notes (day, body, color) VALUES (%s, %s, %s)
                           ON CONFLICT (day) DO UPDATE
                           SET body = EXCLUDED.body, color = EXCLUDED.color, updated_at = now()""",
                        (d, payload.body.strip(), payload.color),
                    )
                detail = f"Note set on {', '.join(sorted(payload.dates))}"
            else:
                cur.execute("DELETE FROM att_notes WHERE day = ANY(%s::date[])", (payload.dates,))
                detail = f"Note cleared on {', '.join(sorted(payload.dates))}"
            _bump(cur, detail)
            return {"ok": True, "version": _version(cur)}
    finally:
        c.close()


# ── Roster ────────────────────────────────────────────────────────────────────
# In the DB rather than hardcoded, so adding a joiner is a UI action instead of
# a code edit that has to be repeated in every deployed copy of the page.
class PersonBody(BaseModel):
    name: str
    start: Optional[str] = None
    end: Optional[str] = None
    sort_order: int = 100


@router.post("/people", dependencies=[Depends(require_auth)])
def upsert_person(p: PersonBody):
    name = p.name.strip()
    if not name:
        raise HTTPException(400, "Name is required")
    c = _conn()
    try:
        with c, c.cursor() as cur:
            cur.execute(
                """INSERT INTO att_people (name, start_date, end_date, sort_order)
                   VALUES (%s, %s, %s, %s)
                   ON CONFLICT (name) DO UPDATE SET
                     start_date = EXCLUDED.start_date,
                     end_date   = EXCLUDED.end_date,
                     sort_order = EXCLUDED.sort_order""",
                (name, p.start or None, p.end or None, p.sort_order),
            )
            _bump(cur, f"Roster updated: {name}"
                       + (f" (from {p.start})" if p.start else "")
                       + (f" (until {p.end})" if p.end else ""))
            return {"ok": True, "version": _version(cur)}
    finally:
        c.close()


@router.delete("/people/{name}", dependencies=[Depends(require_auth)])
def delete_person(name: str):
    c = _conn()
    try:
        with c, c.cursor() as cur:
            cur.execute("DELETE FROM att_people WHERE name = %s", (name,))
            _bump(cur, f"Removed from roster: {name}")
            return {"ok": True, "version": _version(cur)}
    finally:
        c.close()


# ── Activity log ──────────────────────────────────────────────────────────────
@router.get("/log", dependencies=[Depends(require_auth)])
def get_log(limit: int = 200):
    c = _conn()
    try:
        with c, c.cursor() as cur:
            cur.execute("SELECT ts, detail FROM att_log ORDER BY id DESC LIMIT %s", (min(limit, 1000),))
            return {"entries": [{"ts": t.isoformat(), "detail": d} for t, d in cur.fetchall()]}
    finally:
        c.close()


@router.delete("/log", dependencies=[Depends(require_auth)])
def wipe_log():
    c = _conn()
    try:
        with c, c.cursor() as cur:
            cur.execute("DELETE FROM att_log")
            return {"ok": True}
    finally:
        c.close()


# ── Summary ───────────────────────────────────────────────────────────────────
def _holiday_set() -> set[str]:
    return {d for yr in _holidays_by_year.values() for d in yr}


def _working_days(start: date, end: date, hols: set[str]) -> list[date]:
    out, cur = [], start
    while cur <= end:
        if cur.weekday() < 5 and cur.isoformat() not in hols:
            out.append(cur)
        cur += timedelta(days=1)
    return out


@router.get("/summary", dependencies=[Depends(require_auth)])
def summary(start: str, end: str, person: Optional[str] = None, status: Optional[str] = None):
    """Per-person totals over an arbitrary range — the filter-range view.

    Unmarked working days count as present, matching the legacy tracker's
    default, so capacity is meaningful without anyone marking every day.
    """
    s, e = date.fromisoformat(start), date.fromisoformat(end)
    if e < s:
        raise HTTPException(400, "end must not be before start")
    hols = _holiday_set()
    wdays = _working_days(s, e, hols)

    c = _conn()
    try:
        with c, c.cursor() as cur:
            cur.execute("SELECT name, start_date, end_date FROM att_people ORDER BY sort_order, name")
            people = cur.fetchall()
            cur.execute(
                "SELECT day, person, status FROM att_records WHERE day BETWEEN %s AND %s", (start, end)
            )
            marks: dict[tuple[str, str], str] = {
                (d.isoformat(), p): st for d, p, st in cur.fetchall()
            }
    finally:
        c.close()

    rows = []
    for name, p_start, p_end in people:
        if person and name != person:
            continue
        counts = {k: 0.0 for k in STATUSES}
        wd = 0
        for d in wdays:
            if p_start and d < p_start:
                continue
            if p_end and d > p_end:
                continue
            wd += 1
            st = marks.get((d.isoformat(), name), "present")
            counts[st] = counts.get(st, 0) + 1
        if not wd:
            continue
        leave_equiv = counts["leave"] + 0.5 * counts["halfDayLeave"]
        row = {
            "person": name, "working_days": wd,
            **{k: counts[k] for k in STATUSES},
            "leave_equivalent": round(leave_equiv, 1),
            # Capacity = share of working days actually available (anything
            # except leave). Half-days count as half.
            "capacity_pct": round((wd - leave_equiv) / wd * 100, 1) if wd else None,
        }
        if status and not counts.get(status):
            continue
        rows.append(row)

    return {"start": start, "end": end, "working_days": len(wdays), "rows": rows}
