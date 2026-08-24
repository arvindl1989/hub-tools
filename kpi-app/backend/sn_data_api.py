"""ServiceNow snapshots and manual corrections.

The browser extension exports a ServiceNow list as CSV and posts it here. Each
dataset ("tickets", "feedback") keeps one current snapshot, so the data survives
a restart and everyone sees the same rows without syncing themselves — which the
in-memory session store could not do.

Corrections live apart from the snapshot on purpose. Syncing replaces the rows
wholesale, so an edit written into the data itself would be destroyed by the
next sync — exactly what the old write-to-Google-Sheets design did, where a sync
cleared the tab before rewriting it. Overrides are keyed by row and column and
re-applied after every sync, so a correction outlives any number of them.
"""
from __future__ import annotations

import json
from typing import Callable, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/sn-data", tags=["servicenow"])

# Which column identifies a row, per dataset. Overrides are keyed on it.
DATASETS = {
    "tickets":  {"key": "Number",           "label": "ServiceNow tickets"},
    # Feedback has no ServiceNow ticket number in its export — an assessment
    # instance ID (AINST...) is what uniquely identifies one survey response.
    "feedback": {"key": "Instance Number",  "label": "ServiceNow feedback"},
}

_get_conn: Optional[Callable] = None
_diagnose: Optional[Callable] = None
_on_change: Optional[Callable] = None


def configure(get_conn: Callable, diagnose: Optional[Callable] = None,
              on_change: Optional[Callable] = None) -> None:
    """on_change(dataset) is called after a snapshot or override write so the
    caller can invalidate its own cache — main.py's /api/tickets cache would
    otherwise keep serving pre-correction rows for up to five minutes."""
    global _get_conn, _diagnose, _on_change
    _get_conn = get_conn
    _diagnose = diagnose
    _on_change = on_change
    _init_schema()


def _notify(dataset: str) -> None:
    if _on_change is None:
        return
    try:
        _on_change(dataset)
    except Exception:
        pass


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


_SCHEMA = """
CREATE TABLE IF NOT EXISTS sn_snapshot (
    dataset    TEXT PRIMARY KEY,
    rows       JSONB NOT NULL,
    row_count  INT NOT NULL DEFAULT 0,
    synced_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    synced_by  TEXT
);
CREATE TABLE IF NOT EXISTS sn_override (
    dataset     TEXT NOT NULL,
    row_key     TEXT NOT NULL,
    column_name TEXT NOT NULL,
    value       TEXT,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by  TEXT,
    PRIMARY KEY (dataset, row_key, column_name)
);
CREATE TABLE IF NOT EXISTS sn_manual_row (
    dataset    TEXT NOT NULL,
    row_key    TEXT NOT NULL,
    payload    JSONB NOT NULL,
    added_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    added_by   TEXT,
    PRIMARY KEY (dataset, row_key)
);
"""


def _ensure(cur) -> None:
    """Create both tables on demand — Railway's private DNS is not always up at boot."""
    cur.execute(_SCHEMA)


def _init_schema() -> None:
    try:
        c = _conn()
    except HTTPException:
        print(f"[SN-DATA] No database — tables not created ({_reason()})", flush=True)
        return
    try:
        with c, c.cursor() as cur:
            _ensure(cur)
        print("[SN-DATA] Tables ready", flush=True)
    except Exception as exc:
        print(f"[SN-DATA] Schema init failed: {exc}", flush=True)
    finally:
        try:
            c.close()
        except Exception:
            pass


def _check(dataset: str) -> dict:
    cfg = DATASETS.get(dataset)
    if not cfg:
        raise HTTPException(404, f"Unknown dataset '{dataset}'. Expected one of: {', '.join(DATASETS)}")
    return cfg


# ── Reading ───────────────────────────────────────────────────────────────────

def _apply_overrides(rows: list, overrides: list, key_col: str) -> int:
    """Patch `rows` in place with (row_key, column, value) triples. Returns how
    many rows were touched. Shared between synced and manual rows so a
    correction applies uniformly regardless of which table a row lives in —
    the override table does not know or care where the row it targets came
    from."""
    if not overrides:
        return 0
    by_key: dict[str, dict] = {}
    for row_key, column, value in overrides:
        by_key.setdefault(row_key, {})[column] = value
    applied = 0
    for row in rows:
        patch = by_key.get(str(row.get(key_col, "")).strip())
        if patch:
            row.update(patch)
            applied += 1
    return applied


def _manual_rows(cur, dataset: str) -> list:
    cur.execute("SELECT payload FROM sn_manual_row WHERE dataset = %s ORDER BY added_at", (dataset,))
    return [r[0] if isinstance(r[0], dict) else json.loads(r[0]) for r in cur.fetchall()]


def load_rows(dataset: str) -> tuple[list, dict]:
    """Synced rows plus permanent manual rows, both with corrections applied.

    Manual rows exist for entries that will never come from a sync at all —
    old feedback predating ServiceNow tracking, for instance — so they live in
    a separate table save_snapshot never touches, and are merged in here on
    every read rather than being folded into the snapshot itself.

    Returns ([], {}) only when there is neither a snapshot nor any manual rows,
    so callers can fall back to their previous source rather than showing an
    empty dashboard.
    """
    cfg = _check(dataset)
    key_col = cfg["key"]
    c = _conn()
    try:
        with c, c.cursor() as cur:
            _ensure(cur)
            cur.execute(
                "SELECT rows, row_count, synced_at, synced_by FROM sn_snapshot WHERE dataset = %s",
                (dataset,),
            )
            snap = cur.fetchone()
            rows = (snap[0] if isinstance(snap[0], list) else json.loads(snap[0])) if snap else []
            manual = _manual_rows(cur, dataset)
            if not rows and not manual:
                return [], {}
            meta = {
                "row_count": snap[1] if snap else 0,
                "synced_at": snap[2].isoformat() if snap and snap[2] else None,
                "synced_by": snap[3] if snap else None,
                "manual_row_count": len(manual),
            }
            cur.execute(
                "SELECT row_key, column_name, value FROM sn_override WHERE dataset = %s",
                (dataset,),
            )
            overrides = cur.fetchall()
    finally:
        try:
            c.close()
        except Exception:
            pass

    combined = rows + manual
    meta["overrides_applied"] = _apply_overrides(combined, overrides, key_col)
    return combined, meta


@router.get("/{dataset}")
async def get_dataset(dataset: str):
    rows, meta = load_rows(dataset)
    if not rows and not meta:
        raise HTTPException(404, f"No '{dataset}' data has been synced yet")
    return {"rows": rows, **meta}


@router.get("/{dataset}/meta")
async def get_meta(dataset: str):
    _check(dataset)
    c = _conn()
    try:
        with c, c.cursor() as cur:
            _ensure(cur)
            cur.execute(
                "SELECT row_count, synced_at, synced_by FROM sn_snapshot WHERE dataset = %s",
                (dataset,),
            )
            row = cur.fetchone()
            cur.execute("SELECT count(*) FROM sn_override WHERE dataset = %s", (dataset,))
            n_over = cur.fetchone()[0]
        if not row:
            return {"synced": False, "overrides": n_over}
        return {
            "synced": True,
            "row_count": row[0],
            "synced_at": row[1].isoformat() if row[1] else None,
            "synced_by": row[2],
            "overrides": n_over,
        }
    finally:
        try:
            c.close()
        except Exception:
            pass


# ── Writing ───────────────────────────────────────────────────────────────────

def save_snapshot(dataset: str, rows: list, synced_by: Optional[str] = None) -> dict:
    _check(dataset)
    c = _conn()
    try:
        with c, c.cursor() as cur:
            _ensure(cur)
            cur.execute(
                "INSERT INTO sn_snapshot (dataset, rows, row_count, synced_at, synced_by) "
                "VALUES (%s, %s::jsonb, %s, now(), %s) "
                "ON CONFLICT (dataset) DO UPDATE SET "
                "rows = EXCLUDED.rows, row_count = EXCLUDED.row_count, "
                "synced_at = now(), synced_by = EXCLUDED.synced_by",
                (dataset, json.dumps(rows), len(rows), synced_by),
            )
        print(f"[SN-DATA] Stored {len(rows)} rows for '{dataset}'", flush=True)
        _notify(dataset)
        return {"ok": True, "dataset": dataset, "row_count": len(rows)}
    finally:
        try:
            c.close()
        except Exception:
            pass


class OverrideIn(BaseModel):
    row_key: str
    column_name: str
    value: Optional[str] = None
    updated_by: Optional[str] = None


@router.get("/{dataset}/overrides")
async def list_overrides(dataset: str):
    _check(dataset)
    c = _conn()
    try:
        with c, c.cursor() as cur:
            _ensure(cur)
            cur.execute(
                "SELECT row_key, column_name, value, updated_at, updated_by "
                "FROM sn_override WHERE dataset = %s ORDER BY updated_at DESC",
                (dataset,),
            )
            return [
                {
                    "row_key": r[0], "column_name": r[1], "value": r[2],
                    "updated_at": r[3].isoformat() if r[3] else None, "updated_by": r[4],
                }
                for r in cur.fetchall()
            ]
    finally:
        try:
            c.close()
        except Exception:
            pass


def set_override(dataset: str, row_key: str, column_name: str, value: Optional[str],
                  updated_by: Optional[str] = None) -> dict:
    _check(dataset)
    row_key = (row_key or "").strip()
    column_name = (column_name or "").strip()
    if not row_key or not column_name:
        raise HTTPException(400, "row_key and column_name are required")
    c = _conn()
    try:
        with c, c.cursor() as cur:
            _ensure(cur)
            cur.execute(
                "INSERT INTO sn_override (dataset, row_key, column_name, value, updated_at, updated_by) "
                "VALUES (%s, %s, %s, %s, now(), %s) "
                "ON CONFLICT (dataset, row_key, column_name) DO UPDATE SET "
                "value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by",
                (dataset, row_key, column_name, value, updated_by),
            )
        _notify(dataset)
        return {"ok": True}
    finally:
        try:
            c.close()
        except Exception:
            pass


@router.put("/{dataset}/overrides")
async def put_override(dataset: str, body: OverrideIn):
    return set_override(dataset, body.row_key, body.column_name, body.value, body.updated_by)


class ManualRowIn(BaseModel):
    row_key: str
    payload: dict = Field(default_factory=dict)
    added_by: Optional[str] = None


@router.get("/{dataset}/manual-rows")
async def list_manual_rows(dataset: str):
    _check(dataset)
    c = _conn()
    try:
        with c, c.cursor() as cur:
            _ensure(cur)
            cur.execute(
                "SELECT row_key, payload, added_at, added_by FROM sn_manual_row "
                "WHERE dataset = %s ORDER BY added_at", (dataset,),
            )
            return [
                {"row_key": r[0], "payload": r[1] if isinstance(r[1], dict) else json.loads(r[1]),
                 "added_at": r[2].isoformat() if r[2] else None, "added_by": r[3]}
                for r in cur.fetchall()
            ]
    finally:
        try:
            c.close()
        except Exception:
            pass


def add_manual_row(dataset: str, row_key: str, payload: dict, added_by: Optional[str] = None) -> dict:
    """Add or replace one permanent row. Upsert on (dataset, row_key), so
    re-running the same import twice is safe rather than duplicating rows —
    callers generate row_key deterministically from row content for exactly
    this reason."""
    _check(dataset)
    row_key = (row_key or "").strip()
    if not row_key:
        raise HTTPException(400, "row_key is required")
    c = _conn()
    try:
        with c, c.cursor() as cur:
            _ensure(cur)
            cur.execute(
                "INSERT INTO sn_manual_row (dataset, row_key, payload, added_at, added_by) "
                "VALUES (%s, %s, %s::jsonb, now(), %s) "
                "ON CONFLICT (dataset, row_key) DO UPDATE SET "
                "payload = EXCLUDED.payload, added_at = sn_manual_row.added_at, added_by = EXCLUDED.added_by",
                (dataset, row_key, json.dumps(payload), added_by),
            )
        _notify(dataset)
        return {"ok": True, "row_key": row_key}
    finally:
        try:
            c.close()
        except Exception:
            pass


@router.put("/{dataset}/manual-rows")
async def put_manual_row(dataset: str, body: ManualRowIn):
    return add_manual_row(dataset, body.row_key, body.payload, body.added_by)


@router.delete("/{dataset}/manual-rows")
async def clear_manual_rows(dataset: str):
    """Remove every permanent row for a dataset in one call.

    Exists specifically for re-importing after the row-key scheme changes —
    old keys and new keys will not match, so without clearing first, a
    re-import adds a second, differently-keyed copy of every row alongside
    the stale originals rather than replacing them.
    """
    _check(dataset)
    c = _conn()
    try:
        with c, c.cursor() as cur:
            _ensure(cur)
            cur.execute("DELETE FROM sn_manual_row WHERE dataset = %s", (dataset,))
            deleted = cur.rowcount
        _notify(dataset)
        return {"ok": True, "deleted": deleted}
    finally:
        try:
            c.close()
        except Exception:
            pass


@router.delete("/{dataset}/manual-rows/{row_key}")
async def delete_manual_row(dataset: str, row_key: str):
    _check(dataset)
    c = _conn()
    try:
        with c, c.cursor() as cur:
            _ensure(cur)
            cur.execute("DELETE FROM sn_manual_row WHERE dataset = %s AND row_key = %s", (dataset, row_key))
        _notify(dataset)
        return {"ok": True}
    finally:
        try:
            c.close()
        except Exception:
            pass


def clear_snapshot(dataset: str) -> dict:
    """Delete a dataset's snapshot so readers fall back to their prior source
    (the Google Sheet, for tickets/feedback) on the next request.

    This is the incident lever: a sync that lands with the wrong column shape
    is otherwise invisible until someone notices every screen went blank or
    wrong, and there was no way to undo it short of a database console. Every
    reader already treats "no snapshot" as "fall back", so clearing it is safe
    — it cannot make things worse than they were before any sync ran.
    """
    _check(dataset)
    c = _conn()
    try:
        with c, c.cursor() as cur:
            _ensure(cur)
            cur.execute("DELETE FROM sn_snapshot WHERE dataset = %s", (dataset,))
    finally:
        try:
            c.close()
        except Exception:
            pass
    _notify(dataset)
    return {"ok": True, "dataset": dataset}


@router.delete("/{dataset}")
async def delete_snapshot(dataset: str):
    return clear_snapshot(dataset)


@router.get("/{dataset}/clear")
async def clear_snapshot_via_get(dataset: str):
    """Same as DELETE /{dataset}, reachable by pasting a URL into a browser.

    A browser address bar can only issue GET, and during an incident nobody
    should have to find curl or Postman to undo a bad sync. Deliberately just
    as destructive as the DELETE route — same guard (there is none beyond the
    dataset name being valid), same recovery story.
    """
    return clear_snapshot(dataset)


@router.delete("/{dataset}/overrides")
async def delete_override(dataset: str, row_key: str, column_name: str):
    """Drop a correction so the row reverts to whatever ServiceNow says."""
    _check(dataset)
    c = _conn()
    try:
        with c, c.cursor() as cur:
            _ensure(cur)
            cur.execute(
                "DELETE FROM sn_override WHERE dataset = %s AND row_key = %s AND column_name = %s",
                (dataset, row_key, column_name),
            )
        _notify(dataset)
        return {"ok": True}
    finally:
        try:
            c.close()
        except Exception:
            pass
