"""The NPI page's controls, clicked in a browser.

Every figure on that page is meant to open the people behind it — a band, an
area, a frontline, the answered total, a name — and the main table is meant to
sort on any column. None of that is visible to an API test, and a render that
throws leaves an empty root with one line in the console and nothing else.

    python test_npi_page.py        # expects the app on :8822
"""
import re
import sys

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8822"
ok, bad = 0, []


def check(name, cond, detail=""):
    global ok
    print(f"  {'PASS' if cond else 'FAIL'}  {name}" + (f"  — {detail}" if detail else ""))
    if cond:
        ok += 1
    else:
        bad.append(name)


with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    pg = b.new_page(viewport={"width": 1600, "height": 1200})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
    pg.goto(f"{BASE}/kpi", wait_until="networkidle")
    pg.wait_for_timeout(4500)
    pg.get_by_text("NPI 2026", exact=True).first.click()
    pg.wait_for_timeout(4500)

    def alive(label):
        n = pg.eval_on_selector("#root", "e => e.innerText.length")
        check(f"{label}: the page is still rendered", n > 2000, f"{n} characters")

    alive("on load")

    # The respondents table is the one with a sortable Name column.
    table = pg.locator("table").filter(
        has=pg.get_by_role("columnheader", name=re.compile("Who should reach out"))).first
    check("the main table carries the reach-out column", table.count() == 1)

    def names():
        rows = table.locator("tbody tr")
        return [rows.nth(i).locator("td").first.inner_text().strip()
                for i in range(min(rows.count(), 6))]

    print("\nSorting")
    head = table.get_by_role("columnheader", name=re.compile("^Name"))
    head.click(); pg.wait_for_timeout(500)
    up = names()
    head.click(); pg.wait_for_timeout(500)
    down = names()
    print(f"   ascending  {up[:3]}")
    print(f"   descending {down[:3]}")
    check("sorting by name orders it", up == sorted(up, key=str.casefold), str(up[:3]))
    check("and clicking again reverses it", down[0] != up[0], f"{up[0]} vs {down[0]}")

    rec = table.get_by_role("columnheader", name=re.compile("^Recommend"))
    rec.click(); pg.wait_for_timeout(500)
    col = [r.strip() for r in table.locator("tbody tr td:nth-child(4)")
           .all_inner_texts()][:8]
    nums = [int(c) for c in col if c.isdigit()]
    print(f"   recommend ascending {nums[:6]}")
    check("a numeric column sorts as numbers", nums == sorted(nums), str(nums[:6]))
    alive("after sorting")

    print("\nEvery count opens the people behind it")

    def dialog_text():
        return pg.inner_text("body")

    def close():
        pg.keyboard.press("Escape")
        pg.locator("button[aria-label='Close']").first.click()
        pg.wait_for_timeout(500)

    for label in ("Promoters", "Passives", "Detractors"):
        pg.get_by_text(label, exact=True).first.click()
        pg.wait_for_timeout(900)
        t = dialog_text()
        check(f"{label} opens a list", "answered," in t and "did not" in t)
        close()

    # An area row — the cell in the By area table, not the filter's option.
    area_table = pg.locator("table").filter(
        has=pg.get_by_role("columnheader", name=re.compile("^area", re.I))).first
    row = area_table.locator("tbody tr").first
    label = row.locator("td").first.inner_text().strip()
    row.click()
    pg.wait_for_timeout(900)
    t = dialog_text()
    check(f"an area row opens its people ({label})", "answered," in t and "did not" in t)
    check("and the list says who has not replied",
          "No reply" in t or "message sent" in t.lower() or "reached out" in t.lower(),
          t[:0] or "")
    close()
    alive("after the area dialog")

    fl_table = pg.locator("table").filter(
        has=pg.get_by_role("columnheader", name=re.compile("^frontline$", re.I))).first
    frow = fl_table.locator("tbody tr").first
    flabel = frow.locator("td").first.inner_text().strip()
    frow.click()
    pg.wait_for_timeout(900)
    check(f"a frontline row opens its people ({flabel})",
          "answered," in dialog_text() and "did not" in dialog_text())
    close()

    print("\nA name opens that person")
    pg.get_by_role("button", name="Pooja V").first.click()
    pg.wait_for_timeout(1500)
    t = dialog_text()
    check("their scores come up", "Recommend" in t and "Service" in t)
    check("and either their tickets or what to do about the gap",
          "Specialists who worked with them" in t or "Ticket user" in t)
    close()
    alive("after the person dialog")

    print("\nThe comments are clamped, not a wall")
    cards = pg.locator("p[style*='-webkit-box']")
    check("comment text is line-clamped", cards.count() > 0, str(cards.count()))

    check("nothing threw", not errs, "; ".join(errs[:2]))
    pg.screenshot(path="/tmp/npi-page.png", full_page=True)
    b.close()

print(f"\n{ok} checks passed" + (f", {len(bad)} FAILED: {bad}" if bad else ""))
sys.exit(1 if bad else 0)
