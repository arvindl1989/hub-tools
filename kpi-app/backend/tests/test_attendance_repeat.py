"""The attendance tracker's Repeat Weekly panel.

Needs no server: the page is served to the browser from disk with its Firebase
imports swapped for a recorder, so the test asserts on what the page TRIED to
write without touching the live shared database.

    python test_attendance_repeat.py

The real page talks to a live shared database. Nothing here may reach it, so
the Firebase module is replaced with a recorder before the page's own module
runs, and the test asserts on what the page TRIED to write.
"""
import pathlib
import re
import sys

from playwright.sync_api import sync_playwright

PAGE = pathlib.Path("/home/user/hub-tools/kpi-app/web/attendance/index.html")
html = PAGE.read_text()

# Point the Firebase imports at a local stub and drop the auth redirect.
stub = "/stub/firebase.js"
html = re.sub(r'from "https://www\.gstatic\.com/firebasejs/[^"]+"', f'from "{stub}"', html)
html = html.replace("window.location.replace('../login.html');", "void 0;")

STUB = """
export function initializeApp() { return {} }
export function getDatabase() { return {} }
export function ref(_db, path) { return { path } }
export function set(r, value) { (window.__writes ||= []).push([r.path, value]) }
export function remove(r) { (window.__writes ||= []).push([r.path, null]) }
export function push(r, value) { (window.__pushes ||= []).push([r.path, value]) }
export function onValue(_r, cb) {
  // The page asks a snapshot whether it exists before reading it.
  cb({ val: () => null, exists: () => false, forEach: () => {} })
}
"""

ok = 0


def check(name, cond, detail=""):
    global ok
    print(f"  {'PASS' if cond else 'FAIL'}  {name}" + (f"  — {detail}" if detail else ""))
    assert cond, name
    ok += 1


with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    page = b.new_page(viewport={"width": 1400, "height": 1000})
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)[:200]))
    page.route("**/stub/firebase.js", lambda route: route.fulfill(
        status=200, content_type="application/javascript", body=STUB))
    page.route("https://fonts.googleapis.com/**", lambda r: r.abort())
    page.route("https://cdnjs.cloudflare.com/**", lambda r: r.abort())
    page.route("**/attendance/test.html", lambda route: route.fulfill(
        status=200, content_type="text/html", body=html))
    page.add_init_script("sessionStorage.setItem('aegis_auth','true')")
    page.goto("https://example.invalid/attendance/test.html", wait_until="domcontentloaded")
    page.wait_for_timeout(1200)

    check("the page came up", page.locator("#repeatApplyBtn").count() == 1)
    page.click("#toggleRepeatBtn")
    page.wait_for_timeout(300)

    # Ajith A — Wednesdays and Fridays, Nov 2026 to end of Jan 2027.
    page.select_option("#employeeSelect", "Ajith A")
    page.select_option("#statusSelect", "wfh")
    page.fill("#repeatFrom", "2026-11-01")
    page.fill("#repeatTo", "2027-01-31")
    for label in ("Wed", "Fri"):
        page.click(f"#repeatDays button:text-is('{label}')")
    page.wait_for_timeout(400)
    preview = page.inner_text("#repeatPreview")
    print("   preview:", preview.replace("\n", " | "))
    # 26 Wednesdays and Fridays in the range, less Christmas and New Year's
    # Day — both of which fall on a Friday.
    check("the preview counts the days", "24" in preview, preview)
    check("and says what it will skip", "skipped" in preview, preview)

    page.once("dialog", lambda d: d.accept())
    page.click("#repeatApplyBtn")
    page.wait_for_timeout(600)
    page.once("dialog", lambda d: d.accept())
    page.wait_for_timeout(400)

    writes = page.evaluate("() => window.__writes || []")
    days = sorted(w[0].split('/')[1] for w in writes)
    print(f"   wrote {len(writes)} days, {days[0]} → {days[-1]}")
    check("24 days written", len(writes) == 24, str(len(writes)))
    check("all of them WFH", all(w[1] == {"status": "wfh"} for w in writes))
    check("all of them Ajith", all(w[0].endswith("/Ajith A") for w in writes))
    check("Christmas is not among them", "2026-12-25" not in days)
    check("New Year's Day is not either", "2027-01-01" not in days)
    check("only Wednesdays and Fridays",
          all(__import__("datetime").date.fromisoformat(d).weekday() in (2, 4) for d in days))
    pushes = page.evaluate("() => window.__pushes || []")
    check("one log line, not twenty-five", len(pushes) == 1, str(len(pushes)))
    print("   log:", pushes[0][1]["details"])
    check("nothing threw", not errs, str(errs[:2]))
    b.close()

print(f"\n{ok} checks passed")
