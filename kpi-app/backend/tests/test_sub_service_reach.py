"""Demand Engagement Activations, read one service at a time.

The roll-up's reach is the union of its three children's, and a union cannot
show which of the three nobody has taken up. The fixture is built so the parent
looks fully adopted while one child inside it has never been asked for at all —
if the children were measured off the parent, that would be invisible.

    python test_sub_service_reach.py       # expects the app on 127.0.0.1:8822
"""
import json
import urllib.request

BASE = "http://127.0.0.1:8822"
ok = 0


def check(name, cond, detail=""):
    global ok
    print(f"  {'PASS' if cond else 'FAIL'}  {name}" + (f"  — {detail}" if detail else ""))
    assert cond, name
    ok += 1


def ticket(n, service, who, team, area="EUR"):
    return {"Number": f"SS{n:06d}", "Short description": "r", "Requested by": who,
            "Assigned to": "Ajith A", "Created": "2026-09-01 09:00:00",
            "Closed": "2026-09-04 17:00:00", "State": "Closed Completed",
            "Area": area, "Team": team, "Sub-Category": service}


rows = []
n = 0
# Every user and every frontline asks for Email – Local, so the DEA roll-up
# reads 100% on both counts.
for fl, people in {"EEM": ["A1", "A2", "A3"], "GIN": ["B1", "B2"]}.items():
    for who in people:
        n += 1
        rows.append(ticket(n, "Email – Local", who, fl))
# One EEM user also uses Demand Creation. Nobody, anywhere, uses Retention.
n += 1
rows.append(ticket(n, "Demand Creation – Global", "A1", "EEM"))
# A second service so the board is not a single column.
for who in ["A1", "B1"]:
    n += 1
    rows.append(ticket(n, "Website Content Management", who, "EEM" if who == "A1" else "GIN"))

req = urllib.request.Request(f"{BASE}/api/upload-json",
                             data=json.dumps({"rows": rows}).encode(),
                             headers={"Content-Type": "application/json"})
sid = json.loads(urllib.request.urlopen(req).read())["session_id"]
m = json.loads(urllib.request.urlopen(f"{BASE}/api/sessions/{sid}/user-metrics").read())

board = {r["short"]: r for r in m["service_utility"]}
dea = board["DEA"]
kids = {k["service"]: k for k in dea["sub_services"]}

print("The roll-up looks fully adopted")
print(f"   DEA: {dea['users']['used']}/{dea['users']['total']} users, "
      f"{dea['frontlines']['used']}/{dea['frontlines']['total']} frontlines")
check("every user has used something inside DEA", dea["users"]["rate_pct"] == 100,
      f"{dea['users']['rate_pct']}%")
check("and every frontline has", dea["frontlines"]["rate_pct"] == 100,
      f"{dea['frontlines']['rate_pct']}%")

print("\nIts three children are measured on their own")
check("all three are listed", len(kids) == 3, str(sorted(kids)))
for name, k in sorted(kids.items()):
    print(f"   {name}: users {k['users']['used']}/{k['users']['total']} "
          f"({k['users']['rate_pct']}%), frontlines {k['frontlines']['used']}/"
          f"{k['frontlines']['total']} ({k['frontlines']['rate_pct']}%), "
          f"{k['requests']} requests")

email = kids["Email – Local"]
demand = kids["Demand Creation – Global"]
retention = kids["Retention – Activations"]

check("Email reaches everyone, like the parent", email["users"]["rate_pct"] == 100,
      f"{email['users']['rate_pct']}%")
check("Demand Creation reaches one user in five", demand["users"]["used"] == 1,
      f"{demand['users']['used']} of {demand['users']['total']}")
# The adoption bar applies to a child exactly as it does to a parent: one
# person raising one ticket is a trial, not a frontline taking a service up.
# EEM therefore counts as neither a user nor a stranger — it is listed apart.
check("but no frontline has taken it up on one ticket from one person",
      demand["frontlines"]["used"] == 0,
      f"{demand['frontlines']['used']} of {demand['frontlines']['total']}")
check("EEM is listed as below the bar, not as never having asked",
      [f["frontline"] for f in demand["frontlines"]["below_threshold"]] == ["EEM"]
      and "EEM" not in [f["frontline"] for f in demand["frontlines"]["not_used"]],
      str(demand["frontlines"]["below_threshold"]))
check("Retention is the one nobody takes up", retention["users"]["used"] == 0
      and retention["frontlines"]["used"] == 0,
      f"{retention['users']['used']} users, {retention['frontlines']['used']} frontlines")
check("which the roll-up's 100% could never have shown",
      dea["users"]["rate_pct"] == 100 and retention["users"]["rate_pct"] == 0)

print("\nThe denominators are the same ones the parent uses")
check("same user base", all(k["users"]["total"] == dea["users"]["total"] for k in kids.values()),
      str([k["users"]["total"] for k in kids.values()]))
check("same frontline base",
      all(k["frontlines"]["total"] == dea["frontlines"]["total"] for k in kids.values()),
      str([k["frontlines"]["total"] for k in kids.values()]))

print("\nAnd each child names the people who have never asked for it")
check("Retention lists all five", len(retention["users"]["not_used"]) == 5,
      str(len(retention["users"]["not_used"])))
check("Email lists nobody", retention["users"]["not_used"] and not email["users"]["not_used"])

print("\nThe parent's own figures are untouched by the split")
check("DEA still counts every request inside it",
      dea["requests"] == sum(k["requests"] for k in kids.values()),
      f"{dea['requests']} vs {sum(k['requests'] for k in kids.values())}")
check("services with no children carry an empty list",
      board["WCM"]["sub_services"] == [], str(board["WCM"]["sub_services"]))

print("\nThe SLA columns are gone from the payload")
check("no sla block on a service row", "sla" not in dea and "sla_target_wd" not in dea,
      str([k for k in dea if "sla" in k]))
spec = m["activity_groups"]["by_specialist"][0]
check("none on a specialist row either",
      not [k for k in spec if k.startswith("sla_")], str([k for k in spec if "sla" in k]))
check("the calendar median is back", "median_days_to_close" in spec,
      str(spec["median_days_to_close"]))

print(f"\n{ok} checks passed")
