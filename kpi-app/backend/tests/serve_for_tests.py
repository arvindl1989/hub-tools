"""Serve the real backend with the built frontend in front of it.

Every suite in run_all.py talks to a live app on :8822. Only the database and
the ticket source are stubbed, so a pass here is what the page will do.

    python serve_for_tests.py        # then, in another shell, python run_all.py

This used to live in a scratch directory outside the repository. That worked
until the container was recycled and took it with it, along with the fixture
three tests were loading from the same place, so none of the suites could run.
It lives beside the tests now.
"""
import os
import sys
from pathlib import Path

import uvicorn
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

HERE = Path(__file__).resolve().parent
BACKEND = HERE.parent
DIST = BACKEND.parent / "frontend" / "dist"
sys.path.insert(0, str(BACKEND))
sys.path.insert(0, str(HERE))

import main  # noqa: E402

app = FastAPI()
if (DIST / "assets").is_dir():
    app.mount("/kpi/assets", StaticFiles(directory=str(DIST / "assets")), name="fresh-assets")


@app.get("/kpi")
@app.get("/kpi/{path:path}")
async def kpi(path: str = ""):
    return FileResponse(str(DIST / "index.html"))


# The dashboard refreshes from the Google Sheet on every load and drops its
# session when that fails, so the fixture tickets stand in for the sheet.
@app.get("/api/tickets")
async def tickets(refresh: bool = False):
    import fixture_tickets
    rows = fixture_tickets.build()
    # A departed specialist still in the history, to check that the filter
    # offers a leaver while their work is in range.
    leaver = os.environ.get("UA_LEAVER")
    if leaver:
        for r in rows[:9]:
            r["Assigned to"] = leaver
    # The fixture closes everything, which leaves the SLA's open-and-late
    # columns empty and proves nothing. UA_OPEN_SLICE=7 reopens every seventh
    # ticket; the old ones among them are the breaches worth seeing.
    slice_n = int(os.environ.get("UA_OPEN_SLICE", "0") or 0)
    if slice_n:
        for i, r in enumerate(rows):
            if i % slice_n == 0:
                r["Closed"] = None
                r["State"] = "Work in progress"
    return rows


app.mount("/", main.app)

if __name__ == "__main__":
    if not (DIST / "index.html").exists():
        print(f"No build at {DIST} — run `npm run build` in kpi-app/frontend first.")
        sys.exit(1)
    uvicorn.run(app, host="127.0.0.1", port=8822, log_level="warning")
