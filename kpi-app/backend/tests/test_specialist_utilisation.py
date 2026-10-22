"""The By Specialist utility rate: a person's own hours over the days they had.

The sum is the one the team keeps by hand, and the fixture is their own worked
example:

    318 requests x 4 hours = 1272 hours
    1272 / 6 productive hours = 212 days
    212 / the working days that person had = the rate

The three things worth proving are that the arithmetic matches theirs to the
hour, that a cost which changed between years is applied by the year the ticket
was raised rather than today's figure, and that a person with no working-days
entry gets a dash rather than a percentage over a guessed denominator.

    python test_specialist_utilisation.py      # expects the app on :8822
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


def get(path):
    return json.loads(urllib.request.urlopen(f"{BASE}{path}").read())


def put(path, body):
    req = urllib.request.Request(f"{BASE}{path}", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"}, method="PUT")
    return json.loads(urllib.request.urlopen(req).read())


def tickets(n, who, service, year, start=0):
    return [{"Number": f"UT{start + i:06d}", "Short description": "r",
             "Requested by": f"U{i % 60}", "Assigned to": who,
             "Created": f"{year}-{(i % 12) + 1:02d}-10 09:00:00",
             "Closed": f"{year}-{(i % 12) + 1:02d}-20 17:00:00",
             "State": "Closed Completed", "Area": "EUR", "Team": "EEM",
             "Sub-Category": service} for i in range(n)]


def metrics(rows, **params):
    req = urllib.request.Request(f"{BASE}/api/upload-json",
                                 data=json.dumps({"rows": rows}).encode(),
                                 headers={"Content-Type": "application/json"})
    sid = json.loads(urllib.request.urlopen(req).read())["session_id"]
    q = urllib.parse.urlencode(params)
    return json.loads(urllib.request.urlopen(
        f"{BASE}/api/sessions/{sid}/user-metrics?{q}").read())


settings = get("/api/utilisation-settings")
print(f"A {settings['hours_per_day']}-hour day at {settings['productivity_pct']}% "
      f"= {settings['productive_hours_per_day']} productive hours")
check("six productive hours", settings["productive_hours_per_day"] == 6.0,
      str(settings["productive_hours_per_day"]))
check("WCM costs four hours in 2026",
      settings["hours_per_ticket_by_year"]["2026"]["Website Content Management"] == 4)

WHO = "Akshayaa Rajeswari AS"
YEAR = {"date_from": "2026-01-01", "date_to": "2026-12-31"}

print("\nTheir worked example, over a whole year")
m = metrics(tickets(318, WHO, "Website Content Management", 2026), **YEAR)
row = next(r for r in m["activity_groups"]["by_specialist"] if r["name"] == WHO)
print(f"   {row['requests']} requests · {row['hours_spent']} h · {row['days_spent']} days "
      f"· {row['available_days']} available · {row['utility_pct']}%")
check("318 requests", row["requests"] == 318, str(row["requests"]))
check("1272 hours, at four hours each", row["hours_spent"] == 1272.0,
      str(row["hours_spent"]))
check("212 days, at six hours a day", row["days_spent"] == 212.0, str(row["days_spent"]))
check("against that person's own 250 days", row["available_days"] == 250.0,
      str(row["available_days"]))
check("85%", row["utility_pct"] == 85, f"{row['utility_pct']}%")

print("\nA cost that changed is applied by the year the ticket was raised")
# The same 100 tickets, one year apart: 5 hours each in 2025, 4 in 2026.
a = metrics(tickets(100, WHO, "Website Content Management", 2025),
            date_from="2025-01-01", date_to="2025-12-31")
b = metrics(tickets(100, WHO, "Website Content Management", 2026), **YEAR)
h25 = next(r for r in a["activity_groups"]["by_specialist"] if r["name"] == WHO)["hours_spent"]
h26 = next(r for r in b["activity_groups"]["by_specialist"] if r["name"] == WHO)["hours_spent"]
print(f"   100 WCM tickets: {h25} h in 2025, {h26} h in 2026")
check("five hours each in 2025", h25 == 500.0, str(h25))
check("four hours each in 2026", h26 == 400.0, str(h26))

print("\nA shorter window takes its share of the year's days")
half = metrics(tickets(100, WHO, "Website Content Management", 2026),
               date_from="2026-01-01", date_to="2026-06-30")
hrow = next(r for r in half["activity_groups"]["by_specialist"] if r["name"] == WHO)
print(f"   six months of 2026: {hrow['available_days']} of 250 days")
check("about half the allowance", 110 < hrow["available_days"] < 135,
      str(hrow["available_days"]))

print("\nSomebody with no figure gets a dash, not a guess")
stranger = metrics(tickets(40, "Someone New", "Website Content Management", 2026), **YEAR)
srow = next(r for r in stranger["activity_groups"]["by_specialist"]
            if r["name"] == "Someone New")
check("hours are still counted", srow["hours_spent"] == 160.0, str(srow["hours_spent"]))
check("but there is no rate", srow["utility_pct"] is None, str(srow["utility_pct"]))
check("and no invented denominator", srow["available_days"] is None,
      str(srow["available_days"]))

print("\nThe settings are editable, and the figures follow")
before = get("/api/utilisation-settings")
try:
    put("/api/utilisation-settings", {
        **before,
        "working_days": {**before["working_days"],
                         "2026": {**before["working_days"]["2026"], WHO: 222}},
    })
    again = metrics(tickets(318, WHO, "Website Content Management", 2026), **YEAR)
    r2 = next(r for r in again["activity_groups"]["by_specialist"] if r["name"] == WHO)
    print(f"   with 222 days: {r2['utility_pct']}%")
    # 212 / 222 = 95.5%, which is the figure on their spreadsheet.
    check("212 over 222 days reads 95%", r2["utility_pct"] == 95, f"{r2['utility_pct']}%")
finally:
    put("/api/utilisation-settings", before)

restored = metrics(tickets(318, WHO, "Website Content Management", 2026), **YEAR)
r3 = next(r for r in restored["activity_groups"]["by_specialist"] if r["name"] == WHO)
check("and the page follows the panel back", r3["utility_pct"] == 85,
      f"{r3['utility_pct']}%")

print(f"\n{ok} checks passed")
