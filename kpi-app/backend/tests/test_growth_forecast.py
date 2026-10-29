"""Growth, the projection, and whether next year fits.

The case that matters is the part-finished base year. The export stops at the
last sync, so the current year almost never has twelve months in it, and
"last year plus ten percent" from a nine-month year quietly plans for nine
months of work. Any month the base year has not reached is carried from the
most recent year that has it.

    python test_growth_forecast.py        # expects the app on :8822
"""
import json
import urllib.parse
import urllib.request

BASE = "http://127.0.0.1:8822"
ok = 0


def check(name, cond, detail=""):
    global ok
    print(f"  {'PASS' if cond else 'FAIL'}  {name}" + (f"  — {detail}" if detail else ""))
    assert cond, name
    ok += 1


def ticket(n, year, month, service, who="Ajith A"):
    return {"Number": f"GF{n:06d}", "Short description": "r", "Requested by": f"U{n % 9}",
            "Assigned to": who, "Created": f"{year}-{month:02d}-10 09:00:00",
            "Closed": f"{year}-{month:02d}-20 17:00:00", "State": "Closed Completed",
            "Area": "EUR", "Team": "EEM", "Sub-Category": service}


def forecast(rows, **params):
    req = urllib.request.Request(f"{BASE}/api/upload-json",
                                 data=json.dumps({"rows": rows}).encode(),
                                 headers={"Content-Type": "application/json"})
    sid = json.loads(urllib.request.urlopen(req).read())["session_id"]
    q = urllib.parse.urlencode(params)
    return json.loads(urllib.request.urlopen(
        f"{BASE}/api/sessions/{sid}/growth-forecast?{q}").read())


WCM = "Website Content Management"

# ── A clean three years, ten tickets every month of every year ───────────────
rows, n = [], 0
for year in (2024, 2025, 2026):
    for month in range(1, 13):
        for _ in range(10):
            n += 1
            rows.append(ticket(n, year, month, WCM))

print("Three complete years, ten a month")
d = forecast(rows, growth=10)
print(f"   years {d['years']}  totals {d['year_totals']}")
check("three years on the axis", d["years"] == [2024, 2025, 2026], str(d["years"]))
check("120 a year", d["year_totals"]["2026"] == 120, str(d["year_totals"]["2026"]))
check("the base year is complete", d["base_year_complete"] is True)
check("nothing carried", d["months_carried"] == 0, str(d["months_carried"]))
check("2027 is 2026 plus a tenth", d["year_totals"]["projected"] == 132,
      str(d["year_totals"]["projected"]))
check("every month projects 11", all(m["projected"] == 11 for m in d["monthly"]),
      str([m["projected"] for m in d["monthly"]][:4]))
check("the assumption is labelled as one",
      d["yoy"][-1]["assumed"] is True and d["yoy"][-1]["pct"] == 10, str(d["yoy"][-1]))
check("and the history is not", all(not y.get("assumed") for y in d["yoy"][:-1]))

print("\nFlat means flat")
flat = forecast(rows, growth=0)
check("no growth, no change", flat["year_totals"]["projected"] == 120,
      str(flat["year_totals"]["projected"]))

# ── The real shape: the base year stops in September ─────────────────────────
part, n = [], 0
for year in (2024, 2025):
    for month in range(1, 13):
        for _ in range(10):
            n += 1
            part.append(ticket(n, year, month, WCM))
for month in range(1, 10):               # 2026 reaches September only
    for _ in range(10):
        n += 1
        part.append(ticket(n, 2026, month, WCM))

print("\nA base year that stops in September")
d2 = forecast(part, growth=10)
print(f"   2026 has {d2['year_totals']['2026']} requests over 9 months; "
      f"2027 projects {d2['year_totals']['projected']}")
check("the year is known to be part-finished", d2["base_year_complete"] is False)
check("three months are carried", d2["months_carried"] == 3, str(d2["months_carried"]))
oct_row = next(m for m in d2["monthly"] if m["month"] == "Oct")
print(f"   Oct: 2025 had {oct_row['2025']}, 2026 has {oct_row['2026']}, "
      f"projected {oct_row['projected']} from {oct_row['from_year']}")
check("October comes from 2025", oct_row["from_year"] == 2025, str(oct_row["from_year"]))
# Two years of growth on ten: 10 x 1.1 x 1.1 = 12.1 → 12.
check("and is grown twice", oct_row["projected"] == 12, str(oct_row["projected"]))
check("September still comes from the base year",
      next(m for m in d2["monthly"] if m["month"] == "Sep")["from_year"] == 2026)
# A whole year projected, not three quarters of one: 9 months at 11 + 3 at 12.
check("the year is a whole year", d2["year_totals"]["projected"] == 9 * 11 + 3 * 12,
      str(d2["year_totals"]["projected"]))
check("which is more than the part-year would have given",
      d2["year_totals"]["projected"] > d2["year_totals"]["2026"] * 1.1,
      f"{d2['year_totals']['projected']} vs {round(d2['year_totals']['2026'] * 1.1)}")

print("\nThe hours follow the same rule")
svc = next(r for r in d2["by_service"] if r["short"] == "WCM")
# 135 projected tickets at the 2027 rate, which falls back to 2026's 4 hours.
print(f"   {svc['projected']} tickets → {svc['demand_hours']} h, "
      f"{svc['capacity_hours']} h available = {svc['ratio_pct']}% {svc['verdict']}")
# Four hours each: 2027 has no rate of its own, so it carries 2026's rather
# than reverting to the older base of five. The displayed ticket count is
# rounded and the hours are not, so this is within one ticket's worth.
check("priced at the most recent agreed rate, carried forward",
      abs(svc["demand_hours"] - svc["projected"] * 4) <= 4,
      f"{svc['demand_hours']} h over {svc['projected']} tickets "
      f"= {round(svc['demand_hours'] / svc['projected'], 2)} h each")
check("a verdict is reached", svc["verdict"] in
      ("overloaded", "appropriate", "under-utilised"), svc["verdict"])

print("\nSeasonality is measured on the base year")
peak = max(d["seasonality"], key=lambda m: m["index"])
check("an even year has no hot month", peak["index"] == 100, str(peak["index"]))

print("\nThe capacity verdict names its own bands")
cap = d2["capacity"]
print(f"   {cap['total_demand_hours']} h needed, {cap['total_capacity_hours']} h "
      f"available = {cap['ratio_pct']}% {cap['verdict']}")
check("bands are declared", cap["bands"] == {"overloaded": 105, "under_used": 85},
      str(cap["bands"]))
check("a shortfall converts to people", isinstance(cap["people_needed"], (int, float)))
check("and the assumption about missing years is reported",
      "assumed_from_base" in cap and "people_without_days" in cap)

print(f"\n{ok} checks passed")
