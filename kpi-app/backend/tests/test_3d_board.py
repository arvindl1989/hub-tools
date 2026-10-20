"""The 3D board: the figures behind it, and the page that draws them.

The field is the one view where a mistake is hard to see — a bar that is wrong
by a third still looks like a bar — so the arithmetic is checked here against a
fixture whose answer is known by construction, and the page is then opened in a
browser to prove the canvas comes up and the numbers reach it.

    python test_3d_board.py        # expects the app, with its frontend, on :8822
"""
import json
import sys
import urllib.parse
import urllib.request

BASE = "http://127.0.0.1:8822"
ok = 0


def check(name, cond, detail=""):
    global ok
    print(f"  {'PASS' if cond else 'FAIL'}  {name}" + (f"  — {detail}" if detail else ""))
    assert cond, name
    ok += 1


def ticket(n, created, area, service="Website Content Management", closed=None):
    return {"Number": f"TD{n:06d}", "Short description": "r", "Requested by": f"U{n % 7}",
            "Assigned to": "Ajith A", "Created": created, "Closed": closed,
            "State": "Closed Completed" if closed else "Work in progress",
            "Area": area, "Team": "EEM", "Sub-Category": service}


# Three months, two areas, counts chosen so every cell is known by hand.
#   Jul 2026  EUR 3   APM 1
#   Aug 2026  EUR 0   APM 5     <- a month an area sat out entirely
#   Sep 2026  EUR 2   APM 2, plus the one left open below, so EUR reads 3
PLAN = [("2026-07", "EUR", 3), ("2026-07", "APM", 1),
        ("2026-08", "APM", 5),
        ("2026-09", "EUR", 2), ("2026-09", "APM", 2)]
rows, n = [], 0
for month, area, count in PLAN:
    for i in range(count):
        n += 1
        rows.append(ticket(n, f"{month}-{(i % 20) + 1:02d} 09:00:00", area,
                           closed=f"{month}-{(i % 20) + 2:02d} 17:00:00"))
# One left open, so "open now" is not trivially zero.
n += 1
rows.append(ticket(n, "2026-09-10 09:00:00", "EUR"))

req = urllib.request.Request(f"{BASE}/api/upload-json",
                             data=json.dumps({"rows": rows}).encode(),
                             headers={"Content-Type": "application/json"})
sid = json.loads(urllib.request.urlopen(req).read())["session_id"]
d = json.loads(urllib.request.urlopen(
    f"{BASE}/api/sessions/{sid}/kpi-3d?{urllib.parse.urlencode({'months': 3})}").read())

print("Three months, two areas")
print(f"   months {[m['label'] for m in d['months']]}  areas {d['areas']}")
check("three months on the axis", len(d["months"]) == 3, str(len(d["months"])))
check("both areas", d["areas"] == ["APM", "EUR"], str(d["areas"]))
check("a cell for every pair", len(d["grid"]) == 6, str(len(d["grid"])))

cells = {(c["m"], c["a"]): c["n"] for c in d["grid"]}
ai = {a: i for i, a in enumerate(d["areas"])}
print(f"   EUR by month: {[cells[(m, ai['EUR'])] for m in range(3)]}")
print(f"   APM by month: {[cells[(m, ai['APM'])] for m in range(3)]}")
check("EUR reads 3, 0, 3", [cells[(m, ai["EUR"])] for m in range(3)] == [3, 0, 3])
check("APM reads 1, 5, 2", [cells[(m, ai["APM"])] for m in range(3)] == [1, 5, 2])

# A month an area sat out has to be a flat square in the field, not a missing
# column: a hole would shorten the axis and silently move every later month.
check("the empty month is present and zero, not absent", cells[(1, ai["EUR"])] == 0)
check("the tallest cell sets the scale", d["max"] == 5, str(d["max"]))

print("\nThe headline figures")
h = d["headline"]
print(f"   {h}")
check("fourteen raised", h["requests"] == 14, str(h["requests"]))
check("thirteen closed", h["closed"] == 13, str(h["closed"]))
check("one still open", h["open"] == 1, str(h["open"]))
check("the window ends at the newest request", h["period_end"] == "2026-09-10",
      h["period_end"])
# Raised at nine in the morning of the newest day, this one read as minus one
# day old: the end of the period is a date at midnight and the ticket is after
# it. Nothing open is ever a negative number of days old.
check("the open one is nought days old, not minus one", h["median_open_age"] == 0,
      str(h["median_open_age"]))

print("\nRaised against closed, per month")
print(f"   {[(t['label'], t['raised'], t['closed']) for t in d['trend']]}")
check("a row per month", len(d["trend"]) == 3)
check("raised matches the grid",
      [t["raised"] for t in d["trend"]] == [4, 5, 5],
      str([t["raised"] for t in d["trend"]]))

print("\nServices are the three the business sells")
check("DEA is rolled up, not split",
      all(s["service"] != "Email – Local" for s in d["services"]), str(d["services"]))

# ── The page itself ──────────────────────────────────────────────────────────
print("\nThe board renders")
try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print("  --    playwright not installed; skipping the browser check")
    print(f"\n{ok} checks passed")
    sys.exit(0)

meta = {"session_id": sid}
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium",
                          args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader"])
    page = b.new_page(viewport={"width": 1600, "height": 1000})
    errors = []
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.goto(f"{BASE}/kpi/", wait_until="load")
    page.evaluate("([s, m]) => { localStorage.setItem('ticketSessionId', s);"
                  " localStorage.setItem('ticketMeta', JSON.stringify(m)) }", [sid, meta])
    page.reload(wait_until="load")
    page.wait_for_timeout(1600)
    page.get_by_role("button", name="3D Board").click()
    page.wait_for_timeout(5000)

    check("a canvas is on the page", page.locator("canvas").count() == 1)
    size = page.evaluate("() => { const c = document.querySelector('canvas');"
                         " return [c.width, c.height] }")
    print(f"   canvas {size[0]} x {size[1]}")
    # It collapsed to 150px once, because the canvas sizes itself to a parent
    # whose height came from its siblings. A board nobody can see is a bug.
    check("and it is big enough to be a board", size[1] >= 360, f"{size[1]}px tall")
    check("the headline figures reached it",
          "14" in page.inner_text("body"), "requests raised")
    check("nothing threw", not errors, str(errors[:2]))

    # ── The world ────────────────────────────────────────────────────────────
    # It is the default view, and it has to stand up without a feedback sheet:
    # this instance has no feedback source, so the satisfaction car simply has
    # nothing to read and the building is otherwise whole.
    print("\n   The building")

    def panel_title():
        return page.evaluate(
            """() => { const d = [...document.querySelectorAll('div')]
                .filter(e => e.children.length > 2 && /Requests|Reading/.test(e.innerText))
                .sort((a, b) => a.innerText.length - b.innerText.length)[0];
               return d ? d.innerText.split('\\n')[0] : 'none' }""")

    check("the world is what opens", panel_title() == "The hub", panel_title())
    page.get_by_role("button", name="Hold").click()
    page.wait_for_timeout(600)

    box = page.locator("canvas").bounding_box()
    picked = None
    # Where a slab lands on screen depends on the camera, so several points
    # are tried and the assertion is that clicking the building selects
    # something — not that a particular pixel is a particular area.
    for fx, fy in [(0.40, 0.45), (0.38, 0.55), (0.42, 0.68), (0.45, 0.78), (0.50, 0.50)]:
        page.mouse.click(box["x"] + box["width"] * fx, box["y"] + box["height"] * fy)
        page.wait_for_timeout(400)
        t = panel_title()
        if t not in ("The hub", "none"):
            picked = t
            break
    print(f"      clicking the building selected: {picked}")
    check("a floor can be picked", picked is not None, str(picked))
    check("and it names an area", picked in ("EUR", "APM", "AME", "GCN", "GLOBAL"), str(picked))
    body = page.inner_text("body")
    check("the panel carries that area's own figures",
          "Requests raised" in body and "Utility rate" in body)

    # Clicking past the building clears it again.
    page.mouse.click(box["x"] + box["width"] * 0.06, box["y"] + box["height"] * 0.12)
    page.wait_for_timeout(500)
    check("clicking away clears the selection", panel_title() == "The hub", panel_title())

    print("\n   The field is still there behind the toggle")
    page.get_by_role("button", name="Volume field").click()
    page.wait_for_timeout(2500)
    check("the field still renders", page.locator("canvas").count() == 1)
    check("still nothing threw", not errors, str(errors[:2]))
    b.close()

print(f"\n{ok} checks passed")
