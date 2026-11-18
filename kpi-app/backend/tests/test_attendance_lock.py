"""Closed periods on the attendance calendar.

December 2026 from the 18th is signed off and must not move. A lock that only
lives in the click handler is not a lock: a selection made before the period
closed, carried over from another month, or built by the repeat-weekly tool
never passes through that handler at all. So the test drives each write path
and asserts on what the page TRIED to write.

Needs no server. The page is served from disk with its Firebase imports
swapped for a recorder, so nothing here can reach the live shared database.

    python test_attendance_lock.py
"""
import pathlib
import re
import sys

from playwright.sync_api import sync_playwright

PAGE = pathlib.Path(__file__).resolve().parents[2] / "web" / "attendance" / "index.html"
html = PAGE.read_text()

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
export function onValue(r, cb) {
  const seed = (window.__seed || {})[r.path] || null
  cb({ val: () => seed, exists: () => !!seed, forEach: () => {} })
}
"""

LOCKED = [f"2026-12-{d:02d}" for d in range(18, 32)]
ok, failed = 0, []


def check(name, cond, detail=""):
    global ok
    print(f"  {'PASS' if cond else 'FAIL'}  {name}" + (f"  — {detail}" if detail else ""))
    if cond:
        ok += 1
    else:
        failed.append(name)


def touched(page):
    """Every dated path the page tried to write or delete."""
    return [p for p, _ in page.evaluate("() => window.__writes || []")]


with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    page = b.new_page(viewport={"width": 1400, "height": 1000})
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)[:200]))
    page.on("dialog", lambda d: d.accept())
    page.route("**/stub/firebase.js", lambda route: route.fulfill(
        status=200, content_type="application/javascript", body=STUB))
    page.route("https://fonts.googleapis.com/**", lambda r: r.abort())
    page.route("https://cdnjs.cloudflare.com/**", lambda r: r.abort())
    page.route("**/attendance/test.html", lambda route: route.fulfill(
        status=200, content_type="text/html", body=html))
    page.add_init_script("sessionStorage.setItem('aegis_auth','true')")
    # Something already recorded inside the closed period, so the test can
    # tell "refused to change it" from "there was nothing there".
    page.add_init_script("""window.__seed = { attendance: {
      '2026-12-21': { 'Ajith A': { status: 'wfh' } }
    } }""")
    page.goto("https://example.invalid/attendance/test.html",
              wait_until="domcontentloaded")
    page.wait_for_timeout(1400)
    check("the page came up", page.locator("#calendar-grid").count() == 1)

    print("\nDecember 2026, as it renders")
    page.click("#nextMonth") if False else None
    page.evaluate("""() => {
      document.getElementById('monthYearDisplay');
    }""")
    # Walk the month picker to December 2026 rather than poking at the
    # module's variables, which are not on window.
    for _ in range(36):
        label = page.inner_text("#monthYearDisplay")
        if label.strip() == "December 2026":
            break
        page.click("#nextMonth" if "2026" not in label or "December" not in label else "#prevMonth")
        page.wait_for_timeout(60)
    page.wait_for_timeout(500)
    check("the calendar is on December 2026",
          page.inner_text("#monthYearDisplay").strip() == "December 2026",
          page.inner_text("#monthYearDisplay"))

    locked = page.locator(".locked-cell")
    nums = sorted(int(locked.nth(i).locator(".date-num").inner_text())
                  for i in range(locked.count()))
    print(f"   locked days: {nums}")
    # Every day in the span, weekends and Christmas included: they were
    # uneditable already, but the fortnight has to read as one closed block.
    check("the 18th to the 31st are all marked closed",
          nums == list(range(18, 32)), str(nums))
    check("each one says why",
          "cannot be edited" in (locked.first.get_attribute("title") or ""),
          locked.first.get_attribute("title"))
    check("a locked day still shows who was where",
          locked.nth(3).locator(".status-row").count() > 0)

    print("\nClicking one does nothing")
    page.evaluate("() => { window.__writes = [] }")
    locked.nth(3).click(force=True)
    page.wait_for_timeout(300)
    check("no day is selected", page.locator(".day-cell.selected").count() == 0)
    check("and nothing was written", touched(page) == [], str(touched(page)))

    print("\nAn open day in the same month still works")
    open_cell = page.locator(
        ".day-cell.day:not(.locked-cell):not(.holiday-cell)").first
    open_cell.click()
    page.wait_for_timeout(300)
    check("it selects", page.locator(".day-cell.selected").count() == 1)
    page.select_option("#employeeSelect", "Ajith A")
    page.select_option("#statusSelect", "wfh")
    page.evaluate("() => { window.__writes = [] }")
    page.click("#applyStatusBtn")
    page.wait_for_timeout(400)
    wrote = touched(page)
    check("and applying a status writes it", any("attendance/2026-12-" in w for w in wrote),
          str(wrote[:2]))
    check("to an open day, not a closed one",
          not any(any(d in w for d in LOCKED) for w in wrote), str(wrote))

    print("\nThe repeat tool skips the closed days")
    page.click("#toggleRepeatBtn")
    page.wait_for_timeout(300)
    page.click("#repeatModeRange")
    page.wait_for_timeout(200)
    page.fill("#repeatFrom", "2026-12-01")
    page.fill("#repeatTo", "2026-12-31")
    for label in ("Mon", "Tue", "Wed", "Thu", "Fri"):
        page.click(f"#repeatDays button:text-is('{label}')")
    page.wait_for_timeout(400)
    page.evaluate("() => { window.__writes = [] }")
    page.click("#repeatApplyBtn")
    page.wait_for_timeout(600)
    wrote = touched(page)
    hit_locked = [w for w in wrote if any(d in w for d in LOCKED)]
    print(f"   wrote {len(wrote)} days, {len(hit_locked)} of them closed")
    check("it wrote the open half of the month", len(wrote) > 0, str(len(wrote)))
    check("and not one closed day", hit_locked == [], str(hit_locked))

    check("nothing threw", not errs, "; ".join(errs[:2]))
    page.screenshot(path="/tmp/attendance-lock.png", full_page=True)
    b.close()

print(f"\n{ok} checks passed" + (f", {len(failed)} FAILED: {failed}" if failed else ""))
sys.exit(1 if failed else 0)
