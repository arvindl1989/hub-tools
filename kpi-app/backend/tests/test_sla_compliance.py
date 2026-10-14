"""SLA compliance: what was met, what is already late, and how long work takes.

The case that matters most is the open ticket. A ticket that blew its target
three months ago and has never been closed is the worst outcome the SLA has,
and judging only closed work would let it hide by staying open.
"""
import json
import sys
import urllib.parse
import urllib.request

BASE = "http://127.0.0.1:8822"
WINDOW = {"date_from": "2026-06-01", "date_to": "2026-06-30"}

# WCM has a 10 working-day target; Email – Local has 7.
rows = [
    # Created Mon 1 June, closed Fri 12 June = 9 working days: met (<= 10).
    {"Number": "S1", "Created": "2026-06-01 09:00:00", "Closed": "2026-06-12 17:00:00",
     "Sub-Category": "Website Content Management", "State": "Closed Completed"},
    # Created Mon 1 June, closed Tue 16 June = 11 working days: missed.
    {"Number": "S2", "Created": "2026-06-01 09:00:00", "Closed": "2026-06-16 17:00:00",
     "Sub-Category": "Website Content Management", "State": "Closed Completed"},
    # Same day: 0 working days, met.
    {"Number": "S3", "Created": "2026-06-02 09:00:00", "Closed": "2026-06-02 17:00:00",
     "Sub-Category": "Website Content Management", "State": "Closed Completed"},
    # Email – Local, 5 working days against a 7-day target: met.
    {"Number": "S4", "Created": "2026-06-01 09:00:00", "Closed": "2026-06-08 17:00:00",
     "Sub-Category": "Email – Local", "State": "Closed Completed"},
    # Email – Local, 10 working days against 7: missed.
    {"Number": "S5", "Created": "2026-06-01 09:00:00", "Closed": "2026-06-15 17:00:00",
     "Sub-Category": "Email – Local", "State": "Closed Completed"},
    # Open since 1 June: by 30 June that is well past WCM's 10 days.
    {"Number": "S6", "Created": "2026-06-01 09:00:00", "Closed": None,
     "Sub-Category": "Website Content Management", "State": "Work in progress"},
    # Open since 26 June: only a few working days old by the 30th, still within.
    {"Number": "S7", "Created": "2026-06-26 09:00:00", "Closed": None,
     "Sub-Category": "Website Content Management", "State": "Assigned"},
]
for i, r in enumerate(rows):
    r.update({"Short description": "r", "Requested by": f"U{i}", "Assigned to": "Ajith A",
              "Area": "EUR", "Team": "EEM"})

req = urllib.request.Request(f"{BASE}/api/upload-json",
                             data=json.dumps({"rows": rows}).encode(),
                             headers={"Content-Type": "application/json"})
sid = json.loads(urllib.request.urlopen(req).read())["session_id"]
m = json.loads(urllib.request.urlopen(
    f"{BASE}/api/sessions/{sid}/user-metrics?{urllib.parse.urlencode(WINDOW)}").read())

ok = 0


def check(name, cond, detail=""):
    global ok
    print(f"  {'PASS' if cond else 'FAIL'}  {name}" + (f"  — {detail}" if detail else ""))
    assert cond, name
    ok += 1


su = {r["short"]: r for r in m["service_utility"]}

print("WCM — target 10 working days")
wcm = su["WCM"]["sla"]
print(f"  closed {wcm['closed']}, met {wcm['met']}, open breached {wcm['open_breached']}, "
      f"open within {wcm['open_within']}, median {wcm['median_working_days']} wd")
check("three closed", wcm["closed"] == 3, str(wcm["closed"]))
check("two met", wcm["met"] == 2, str(wcm["met"]))
check("one open ticket is already breached", wcm["open_breached"] == 1,
      str(wcm["open_breached"]))
check("the recent open one is not", wcm["open_within"] == 1, str(wcm["open_within"]))
check("target carried for the tooltip", su["WCM"]["sla_target_wd"] == 10)

print("\nEmail – Local — target 7, inside DEA")
dea = su["DEA"]
kids = {k["short"]: k for k in dea["sub_services"]}
print("  sub-services:", {k: (v["sla"]["closed"], v["sla"]["met"], v["sla_target_wd"])
                          for k, v in kids.items()})
check("the children are listed", set(kids) >= {"Email", "Demand", "Retention"}, str(set(kids)))
check("Email's target is 7 not the parent's 14", kids["Email"]["sla_target_wd"] == 7)
check("one of its two met", kids["Email"]["sla"]["met"] == 1,
      str(kids["Email"]["sla"]["met"]))

print("\nMedians are in working days, with calendar days kept alongside")
check("working-day median present", wcm["median_working_days"] is not None)
check("calendar median present and larger", wcm["median_calendar_days"]
      >= wcm["median_working_days"],
      f"{wcm['median_working_days']} wd vs {wcm['median_calendar_days']} cd")

print("\nSmall groups show a count, not a percentage")
check("three closed is below the floor of five", wcm["show_pct"] is False,
      f"closed {wcm['closed']}, show_pct {wcm['show_pct']}")

print("\nThe specialist board carries the same record")
spec = m["activity_groups"]["by_specialist"][0]
print(f"  {spec['name']}: closed {spec['sla_closed']}, met {spec['sla_met']}, "
      f"breached open {spec['sla_open_breached']}, median {spec['sla_median_working_days']} wd")
check("specialist SLA present", spec["sla_closed"] == 5, str(spec["sla_closed"]))
check("specialist breaches counted", spec["sla_open_breached"] == 1,
      str(spec["sla_open_breached"]))

print(f"\n{ok} checks passed")
