"""Capacity utilisation: estimated hours out of the door over hours available.

The two things worth proving are that it is not capped — the brief's 10 working
days and 100 estimated hours must read 125%, not 100% — and that "delivered"
means closed inside the window rather than created inside it. A ticket raised
in March and finished in September is September's delivery, and getting that
wrong would credit the hours to the wrong month.
"""
import json
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timedelta

BASE = "http://127.0.0.1:8822"

# 10 working days: Mon 1 June 2026 to Fri 12 June, no holidays in between.
WINDOW = {"date_from": "2026-06-01", "date_to": "2026-06-12"}
# 5 WCM (5 h) + 3 Demand Creation (20 h) + 1 Email (7.27 h) + 1 Retention (20 h)
#   = 25 + 60 + 7.27 + 20 = 112.27 h, and 80 h available.
PLAN = [("Website Content Management", 5), ("Demand Creation – Global", 3),
        ("Email – Local", 1), ("Retention – Activations", 1)]

rows = []
i = 0
for service, count in PLAN:
    for n in range(count):
        i += 1
        rows.append({
            "Number": f"PC5{i:05d}", "Short description": "r",
            "Requested by": f"User {i % 4}", "Assigned to": "Ajith A",
            # Created well before the window; closed inside it.
            "Created": "2026-03-02 10:00:00",
            "Closed": f"2026-06-{(n % 10) + 2:02d} 15:00:00",
            "State": "Closed Completed", "Area": "EUR", "Team": "EEM",
            "Sub-Category": service,
        })

# Created inside the window but still open: must NOT count as delivered.
rows.append({"Number": "PC599999", "Short description": "r", "Requested by": "User 9",
             "Assigned to": "Ajith A", "Created": "2026-06-03 09:00:00", "Closed": None,
             "State": "Work in progress", "Area": "EUR", "Team": "EEM",
             "Sub-Category": "Demand Creation – Global"})
# Closed long after the window: also not this window's delivery.
rows.append({"Number": "PC599998", "Short description": "r", "Requested by": "User 8",
             "Assigned to": "Ajith A", "Created": "2026-06-04 09:00:00",
             "Closed": "2026-08-20 09:00:00", "State": "Closed Completed",
             "Area": "EUR", "Team": "EEM", "Sub-Category": "Retention – Activations"})
# A second specialist who closed nothing.
rows.append({"Number": "PC599997", "Short description": "r", "Requested by": "User 7",
             "Assigned to": "Jerlin Jeba", "Created": "2026-06-05 09:00:00", "Closed": None,
             "State": "Assigned", "Area": "EUR", "Team": "EEM",
             "Sub-Category": "Website Content Management"})

req = urllib.request.Request(f"{BASE}/api/upload-json",
                             data=json.dumps({"rows": rows}).encode(),
                             headers={"Content-Type": "application/json"})
sid = json.loads(urllib.request.urlopen(req).read())["session_id"]
q = urllib.parse.urlencode(WINDOW)
m = json.loads(urllib.request.urlopen(
    f"{BASE}/api/sessions/{sid}/user-metrics?{q}").read())

ok = 0


def check(name, cond, detail=""):
    global ok
    print(f"  {'PASS' if cond else 'FAIL'}  {name}" + (f"  — {detail}" if detail else ""))
    assert cond, name
    ok += 1


spec = {r["name"]: r for r in m["activity_groups"]["by_specialist"]}
a = spec["Ajith A"]

print("1 June to 12 June 2026 — ten working days")
check("working days counted", a["working_days"] == 10, str(a["working_days"]))
check("available hours are days x 8", a["available_hours"] == 80.0, str(a["available_hours"]))

print("\nDelivery is what closed inside the window")
check("ten tickets closed in the window", a["delivered_tickets"] == 10,
      str(a["delivered_tickets"]))
check("the open one is excluded",
      a["delivered_tickets"] == 10 and a["requests"] >= 1)
check("hours are the sub-service rates summed",
      round(a["delivered_hours"]) == 112, f"{a['delivered_hours']} h")

print("\nUtilisation is not capped")
check("over 100% shows as it is", a["capacity_pct"] == 140,
      f"{a['capacity_pct']}%  (112.27 of 80 hours)")

print("\nA specialist who closed nothing")
j = spec.get("Jerlin Jeba")
check("is present", j is not None)
check("with zero delivered", j and j["delivered_hours"] == 0, str(j["delivered_hours"] if j else ""))
check("and 0% utilisation", j and j["capacity_pct"] == 0, f"{j['capacity_pct']}%" if j else "")

print("\nThe brief's case: 100 estimated hours over 10 working days = 125%")
# 5 Demand Creation tickets = 100 h exactly.
only = [{"Number": f"PC6{n:05d}", "Short description": "r", "Requested by": "U",
         "Assigned to": "Solo", "Created": "2026-03-02 10:00:00",
         "Closed": f"2026-06-{n + 2:02d} 15:00:00", "State": "Closed Completed",
         "Area": "EUR", "Team": "EEM", "Sub-Category": "Demand Creation – Global"}
        for n in range(5)]
# The page needs something raised in the window to have a window at all — an
# endpoint with nothing created returns its empty state. This one stays open,
# so it adds nothing to the hours delivered.
only.append({"Number": "PC699999", "Short description": "r", "Requested by": "U",
             "Assigned to": "Solo", "Created": "2026-06-03 09:00:00", "Closed": None,
             "State": "Assigned", "Area": "EUR", "Team": "EEM",
             "Sub-Category": "Website Content Management"})
req = urllib.request.Request(f"{BASE}/api/upload-json",
                             data=json.dumps({"rows": only}).encode(),
                             headers={"Content-Type": "application/json"})
sid2 = json.loads(urllib.request.urlopen(req).read())["session_id"]
m2 = json.loads(urllib.request.urlopen(
    f"{BASE}/api/sessions/{sid2}/user-metrics?{q}").read())
solo = next(r for r in m2["activity_groups"]["by_specialist"] if r["name"] == "Solo")
check("100 hours over 80 available", solo["delivered_hours"] == 100.0,
      f"{solo['delivered_hours']} h of {solo['available_hours']} h")
check("reads 125%", solo["capacity_pct"] == 125, f"{solo['capacity_pct']}%")

print("\nThe column is not called Utility")
check("breadth is absent from specialist rows", a["utility_pct"] is None)

print(f"\n{ok} checks passed")
