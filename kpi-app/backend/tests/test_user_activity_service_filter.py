"""A reach question cannot be asked of a population narrowed to the answer.

Filtering to WCM left only WCM users in the denominator, so WCM's reach read
100% and every breakdown row collapsed to 100% too — the service list was taken
from the filtered rows and had one service in it. These check that the reach and
utility figures are identical with and without a service filter, while the
volume figures still respond to it.
"""
import json
import sys
import urllib.parse
import urllib.request

sys.path.insert(0, "/tmp/claude-0/-home-user-hub-tools/82e410bb-e079-52f1-bbcc-05d4911973ee/scratchpad")
import ua_fixture  # noqa: E402

BASE = "http://127.0.0.1:8822"
WCM = "Website Content Management"

rows = ua_fixture.build()
req = urllib.request.Request(f"{BASE}/api/upload-json",
                             data=json.dumps({"rows": rows}).encode(),
                             headers={"Content-Type": "application/json"})
sid = json.loads(urllib.request.urlopen(req).read())["session_id"]


def metrics(**p):
    q = urllib.parse.urlencode({k: v for k, v in p.items() if v})
    return json.loads(urllib.request.urlopen(
        f"{BASE}/api/sessions/{sid}/user-metrics{'?' + q if q else ''}").read())


base = metrics()
filt = metrics(sub_category=WCM)

print("TEST 1 — service reach is unchanged by the service filter")
b = {r["short"]: (r["users"]["used"], r["users"]["total"], r["users"]["rate_pct"])
     for r in base["service_utility"]}
f = {r["short"]: (r["users"]["used"], r["users"]["total"], r["users"]["rate_pct"])
     for r in filt["service_utility"]}
for k in b:
    print(f"  {k:<4} unfiltered {b[k][0]:>3}/{b[k][1]:<3} = {b[k][2]}%    "
          f"WCM filter {f[k][0]:>3}/{f[k][1]:<3} = {f[k][2]}%")
assert b == f, "reach moved when the service filter was applied"

print("\nTEST 2 — breakdown utility is unchanged")
bu = {r["name"]: r["utility_pct"] for r in base["activity_groups"]["by_area"]}
fu = {r["name"]: r["utility_pct"] for r in filt["activity_groups"]["by_area"]}
print("  unfiltered:", bu)
print("  WCM filter:", fu)
assert bu == fu, "breakdown utility collapsed under the service filter"
assert not all(v == 100 for v in fu.values()), "every row is 100% — the old bug"

print("\nTEST 3 — per-frontline service breadth is unchanged")
bf = {r["frontline"]: r["average_pct"] for r in base["fl_utility"]["rows"]}
ff = {r["frontline"]: r["average_pct"] for r in filt["fl_utility"]["rows"]}
assert bf == ff, "frontline breadth moved under the service filter"
print(f"  {len(bf)} frontlines, identical both ways")

print("\nTEST 4 — volume still responds to the filter")
print(f"  requests  unfiltered {base['volume']['total_requests']:>4}  "
      f"WCM {filt['volume']['total_requests']:>4}")
print(f"  heat map cells  unfiltered {len(base['service_adoption']['grid'])}  "
      f"WCM {len(filt['service_adoption']['grid'])}")
assert filt["volume"]["total_requests"] < base["volume"]["total_requests"]
assert len(filt["service_adoption"]["services"]) == 1, \
    "the heat map should narrow to the chosen service"
assert filt["reach_ignores_service_filter"] is True
assert base["reach_ignores_service_filter"] is False

print("\nALL CHECKS PASSED")
