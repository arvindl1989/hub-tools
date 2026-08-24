"""Shared per-ticket state for the email tracker.

The tracker used to keep links, dates, recipients and the progress widget in
each browser's localStorage, so one specialist's preview link never reached
anyone else and nothing survived a change of machine. This moves that state
server-side, keyed by ServiceNow ticket number, so the whole team sees the same
details on a ticket.

Wired up from main.py via configure() rather than importing from it, which
keeps the dependency one-directional and avoids a circular import — the same
arrangement attendance_api uses.
"""
from __future__ import annotations

import json
from typing import Callable, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/email-state", tags=["email-tracker"])

# ── Injected from main.py ─────────────────────────────────────────────────────
_get_conn: Optional[Callable] = None
_diagnose: Optional[Callable] = None


def configure(get_conn: Callable, diagnose: Optional[Callable] = None) -> None:
    global _get_conn, _diagnose
    _get_conn = get_conn
    _diagnose = diagnose
    _init_schema()


class NoDatabase(HTTPException):
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


# payload is the whole client-side blob (links, recipients, fields, widget).
# Keeping it opaque means the tracker can add a field without a migration.
_SCHEMA = """
CREATE TABLE IF NOT EXISTS email_ticket_state (
    ticket_id  TEXT PRIMARY KEY,
    payload    JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by TEXT
);
"""


def _init_schema() -> None:
    try:
        c = _conn()
    except HTTPException:
        print(f"[EMAIL-STATE] No database — table not created ({_reason()})", flush=True)
        return
    try:
        with c, c.cursor() as cur:
            cur.execute(_SCHEMA)
        print("[EMAIL-STATE] Table ready", flush=True)
    except Exception as exc:
        print(f"[EMAIL-STATE] Schema init failed: {exc}", flush=True)
    finally:
        try:
            c.close()
        except Exception:
            pass


class StatePut(BaseModel):
    payload: dict = Field(default_factory=dict)
    updated_by: Optional[str] = None


MAX_PAYLOAD_BYTES = 64 * 1024


def _ensure_table(cur) -> None:
    """Create the table on demand.

    Railway's private DNS is not always resolvable the instant the app boots,
    so the startup schema init can fail while every later request succeeds —
    leaving queries to hit a table that was never created. Cheap to re-run.
    """
    cur.execute(_SCHEMA)


@router.get("")
async def list_state(ids: str = ""):
    """Every saved ticket, or just the ones named in `ids` (comma separated).

    The tracker calls this once on load so opening any ticket is instant rather
    than a round trip per ticket.
    """
    c = _conn()
    try:
        with c, c.cursor() as cur:
            _ensure_table(cur)
            wanted = [i.strip() for i in ids.split(",") if i.strip()]
            if wanted:
                cur.execute(
                    "SELECT ticket_id, payload, updated_at, updated_by "
                    "FROM email_ticket_state WHERE ticket_id = ANY(%s)",
                    (wanted,),
                )
            else:
                cur.execute(
                    "SELECT ticket_id, payload, updated_at, updated_by FROM email_ticket_state"
                )
            rows = cur.fetchall()
        return {
            r[0]: {
                **(r[1] if isinstance(r[1], dict) else json.loads(r[1])),
                "updatedAt": r[2].isoformat() if r[2] else None,
                "updatedBy": r[3],
            }
            for r in rows
        }
    finally:
        try:
            c.close()
        except Exception:
            pass


@router.put("/{ticket_id}")
async def put_state(ticket_id: str, body: StatePut):
    ticket_id = (ticket_id or "").strip()
    if not ticket_id:
        raise HTTPException(400, "ticket_id is required")
    blob = json.dumps(body.payload)
    if len(blob.encode("utf-8")) > MAX_PAYLOAD_BYTES:
        raise HTTPException(413, "Saved details are too large for one ticket")
    c = _conn()
    try:
        with c, c.cursor() as cur:
            _ensure_table(cur)
            cur.execute(
                "INSERT INTO email_ticket_state (ticket_id, payload, updated_at, updated_by) "
                "VALUES (%s, %s::jsonb, now(), %s) "
                "ON CONFLICT (ticket_id) DO UPDATE SET "
                "payload = EXCLUDED.payload, updated_at = now(), updated_by = EXCLUDED.updated_by",
                (ticket_id, blob, body.updated_by),
            )
        return {"ok": True, "ticket_id": ticket_id}
    finally:
        try:
            c.close()
        except Exception:
            pass


@router.delete("/{ticket_id}")
async def delete_state(ticket_id: str):
    c = _conn()
    try:
        with c, c.cursor() as cur:
            cur.execute("DELETE FROM email_ticket_state WHERE ticket_id = %s", (ticket_id,))
        return {"ok": True}
    finally:
        try:
            c.close()
        except Exception:
            pass
