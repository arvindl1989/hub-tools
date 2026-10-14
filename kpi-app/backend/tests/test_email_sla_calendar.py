"""The email tracker's due dates must land where the dashboard's do.

The tracker computes them in the browser and the dashboard on the server, so
the only check worth making is running both over the same dates and comparing.
A due date that ignores Diwali is a day early, and the chase goes out before
the work is actually late.
"""
import sys
from datetime import date
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, "/home/user/hub-tools/kpi-app/backend")
import main  # noqa: E402

PAGE = Path("/home/user/hub-tools/kpi-app/web/email/index.html")

# Created dates that sit either side of a holiday, a weekend, and both.
CASES = [
    ("2026-11-06", 10),   # Friday before Diwali Monday
    ("2026-11-09", 10),   # Diwali itself — the start moves to the Tuesday
    ("2026-01-14", 7),    # day before Pongal
    ("2026-10-01", 30),   # across Gandhi Jayanti and Ayudha Pooja
    ("2026-04-13", 7),    # across Tamil New Year
    ("2026-06-01", 10),   # a clean fortnight with nothing in it
    ("2026-12-24", 10),   # across Christmas and the new year
]

html = PAGE.read_text()
# The page redirects to a login and talks to Google on load, so only the two
# functions under test are lifted out and run on their own.
start = html.index("let HOLIDAYS = new Set([")
end = html.index("function daysFromToday(")
js = html[start:end]

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    page = b.new_page()
    page.add_script_tag(content=js)
    ok = 0
    for created, days in CASES:
        y, m, d = (int(x) for x in created.split("-"))
        got = page.evaluate(
            "([y, m, d, days]) => { const r = addWorkDays(new Date(y, m - 1, d), days);"
            " return [r.getFullYear(), r.getMonth() + 1, r.getDate()].join('-') }",
            [y, m, d, days])
        got_date = date(*(int(x) for x in got.split("-")))
        want = main.add_working_days(date(y, m, d), days)
        want = want.date() if hasattr(want, "date") else want
        good = got_date == want
        print(f"  {'PASS' if good else 'FAIL'}  {created} + {days} wd → tracker {got_date}, "
              f"dashboard {want}")
        assert good, created
        ok += 1

    # And the holiday list itself is the server's, not a stale copy.
    n = page.evaluate("() => HOLIDAYS.size")
    want_n = len({d for yr in main.HOLIDAYS_BY_YEAR.values() for d in yr})
    print(f"  {'PASS' if n == want_n else 'FAIL'}  the baked-in fallback matches the "
          f"server list: {n} dates vs {want_n}")
    assert n == want_n
    ok += 1
    b.close()
print(f"\n{ok} checks passed")
