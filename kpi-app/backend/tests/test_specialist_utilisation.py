"""By Specialist and the Capacity tab are one sum, run twice.

    allocated  = each finished ticket priced at its column's rate for the year
                 it closed in, in days of eight hours
    productive = working days, less holidays, less the cadence share, less
                 training
    utility    = allocated / productive

The thing most worth proving is the last check in this file: the two pages,
asked about the same person over the same window, return the same number. The
rest is the arithmetic behind it — the rate for the right year, the team
owning its own work, a rejected ticket still costing what it cost, and a dash
rather than a percentage when nobody has said how many days that person had.

    python test_specialist_utilisation.py      # expects the app on :8822
"""
import json
import urllib.parse
import urllib.request

BASE = "http://127.0.0.1:8822"
WHO = "Akshayaa Rajeswari AS"
YEAR = {"date_from": "2026-01-01", "date_to": "2026-12-31"}
WCM = "Website Content Management"
ok = 0


def check(name, cond, detail=""):
    global ok
    print(f"  {'PASS' if cond else 'FAIL'}  {name}" + (f"  — {detail}" if detail else ""))
    assert cond, name
    ok += 1


def get(path):
    return json.loads(urllib.request.urlopen(f"{BASE}{path}").read())


def put(path, body):
    req = urllib.request.Request(f"{BASE}{path}", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"}, method="PUT")
    return json.loads(urllib.request.urlopen(req).read())


def tickets(n, who, service, year, start=0, state="Closed Completed", team="EEM"):
    closed = state != "Work in progress"
    return [{"Number": f"UT{start + i:06d}", "Short description": "r",
             "Requested by": f"U{i % 60}", "Assigned to": who,
             "Created": f"{year}-{(i % 12) + 1:02d}-10 09:00:00",
             "Closed": f"{year}-{(i % 12) + 1:02d}-20 17:00:00" if closed else None,
             "State": state, "Area": "EUR", "Team": team,
             "Sub-Category": service} for i in range(n)]


def upload(rows):
    req = urllib.request.Request(f"{BASE}/api/upload-json",
                                 data=json.dumps({"rows": rows}).encode(),
                                 headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req).read())["session_id"]


def specialist(rows, who=WHO, **params):
    sid = upload(rows)
    m = json.loads(urllib.request.urlopen(
        f"{BASE}/api/sessions/{sid}/user-metrics?{urllib.parse.urlencode(params)}").read())
    row = next((r for r in m["activity_groups"]["by_specialist"] if r["name"] == who), None)
    return sid, row


plan = get("/api/capacity-plan/settings?year=2026")
print(f"2026: cadence {plan['cadence_pct']}%, training {plan['training_pct']}%, "
      f"WCM at {plan['hours']['WCM']} hours")
check("one rate table drives it, the capacity plan's", plan["hours"]["WCM"] == 4.6,
      str(plan["hours"]["WCM"]))

print("\nA whole year, from working days down to the rate")
# 250 working − 30 holidays = 220 available; − 44 cadence − 23 training = 153.
# 318 tickets at 4.6 hours = 1462.8 hours = 182.8 days of eight.
sid, row = specialist(tickets(318, WHO, WCM, 2026), **YEAR)
print(f"   {row['requests']} requests · {row['basis_working_days']} working "
      f"− {row['basis_holidays']} holidays − {row['basis_cadence_days']} cadence "
      f"− {row['basis_training_days']} training = {row['available_days']} productive "
      f"· {row['days_spent']} allocated · {row['utility_pct']}%")
check("318 requests", row["requests"] == 318, str(row["requests"]))
check("priced at the capacity rate, not a second one",
      row["days_spent"] == 182.8, str(row["days_spent"]))
check("a day is eight hours here, the shares having taken their cut already",
      row["hours_per_day"] == 8, str(row["hours_per_day"]))
check("the denominator is availability less cadence less training",
      row["available_days"] == 153.0, str(row["available_days"]))
check("which is the working days less holidays, less both shares",
      round(row["basis_working_days"] - row["basis_holidays"] - row["basis_cadence_days"]
            - row["basis_training_days"], 1) == row["available_days"],
      f"{row['basis_working_days']} − {row['basis_holidays']} − {row['basis_cadence_days']} "
      f"− {row['basis_training_days']}")
check("119%", row["utility_pct"] == 119, f"{row['utility_pct']}%")

print("\nThe Capacity tab, asked the same question, answers the same")
cap = json.loads(urllib.request.urlopen(
    f"{BASE}/api/sessions/{sid}/capacity-plan?year=2026"
    f"&date_from={YEAR['date_from']}&date_to={YEAR['date_to']}").read())
p = next(r for r in cap["people"] if r["name"] == WHO)
print(f"   capacity: {p['allocated_days']} of {p['productivity_days']} = {p['utility_pct']}%")
check("the same allocated days", p["allocated_days"] == row["days_spent"],
      f"{p['allocated_days']} vs {row['days_spent']}")
check("the same productive days", p["productivity_days"] == row["available_days"],
      f"{p['productivity_days']} vs {row['available_days']}")
check("and so the same rate", p["utility_pct"] == row["utility_pct"],
      f"{p['utility_pct']}% vs {row['utility_pct']}%")

print("\nA rate that changed is applied by the year the ticket closed in")
_, a = specialist(tickets(100, WHO, WCM, 2025), date_from="2025-01-01", date_to="2025-12-31")
_, b = specialist(tickets(100, WHO, WCM, 2026), **YEAR)
print(f"   100 WCM: {a['days_spent']} days in 2025 at 5.0h, "
      f"{b['days_spent']} in 2026 at 4.6h")
check("five hours each in 2025", a["days_spent"] == 62.5, str(a["days_spent"]))
check("four and a bit in 2026", b["days_spent"] == 57.5, str(b["days_spent"]))

print("\nPWR and KDB keep their own work, whatever it is filed as")
# The same sub-category, raised by the PWR team. It is their ticket.
_, pwr = specialist(tickets(40, WHO, WCM, 2026, team="PWR"), **YEAR)
print(f"   40 WCM-shaped tickets on team PWR → {pwr['by_service']}")
check("none of it lands in WCM", pwr["by_service"]["WCM"] == 0.0,
      str(pwr["by_service"]["WCM"]))
check("all of it lands in PWR/KDB", pwr["by_service"]["PWR/KDB"] > 0,
      str(pwr["by_service"]["PWR/KDB"]))
check("and it is still priced", pwr["days_spent"] == pwr["by_service"]["PWR/KDB"],
      str(pwr["days_spent"]))

print("\nClosed means finished either way")
mixed = (tickets(10, WHO, WCM, 2026)
         + tickets(10, WHO, WCM, 2026, start=400, state="Closed Rejected")
         + tickets(10, WHO, WCM, 2026, start=800, state="Work in progress"))
_, mrow = specialist(mixed, **YEAR)
print(f"   {mrow['requests']} raised, {mrow['priced_tickets']} priced, "
      f"{mrow['days_spent']} days")
check("every request is still counted as a request", mrow["requests"] == 30,
      str(mrow["requests"]))
check("a rejected ticket cost what it cost", mrow["priced_tickets"] == 20,
      str(mrow["priced_tickets"]))
check("work in progress is not priced", mrow["days_spent"] == 11.5,
      str(mrow["days_spent"]))
check("and the states are declared",
      mrow["counted_states"] == ["Closed Completed", "Closed Rejected"],
      str(mrow["counted_states"]))

print("\nA shorter window takes its share of the year")
_, half = specialist(tickets(100, WHO, WCM, 2026),
                     date_from="2026-01-01", date_to="2026-06-30")
print(f"   six months: {half['available_days']} productive of 153")
check("about half the year's productive days", 68 < half["available_days"] < 84,
      str(half["available_days"]))

print("\nSomebody with no figure gets a dash, not a guess")
_, srow = specialist(tickets(40, "Someone New", WCM, 2026), who="Someone New", **YEAR)
check("the days are still counted", srow["days_spent"] == 23.0, str(srow["days_spent"]))
check("but there is no rate", srow["utility_pct"] is None, str(srow["utility_pct"]))
check("and no invented denominator", srow["available_days"] is None,
      str(srow["available_days"]))

print("\nA specialist with nothing finished reads nought, not a dash")
_, orow = specialist(tickets(40, "Ajith A", WCM, 2026, start=1800,
                             state="Work in progress"), who="Ajith A", **YEAR)
print(f"   {orow['requests']} raised, {orow['priced_tickets']} priced, "
      f"rate {orow['utility_pct']}")
check("the requests are there", orow["requests"] == 40, str(orow["requests"]))
check("nothing is priced", orow["priced_tickets"] == 0, str(orow["priced_tickets"]))
check("and the rate reads nought", orow["utility_pct"] == 0, str(orow["utility_pct"]))

print("\nThe settings are editable, and both pages follow")
before = get("/api/utilisation-settings")
try:
    put("/api/utilisation-settings", {
        **before,
        "working_days": {**before["working_days"],
                         "2026": {**before["working_days"]["2026"], WHO: 200}},
    })
    sid2, r2 = specialist(tickets(318, WHO, WCM, 2026), **YEAR)
    cap2 = json.loads(urllib.request.urlopen(
        f"{BASE}/api/sessions/{sid2}/capacity-plan?year=2026"
        f"&date_from={YEAR['date_from']}&date_to={YEAR['date_to']}").read())
    p2 = next(r for r in cap2["people"] if r["name"] == WHO)
    print(f"   with 200 working days: {r2['available_days']} productive, "
          f"{r2['utility_pct']}%")
    check("the new figure is used", r2["basis_working_days"] == 200, str(r2["basis_working_days"]))
    check("the rate moves with it", r2["utility_pct"] != row["utility_pct"],
          f"{row['utility_pct']}% → {r2['utility_pct']}%")
    check("and the two pages move together", p2["utility_pct"] == r2["utility_pct"],
          f"{p2['utility_pct']}% vs {r2['utility_pct']}%")
finally:
    put("/api/utilisation-settings", before)

_, r3 = specialist(tickets(318, WHO, WCM, 2026), **YEAR)
check("and both go back", r3["utility_pct"] == 119, f"{r3['utility_pct']}%")

print(f"\n{ok} checks passed")
