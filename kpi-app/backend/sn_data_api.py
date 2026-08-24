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

def load_rows(dataset: str) -> tuple[list, dict]:
    """Snapshot rows with corrections applied, plus metadata.

    Returns ([], {}) when nothing has been synced yet, so callers can fall back
    to their previous source rather than showing an empty dashboard.
    """
    cfg = _check(dataset)
    c = _conn()
    try:
        with c, c.cursor() as cur:
            _ensure(cur)
            cur.execute(
                "SELECT rows, row_count, synced_at, synced_by FROM sn_snapshot WHERE dataset = %s",
                (dataset,),
            )
            snap = cur.fetchone()
            if not snap:
                return [], {}
            rows = snap[0] if isinstance(snap[0], list) else json.loads(snap[0])
            meta = {
                "row_count": snap[1],
                "synced_at": snap[2].isoformat() if snap[2] else None,
                "synced_by": snap[3],
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

    if overrides:
        by_key: dict[str, dict] = {}
        for row_key, column, value in overrides:
            by_key.setdefault(row_key, {})[column] = value
        key_col = cfg["key"]
        applied = 0
        for row in rows:
            patch = by_key.get(str(row.get(key_col, "")).strip())
            if patch:
                row.update(patch)
                applied += 1
        meta["overrides_applied"] = applied
    return rows, meta


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


@router.put("/{dataset}/overrides")
async def put_override(dataset: str, body: OverrideIn):
    _check(dataset)
    if not body.row_key.strip() or not body.column_name.strip():
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
                (dataset, body.row_key.strip(), body.column_name.strip(), body.value, body.updated_by),
            )
        _notify(dataset)
        return {"ok": True}
    finally:
        try:
            c.close()
        except Exception:
            pass


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
