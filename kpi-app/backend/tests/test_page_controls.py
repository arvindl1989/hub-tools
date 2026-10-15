"""Click everything on the User Activity page and report what breaks.

The heat-map dialog threw a ReferenceError that blanked the page, and nothing
caught it: the bundler cannot see a free variable, and no test clicked the
cell. This does. Every control is exercised in both ticket and hours mode, and
any page error, failed request or emptied DOM is reported with what triggered
it.

Needs the built frontend served at /kpi/ by the instance under test, not just
the API — it is the rendered page being clicked.
"""
import json
import sys
import urllib.request

from playwright.sync_api import sync_playwright

from pathlib import Path

BASE = "http://127.0.0.1:8822"
OUT = str(Path(__file__).parent)
sys.path.insert(0, OUT)
import fixture_tickets  # noqa: E402

rows = fixture_tickets.build()
for i, r in enumerate(rows):
    if i % 7 == 0:
        r["Closed"] = None
        r["State"] = "Work in progress"

req = urllib.request.Request(f"{BASE}/api/upload-json",
                             data=json.dumps({"rows": rows, "source_label": "Fixture"}).encode(),
                             headers={"Content-Type": "application/json"})
meta = json.loads(urllib.request.urlopen(req).read())
sid = meta["session_id"]

problems = []
step = {"name": "load"}


def run(page):
    def act(name, fn):
        step["name"] = name
        before = len(problems)
        try:
            fn()
            page.wait_for_timeout(450)
        except Exception as e:                      # noqa: BLE001 - reporting, not handling
            problems.append(f"{name}: {type(e).__name__} {str(e)[:160]}")
        # A thrown render unmounts the tree, so an empty root is the symptom
        # to look for even when the error itself was swallowed.
        body = page.evaluate("() => (document.getElementById('root')?.innerText || '').length")
        if body < 200:
            problems.append(f"{name}: the page emptied (root has {body} characters)")
        print(f"  {'FAIL' if len(problems) > before else 'ok  '}  {name}")

    # ── Cards, each of which opens a list ────────────────────────────────────
    for label in ["Total Users", "Active", "Regular", "Dormant", "Repeat Use Rate",
                  "New in last", "Top Requestors", "Service Utility Rate by FL",
                  "Global Teams", "Areas", "Frontlines"]:
        card = page.locator(f"text=/^{label}/i").first
        if not card.count():
            print(f"  --    {label}: not on the page")
            continue
        act(f"card: {label}", lambda c=card: c.click())
        act(f"card: {label} — escape", lambda: page.keyboard.press("Escape"))

    # ── The effort toggle, and everything again underneath it ────────────────
    for mode in ["Est. hours", "Tickets"]:
        b = page.get_by_role("button", name=mode).first
        if b.count():
            act(f"toggle: {mode}", lambda b=b: b.click())

    # ── Heat map ─────────────────────────────────────────────────────────────
    for mode in ["Per user", "Total"]:
        b = page.get_by_role("button", name=mode).first
        if b.count():
            act(f"heat map: {mode}", lambda b=b: b.click())

    cell = page.locator("td[title*='Click to see who']").first
    if cell.count():
        cell.scroll_into_view_if_needed()
        page.wait_for_timeout(300)
        act("heat map: click a number box", lambda: cell.click(force=True))
        act("heat map: the dialog lists users", lambda: None)
        # The headers are uppercased in CSS and Playwright matches rendered
        # text, so the needle has to be case-blind or it never matches.
        # The headers are uppercased in CSS and Playwright matches rendered
        # text, so a plain "Last Raised" needle never matches.
        if not page.locator("th", has_text="Raised").count():
            problems.append("heat map: the dialog opened without its user table")
        act("heat map: escape", lambda: page.keyboard.press("Escape"))
    else:
        problems.append("heat map: no clickable cell found")

    b = page.get_by_role("button", name="Users who haven't used").first
    if b.count():
        act("heat map: expand the non-users", lambda b=b: b.click())

    # ── Service Utility Rate board ───────────────────────────────────────────
    exp = page.get_by_role("button", name="sub-services").first
    if exp.count():
        act("board: expand Demand Engagement", lambda: exp.scroll_into_view_if_needed())
        act("board: expand Demand Engagement (click)", lambda: exp.click())
    for i in range(3):
        b = page.get_by_role("button", name="FLs").nth(i)
        if b.count() and b.is_enabled():
            act(f"board: never-used list {i + 1}", lambda b=b: b.click())
            act(f"board: never-used list {i + 1} — escape",
                lambda: page.keyboard.press("Escape"))

    # ── User list: search, tier, sorting ─────────────────────────────────────
    box = page.get_by_placeholder("Search").first
    if box.count():
        act("user list: search", lambda: box.fill("a"))
        act("user list: clear search", lambda: box.fill(""))
    for name in ["Requests", "Days Since", "Services Used"]:
        h = page.locator(f"th:has-text('{name}')").first
        if h.count():
            act(f"user list: sort by {name}", lambda h=h: h.click())
            act(f"user list: sort by {name} again", lambda h=h: h.click())


with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    page = b.new_page(viewport={"width": 1700, "height": 1100})
    page.on("pageerror", lambda e: problems.append(f"{step['name']}: pageerror {e}"))
    NOISE = ("Failed to load resource", "ERR_CERT_AUTHORITY_INVALID")

    page.on("console", lambda m: m.type == "error"
            and not any(n in m.text for n in NOISE)
            and problems.append(f"{step['name']}: console {m.text[:160]}"))
    # Fonts and the endpoints this stub does not serve fail by design here.
    page.on("requestfailed", lambda r: step["name"] != "load"
            and not r.url.endswith((".ttf", ".woff", ".woff2"))
            and "fonts.googleapis" not in r.url
            and problems.append(f"{step['name']}: request failed {r.url[-70:]}"))
    page.goto(f"{BASE}/kpi/", wait_until="load")
    page.evaluate("([sid, meta]) => { localStorage.setItem('ticketSessionId', sid);"
                  " localStorage.setItem('ticketMeta', JSON.stringify(meta)) }", [sid, meta])
    page.reload(wait_until="load")
    page.wait_for_timeout(1800)
    page.get_by_role("button", name="User Activity").click()
    page.wait_for_timeout(2600)
    run(page)
    b.close()

print()
if problems:
    print(f"{len(problems)} problems:")
    for p_ in problems:
        print("  -", p_)
    sys.exit(1)
print("No errors on any control.")
