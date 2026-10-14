"""The redefinitions of Step 4, checked against the rows.

Three of these changed what a number means rather than what it is called, and
each was changed because the old version could not be wrong: engagement was the
inverse of the dormant share, a fixed top ten is the whole population once a
filter leaves ten users, and "new in the last 90 days" is everyone when the data
is 60 days old.
"""
import json
import sys
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import datetime, timedelta

BASE = "http://127.0.0.1:8822"
TODAY = datetime(2026, 9, 25)
SERVICES = ["Website Content Management", "Demand Creation – Global",
            "Content Production – Graphic Design"]

# Eight users: three recent repeaters, two recent one-offs, three long gone.
PLAN = [
    ("Repeat A",   [2, 9, 20]), ("Repeat B", [5, 30]), ("Repeat C", [1, 60]),
    ("Once A",     [12]),       ("Once B",   [40]),
    ("Gone A",     [150, 160]), ("Gone B",   [300]),   ("Gone C",   [220, 240]),
]
rows = []
for i, (who, ages) in enumerate(PLAN):
    for n, age in enumerate(ages):
        created = TODAY - timedelta(days=age)
        rows.append({
            "Number": f"PC60{i}{n:02d}", "Short description": "request",
            "Requested by": who, "Assigned to": "Ajith A",
            "Created": created.strftime("%Y-%m-%d %H:%M:%S"),
            "Closed": (created + timedelta(days=2)).strftime("%Y-%m-%d %H:%M:%S"),
            "State": "Closed Completed",
            "Area": ["EUR", "APM"][i % 2], "Team": ["EEM", "KSEA"][i % 2],
            "Sub-Category": SERVICES[i % 3],
        })

req = urllib.request.Request(f"{BASE}/api/upload-json",
                             data=json.dumps({"rows": rows}).encode(),
                             headers={"Content-Type": "application/json"})
sid = json.loads(urllib.request.urlopen(req).read())["session_id"]


def metrics(**p):
    q = urllib.parse.urlencode({k: v for k, v in p.items() if v})
    return json.loads(urllib.request.urlopen(
        f"{BASE}/api/sessions/{sid}/user-metrics{'?' + q if q else ''}").read())


m = metrics()
cfg = m["config"]
anchor = datetime.fromisoformat(m["period_end"])
offset = (TODAY - anchor).days

print("TEST 1 — engagement is repeat use, not the inverse of dormancy")
recent_counts = defaultdict(int)
for who, ages in PLAN:
    recent_counts[who] = sum(1 for a in ages if a - offset <= cfg["lifecycle_dormant_days"])
want = sum(1 for n in recent_counts.values() if n >= cfg["engaged_min_requests"])
lc = m["lifecycle"]
print(f"  repeaters in the last {cfg['lifecycle_dormant_days']}d: {want} of {m['total_users']} "
      f"= {m['rates']['engagement_pct']}%")
print(f"  (active+regular would have been "
      f"{round((len(lc['active']) + len(lc['regular'])) / m['total_users'] * 100)}%)")
assert m["rates"]["engaged_users"] == want, (m["rates"]["engaged_users"], want)
assert m["rates"]["engagement_pct"] == round(want / m["total_users"] * 100)
assert m["rates"]["engagement_pct"] != round(
    (len(lc["active"]) + len(lc["regular"])) / m["total_users"] * 100), \
    "engagement still mirrors the lifecycle split"

print("\nTEST 2 — the top-requestor share is a proportion")
g = m["growth"]
import math
want_n = max(1, math.ceil(g["top_share_basis"] * cfg["top_requestor_share"]))
print(f"  busiest {cfg['top_requestor_share']:.0%} of {g['top_share_basis']} users "
      f"= {g['top_n_effective']} user(s), carrying {g['top_share_pct']}% of requests")
assert g["top_n_effective"] == want_n, (g["top_n_effective"], want_n)
assert g["top_share_pct"] < 100, "the top slice is the whole population again"

print("\nTEST 3 — the same share on a population tripled")
tripled = []
for copy in range(3):
    for r in rows:
        tripled.append({**r, "Number": f"{r['Number']}x{copy}",
                        "Requested by": f"{r['Requested by']} {copy}"})
req = urllib.request.Request(f"{BASE}/api/upload-json",
                             data=json.dumps({"rows": tripled}).encode(),
                             headers={"Content-Type": "application/json"})
sid3 = json.loads(urllib.request.urlopen(req).read())["session_id"]
m3 = json.loads(urllib.request.urlopen(f"{BASE}/api/sessions/{sid3}/user-metrics").read())
print(f"  {m['total_users']} users -> {m['growth']['top_share_pct']}%   "
      f"{m3['total_users']} users -> {m3['growth']['top_share_pct']}%")
assert m["growth"]["top_share_pct"] == m3["growth"]["top_share_pct"], \
    "the share moved when the population was duplicated"

print("\nTEST 4 — median leads, mean follows")
v = m["volume"]
print(f"  median {v['median_per_user']}  mean {v['avg_per_user']}  "
      f"over {v['users_in_window']} users who raised something")
assert v["median_per_user"] is not None and v["avg_per_user"] is not None

print("\nTEST 5 — new users are suppressed when the history is too short")
short = [r for r in rows if (TODAY - datetime.strptime(r["Created"], "%Y-%m-%d %H:%M:%S")).days < 45]
req = urllib.request.Request(f"{BASE}/api/upload-json",
                             data=json.dumps({"rows": short}).encode(),
                             headers={"Content-Type": "application/json"})
sid_s = json.loads(urllib.request.urlopen(req).read())["session_id"]
ms = json.loads(urllib.request.urlopen(f"{BASE}/api/sessions/{sid_s}/user-metrics").read())
print(f"  full data: history {m['growth']['history_days']}d, censored "
      f"{m['growth']['new_users_censored']}")
print(f"  45d of data: history {ms['growth']['history_days']}d, censored "
      f"{ms['growth']['new_users_censored']}")
assert ms["growth"]["new_users_censored"] is True
assert m["growth"]["new_users_censored"] is False

print("\nTEST 6 — a frontline needs more than one person trying once")
su = {r["short"]: r for r in m["service_utility"]}
for short, r in su.items():
    f = r["frontlines"]
    print(f"  {short:<4} using {f['used']}/{f['total']}  "
          f"below the bar {len(f['below_threshold'])}  never {len(f['not_used'])}")
    assert f["used"] + len(f["below_threshold"]) + len(f["not_used"]) == f["total"]

print("\nTEST 7 — small groups show a count, not a percentage")
small = [r for r in m["activity_groups"]["by_frontline"]
         if r["users"] < cfg["min_group_size_for_pct"]]
print(f"  {len(small)} frontline rows below {cfg['min_group_size_for_pct']} users; "
      f"show_pct flags: {sorted({r['show_pct'] for r in small})}")
assert all(r["show_pct"] is False for r in small)
assert all(r["show_pct"] is True
           for r in m["activity_groups"]["by_frontline"]
           if r["users"] >= cfg["min_group_size_for_pct"])

print("\nALL CHECKS PASSED")
