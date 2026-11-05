"""The two locked reports, each opened with its own key.

Capacity and Experimental Reports are gated separately. The check worth
keeping is not that a password works but that the wrong one does not: one
boolean behind both would have meant unlocking either opened the other, and
nothing on screen would have said so.

    python test_report_locks.py        # expects the app on :8822
"""
import re
import sys

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8822/kpi"
ok = 0


def check(name, cond, detail=""):
    global ok
    print(f"  {'PASS' if cond else 'FAIL'}  {name}" + (f"  — {detail}" if detail else ""))
    assert cond, name
    ok += 1


errs = []
with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    pg = b.new_page(viewport={"width": 1680, "height": 1100})
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(BASE, wait_until="networkidle")
    pg.wait_for_timeout(3500)

    def body():
        return pg.inner_text("body")

    def asking():
        return "password required" in body().lower()

    print("Capacity")
    pg.get_by_text("Capacity", exact=True).first.click()
    pg.wait_for_timeout(1500)
    check("the tab asks before it opens", asking())
    check("and names itself while asking",
          "Capacity — password required" in body(),
          next((l for l in body().splitlines() if "password" in l.lower()), "?"))
    check("the report is not rendered behind the prompt",
          "AVAILABILITY AND ALLOCATION" not in body())

    # The other report's key must not open this one.
    pg.locator("input[type=password]").first.fill("Whiteshadows")
    pg.keyboard.press("Enter")
    pg.wait_for_timeout(1500)
    check("the other report's password is refused",
          "AVAILABILITY AND ALLOCATION" not in body())

    pg.locator("input[type=password]").first.fill("White6shadows")
    pg.keyboard.press("Enter")
    pg.wait_for_timeout(4000)
    check("its own password opens it", "AVAILABILITY AND ALLOCATION" in body())

    print("\nExperimental Reports, still its own lock")
    pg.get_by_text("Dashboard", exact=True).first.click()
    pg.wait_for_timeout(2500)
    pg.get_by_role("button", name=re.compile("Open Experimental Reports")).first.click()
    pg.wait_for_timeout(1800)
    check("unlocking Capacity did not unlock it too", asking())
    check("and it names itself too", "Experimental reports — password required" in body())
    pg.locator("input[type=password]").first.fill("White6shadows")
    pg.keyboard.press("Enter")
    pg.wait_for_timeout(1500)
    check("Capacity's password is refused here", asking())
    pg.locator("input[type=password]").first.fill("Whiteshadows")
    pg.keyboard.press("Enter")
    pg.wait_for_timeout(3000)
    check("its own password opens it", not asking())

    check("and nothing threw along the way", not errs, "; ".join(errs[:2]))
    b.close()

print(f"\n{ok} checks passed")
sys.exit(0)
