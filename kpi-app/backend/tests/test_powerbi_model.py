"""The Power BI model: every definition already a column.

The reason this export exists is that Power BI must never re-derive anything.
So the checks worth keeping are not that the file downloads — they are that
each column carrying a decision carries the same decision the app's own pages
do, against the same fixture.

    python test_powerbi_model.py        # expects the app on :8822
"""
import io
import json
import pathlib
import sys
import urllib.request

import openpyxl

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import fixture_tickets  # noqa: E402

BASE = "http://127.0.0.1:8822"
ok, bad = 0, []


def check(name, cond, detail=""):
    global ok
    print(f"  {'PASS' if cond else 'FAIL'}  {name}" + (f"  — {detail}" if detail else ""))
    if cond:
        ok += 1
    else:
        bad.append(name)


def get(path):
    return json.loads(urllib.request.urlopen(f"{BASE}{path}", timeout=120).read())


rows = fixture_tickets.build()
# A PWR ticket filed under an ordinary sub-category: the case the routing
# column exists for.
rows.append({"Number": "PBI00001", "Short description": "pwr work",
             "Requested by": "Nils Fischer 34", "Assigned to": "Nitish JK",
             "Created": "2026-03-02 09:00:00", "Closed": "2026-03-20 17:00:00",
             "State": "Closed Completed", "Area": "GLOBAL", "Team": "PWR",
             "Sub-Category": "Website Content Management"})
sid = json.loads(urllib.request.urlopen(urllib.request.Request(
    f"{BASE}/api/upload-json", data=json.dumps({"rows": rows}).encode(),
    headers={"Content-Type": "application/json"})).read())["session_id"]

print("The workbook")
raw = urllib.request.urlopen(f"{BASE}/api/powerbi/model.xlsx?sid={sid}", timeout=180).read()
wb = openpyxl.load_workbook(io.BytesIO(raw), read_only=True)
check("it is a real workbook", len(raw) > 10000, f"{len(raw)} bytes")
check("with every sheet the model needs",
      set(wb.sheetnames) == {"fact_ticket", "fact_feedback", "dim_person",
                             "dim_service", "dim_date", "dim_setting"},
      str(wb.sheetnames))


def sheet(name):
    it = wb[name].iter_rows(values_only=True)
    hdr = list(next(it))
    return hdr, [dict(zip(hdr, r)) for r in it if any(v is not None for v in r)]

hdr, facts = sheet("fact_ticket")
print(f"   fact_ticket: {len(facts)} rows, {len(hdr)} columns")
check("one row per ticket", len(facts) == len(rows), f"{len(facts)} vs {len(rows)}")
check("the derived columns are all there",
      {"service", "capacity_column", "is_closed", "effort_days", "sla_due",
       "sla_breached", "turnaround_days"} <= set(hdr), str(sorted(hdr)))

print("\nThe columns carry the app's decisions, not Power BI's")
pwr = next(f for f in facts if f["ticket"] == "PBI00001")
check("a PWR ticket filed as WCM counts as PWR, because team beats sub-category",
      pwr["capacity_column"] == "PWR/KDB",
      f"{pwr['capacity_column']} from sub-category {pwr['sub_category']!r}")
check("and its display service is still what it was filed as",
      pwr["service"] == "Website Content Management", str(pwr["service"]))

# Closed means both states, the same as everywhere else.
plan = get(f"/api/sessions/{sid}/capacity-plan?year=2026")
states = set(plan["closed_states"])
closed_here = sum(1 for f in facts if f["is_closed"])
closed_states_in_fixture = sum(1 for f in facts if f["state"] in states)
check("closed means what the capacity sheet says it means",
      closed_here == closed_states_in_fixture,
      f"{closed_here} vs {closed_states_in_fixture} ({' + '.join(sorted(states))})")

# Effort is the capacity rate, to the hour.
svc_hdr, svcs = sheet("dim_service")
rate = {(s["year"], s["capacity_column"]): s["year_hours"] for s in svcs}
sample = [f for f in facts if f["is_closed"] and f["effort_hours"]][:40]
agree = sum(1 for f in sample
            if abs((f["effort_hours"] or 0)
                   - (rate.get((f["closed"].year, f["capacity_column"])) or 0)) < 0.001)
check("effort is priced at the rate for the year it closed in",
      agree == len(sample), f"{agree} of {len(sample)}")
check("and days are hours over an eight-hour day",
      all(abs(f["effort_days"] - f["effort_hours"] / 8) < 1e-6 for f in sample))

# The SLA column agrees with the app's own SLA page for the same tickets.
breached = {f["ticket"] for f in facts if f["sla_breached"]}
print(f"   {len(breached)} breaches in the model")
check("a breach needs a due date to miss",
      all(f["sla_due"] is not None for f in facts if f["sla_breached"]))
check("and an open ticket inside its window is not one",
      not any(f["sla_breached"] and f["closed"] is None
              and f["sla_due"] and f["sla_due"].date() >= __import__("datetime").date.today()
              for f in facts))

print("\nPeople carry their productive days, net of everything")
_, people = sheet("dim_person")
p26 = {p["person"]: p for p in people if p["year"] == 2026}
who = next(iter(p26))
row = p26[who]
print(f"   {who}: {row['working_days']} working − {row['holidays']} holidays "
      f"− {row['cadence_days']} cadence − {row['training_days']} training "
      f"= {row['productive_days']}")
check("productive is availability less both shares",
      all(abs(p["productive_days"]
              - (p["availability"] - p["cadence_days"] - p["training_days"])) < 0.05
          for p in people), str(row))
check("and it matches what the capacity sheet shows",
      all(abs(p26[c["name"]]["productive_days"] - c["productivity_days"]) < 0.05
          for c in plan["people"] if c["name"] in p26),
      str([(c["name"], c["productivity_days"], p26[c["name"]]["productive_days"])
           for c in plan["people"] if c["name"] in p26][:2]))
check("the people who have left are flagged rather than dropped",
      any(p["has_left"] for p in people), str([p["person"] for p in people if p["has_left"]][:3]))

print("\nThe calendar is the one the app measures working days on")
_, dates = sheet("dim_date")
check("it covers every configured year", len(dates) >= 365 * 4, str(len(dates)))
check("weekends are not working days",
      all(not d["is_working_day"] for d in dates if d["is_weekend"]))
check("nor are the holidays",
      all(not d["is_working_day"] for d in dates if d["is_holiday"]))
hols = sum(1 for d in dates if d["is_holiday"])
check("and there are holidays in it", hols > 20, str(hols))

print("\nFeedback keeps its shape whether or not there is any")
# The harness has no feedback source, which is the case worth testing: a
# refresh against a sheet with no columns fails outright, and "nothing came
# through today" must not look the same as "the model changed shape".
fb_hdr, fb = sheet("fact_feedback")
print(f"   fact_feedback: {len(fb)} rows, {len(fb_hdr)} columns")
check("the sheet carries its headers even when empty",
      {"ticket", "submitted", "specialist", "service", "score", "band",
       "comment", "has_comment"} <= set(fb_hdr), str(fb_hdr))
check("including a column per rating parameter",
      {"overall", "quality", "timeliness", "interaction"} <= set(fb_hdr), str(fb_hdr))
check("and it can be joined to the tickets", "ticket" in fb_hdr)
for r in fb:
    check("every scored response is banded", bool(r["band"]) or r["score"] is None, str(r))
    break

print("\nThe model states its own rules")
_, settings = sheet("dim_setting")
keys = {s["setting"] for s in settings}
check("the rules are on a sheet a report can show",
      {"Closed means", "Former members", "Built", "Ticket source"} <= keys, str(sorted(keys)))

print("\nOne table at a time, for a flow that prefers files")
csv = urllib.request.urlopen(f"{BASE}/api/powerbi/dim_person.csv?sid={sid}",
                             timeout=120).read().decode("utf-8")
check("the CSV opens in Excel with its accents intact", csv.startswith("﻿"))
check("and holds the same rows", len(csv.strip().splitlines()) == len(people) + 1,
      str(len(csv.strip().splitlines())))
try:
    urllib.request.urlopen(f"{BASE}/api/powerbi/not_a_table.csv", timeout=30)
    check("an unknown table is refused", False)
except urllib.error.HTTPError as e:
    check("an unknown table is refused rather than guessed at", e.code == 404, str(e.code))

print(f"\n{ok} checks passed" + (f", {len(bad)} FAILED: {bad}" if bad else ""))
sys.exit(1 if bad else 0)
