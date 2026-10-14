"""The seven cases named in the brief, each one the shape of a bug that was there.

Run against a live instance:  python run_all.py
The server is the real app with the real endpoints; only the storage and the
ticket source are stubbed, so what passes here is what the page will do.
"""
import json
import math
import sys
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import datetime, timedelta

BASE = "http://127.0.0.1:8822"
TODAY = datetime(2026, 9, 25)
SERVICES = ["Website Content Management", "Demand Creation – Global",
            "Content Production – Graphic Design"]


def upload(rows):
    req = urllib.request.Request(f"{BASE}/api/upload-json",
                                 data=json.dumps({"rows": rows}).encode(),
                                 headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req).read())["session_id"]


def metrics(sid, **p):
    q = urllib.parse.urlencode({k: v for k, v in p.items() if v})
    return json.loads(urllib.request.urlopen(
        f"{BASE}/api/sessions/{sid}/user-metrics{'?' + q if q else ''}").read())


def user_list(sid, **p):
    q = urllib.parse.urlencode({k: v for k, v in p.items() if v})
    return json.loads(urllib.request.urlopen(
        f"{BASE}/api/sessions/{sid}/user-activity{'?' + q if q else ''}").read())


def ticket(i, who, age, service=None, area="EUR", team="EEM", n=0):
    created = TODAY - timedelta(days=age)
    return {
        "Number": f"PC{i:06d}{n}", "Short description": "request",
        "Requested by": who, "Assigned to": "Ajith A",
        "Created": created.strftime("%Y-%m-%d %H:%M:%S"),
        "Closed": (created + timedelta(days=4)).strftime("%Y-%m-%d %H:%M:%S"),
        "State": "Closed Completed", "Area": area, "Team": team,
        "Sub-Category": service or SERVICES[i % 3],
    }


# A spread of ages and services, with a one-person frontline and a hub function.
ROWS = []
PEOPLE = [("Ann", 2), ("Ben", 8), ("Cara", 25), ("Dan", 44), ("Eve", 75),
          ("Finn", 120), ("Gus", 200), ("Hana", 330)]
for i, (who, age) in enumerate(PEOPLE):
    for n, svc in enumerate(SERVICES[: 1 + (i % 3)]):
        ROWS.append(ticket(i, who, age + n * 3, svc,
                           area=["EUR", "APM"][i % 2], team=["EEM", "KSEA"][i % 2], n=n))
ROWS.append(ticket(90, "Solo", 10, SERVICES[0], area="APM", team="KANZ"))
ROWS.append(ticket(91, "Hub", 10, SERVICES[0], area="Global", team="Other"))
# One cell with exactly 40 requests, for the fixed-band test.
for n in range(40):
    ROWS.append(ticket(92, f"Bulk {n % 6}", 15, SERVICES[1], area="EUR", team="DACH", n=n))

SID = upload(ROWS)
M = metrics(SID)
CFG = M["config"]
ok = 0


def check(name, condition, detail=""):
    global ok
    print(f"  {'PASS' if condition else 'FAIL'}  {name}" + (f"  — {detail}" if detail else ""))
    assert condition, name
    ok += 1


print("1. A 30-day window still has dormant users and is not pinned at 100%")
win = metrics(SID, date_from=(TODAY - timedelta(days=30)).strftime("%Y-%m-%d"),
              date_to=TODAY.strftime("%Y-%m-%d"))
check("dormant users exist", len(win["lifecycle"]["dormant"]) > 0,
      f"{len(win['lifecycle']['dormant'])} dormant")
check("repeat-use rate is not 100%", win["rates"]["engagement_pct"] < 100,
      f"{win['rates']['engagement_pct']}%")

print("\n2. A user whose last request precedes the range still appears in the list")
ul = user_list(SID, date_from=(TODAY - timedelta(days=30)).strftime("%Y-%m-%d"),
               date_to=TODAY.strftime("%Y-%m-%d"))
hana = next((u for u in ul if u["creator"] == "Hana"), None)
check("Hana is listed", hana is not None)
check("with a real age", hana and hana["days_since_last"] > 300,
      f"{hana['days_since_last']}d" if hana else "")

print("\n3. A Service filter does not move service breadth")
plain = {r["name"]: r["utility_pct"] for r in M["activity_groups"]["by_area"]}
wcm = {r["name"]: r["utility_pct"]
       for r in metrics(SID, sub_category=SERVICES[0])["activity_groups"]["by_area"]}
check("breadth unchanged", plain == wcm, f"{plain} vs {wcm}")

print("\n4. The top-share is stable when the population is duplicated")
tripled = [{**r, "Number": f"{r['Number']}c{c}", "Requested by": f"{r['Requested by']} {c}"}
           for c in range(3) for r in ROWS]
m3 = metrics(upload(tripled))
check("same share", M["growth"]["top_share_pct"] == m3["growth"]["top_share_pct"],
      f"{M['growth']['top_share_pct']}% on {M['total_users']} users, "
      f"{m3['growth']['top_share_pct']}% on {m3['total_users']}")

print("\n5. A one-user group shows n=1 and no percentage")
solo = next((r for r in M["activity_groups"]["by_frontline"] if r["name"] == "KANZ"), None)
check("KANZ is a one-user row", solo and solo["users"] == 1)
check("its percentage is suppressed", solo and solo["show_pct"] is False)

print("\n6. An Area filter moves no recency window")
a = metrics(SID, area="EUR")
check("same anchor", M["period_end"] == a["period_end"], M["period_end"])
check("same lifecycle thresholds", a["config"]["lifecycle_dormant_days"]
      == CFG["lifecycle_dormant_days"])

print("\n7. A cell of 40 requests is the same band with and without a filter")
key = next((k for k, c in M["service_adoption"]["grid"].items() if c["requests"] == 40), None)
check("a 40-request cell exists", key is not None, key or "")
unfiltered_band = M["service_adoption"]["grid"][key]["band"]
filtered = metrics(SID, area="EUR")["service_adoption"]["grid"].get(key)
check("same band under a filter", filtered and filtered["band"] == unfiltered_band,
      f"band {unfiltered_band} both ways")
check("and it is the configured band",
      [CFG["heatmap_bands"][unfiltered_band - 1][0],
       CFG["heatmap_bands"][unfiltered_band - 1][1]] == [21, 50],
      f"40 falls in {CFG['heatmap_band_labels'][unfiltered_band - 1]}")

print(f"\n{ok} checks passed")
