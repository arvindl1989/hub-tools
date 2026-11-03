"""The SN Master export button: does it hand over what the table shows?

The page is served from disk with its API calls stubbed, so the test controls
exactly which rows are on screen and can assert the file byte for byte —
including the awkward ones: a comma, a quote, a newline, an en dash and an
accented name.
"""
import csv
import io
import json
import pathlib
import sys

from playwright.sync_api import sync_playwright

PAGE = pathlib.Path("/home/user/hub-tools/kpi-app/web/sn-master/index.html")
OUT = pathlib.Path("/tmp/claude-0/-home-user-hub-tools/"
                   "82e410bb-e079-52f1-bbcc-05d4911973ee/scratchpad")

ROWS = [
    {"number": "PC001", "service": "Email – Local", "who": "Martina Kotoučová",
     "note": "has, a comma"},
    {"number": "PC002", "service": "Website Content Management",
     "who": 'Michał Żyszko', "note": 'has a "quote"'},
    {"number": "PC003", "service": "Content Production – Graphic Design",
     "who": "Ajith A", "note": "line one\nline two"},
    {"number": "PC004", "service": "Email – Local", "who": "Jerlin Jeba",
     "note": "  padded  "},
]

ok = 0


def check(name, cond, detail=""):
    global ok
    print(f"  {'PASS' if cond else 'FAIL'}  {name}" + (f"  — {detail}" if detail else ""))
    assert cond, name
    ok += 1


with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    ctx = b.new_context(accept_downloads=True)
    page = ctx.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)[:200]))

    # Playwright gives precedence to the most recently registered route, so the
    # catch-all goes first and the specific ones override it.
    page.route("**/api/**", lambda r: r.fulfill(
        status=200, content_type="application/json", body="[]"))
    page.route("**/api/sn-data/tickets", lambda r: r.fulfill(
        status=200, content_type="application/json",
        body=json.dumps({"rows": ROWS, "synced_at": "2026-11-03T09:00:00"})))
    page.route("**/api/sn-data/tickets/overrides", lambda r: r.fulfill(
        status=200, content_type="application/json", body="[]"))
    page.route("https://fonts.googleapis.com/**", lambda r: r.abort())
    page.route("https://cdnjs.cloudflare.com/**", lambda r: r.abort())
    page.route("**/sn-master/test.html", lambda r: r.fulfill(
        status=200, content_type="text/html; charset=utf-8",
        body=PAGE.read_text(encoding="utf-8")))
    page.add_init_script("sessionStorage.setItem('aegis_auth','true')")
    page.goto("https://example.invalid/sn-master/test.html", wait_until="domcontentloaded")
    page.wait_for_timeout(1500)

    check("the button is there", page.locator("#exportBtn").count() == 1)
    check("and the table loaded", page.locator("table tbody tr, table tr").count() >= 4,
          str(page.locator("table tr").count()))

    with page.expect_download() as dl:
        page.click("#exportBtn")
    path = dl.value
    saved = OUT / "sn_export.csv"
    path.save_as(str(saved))
    raw = saved.read_bytes()
    print(f"   {dl.value.suggested_filename}  ({len(raw)} bytes)")

    check("named for the dataset and the day",
          dl.value.suggested_filename.startswith("sn-master-tickets-")
          and dl.value.suggested_filename.endswith(".csv"),
          dl.value.suggested_filename)
    check("carries the BOM Excel needs for UTF-8", raw[:3] == b"\xef\xbb\xbf")

    text = raw.decode("utf-8-sig")
    check("uses CRLF line endings", "\r\n" in text)
    parsed = list(csv.reader(io.StringIO(text)))
    print("   header:", parsed[0])
    check("the header is the table's columns",
          parsed[0] == ["number", "service", "who", "note"], str(parsed[0]))
    check("every row came across", len(parsed) == 5, str(len(parsed)))

    body = {r[0]: r for r in parsed[1:]}
    check("an en dash survives", body["PC001"][1] == "Email – Local", body["PC001"][1])
    check("so do the accents", body["PC001"][2] == "Martina Kotoučová", body["PC001"][2])
    check("a comma does not split the field", body["PC001"][3] == "has, a comma",
          body["PC001"][3])
    check("a quote is doubled, not dropped", body["PC002"][3] == 'has a "quote"',
          body["PC002"][3])
    check("a newline stays inside its cell", body["PC003"][3] == "line one\nline two",
          repr(body["PC003"][3]))
    check("padding is preserved", body["PC004"][3] == "  padded  ",
          repr(body["PC004"][3]))

    # Filtered exports carry only what is on screen, and say so in the name.
    page.fill("#search", "Email")
    page.wait_for_timeout(600)
    with page.expect_download() as dl2:
        page.click("#exportBtn")
    f2 = OUT / "sn_export_filtered.csv"
    dl2.value.save_as(str(f2))
    rows2 = list(csv.reader(io.StringIO(f2.read_bytes().decode("utf-8-sig"))))
    print(f"   {dl2.value.suggested_filename}: {len(rows2) - 1} rows")
    check("the filter is applied to the file", len(rows2) == 3, str(len(rows2)))
    check("and the name says it is filtered",
          "-filtered-" in dl2.value.suggested_filename, dl2.value.suggested_filename)

    check("nothing threw", not errs, str(errs[:2]))
    b.close()

print(f"\n{ok} checks passed")
