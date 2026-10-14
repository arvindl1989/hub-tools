"""Recency must describe the user, not the window.

Reading a user's last request off the date-filtered rows made the oldest
possible user exactly as old as the range: a 30-day window left everyone
Active, nobody Dormant and Engagement pinned at 100%. These check the three
scopes are kept apart — volume from the window, recency as of its end, the
roster from everything — and that the rest of the page did not move.
"""
import json
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timedelta

BASE = "http://127.0.0.1:8822"
TODAY = datetime(2026, 9, 25)
SERVICES = ["Website Content Management", "Demand Creation – Global",
            "Content Production – Graphic Design"]

# Users at known ages, so every bucket has a member whatever window is chosen.
PEOPLE = [
    ("Fresh A",   3), ("Fresh B",  10), ("Fresh C",  21),
    ("Mid A",    45), ("Mid B",    70),
    ("Stale A", 140), ("Stale B", 260), ("Stale C", 400),
]
rows = []
for i, (who, age) in enumerate(PEOPLE):
    # Two requests each, a fortnight apart, so "repeat use" is testable too.
    for n, extra in enumerate((0, 14)):
        created = TODAY - timedelta(days=age + extra)
        rows.append({
            "Number": f"PC70{i}{n:02d}",
            "Short description": "request",
            "Requested by": who,
            "Assigned to": "Ajith A",
            "Created": created.strftime("%Y-%m-%d %H:%M:%S"),
            "Closed": (created + timedelta(days=3)).strftime("%Y-%m-%d %H:%M:%S"),
            "State": "Closed Completed",
            "Area": ["EUR", "APM"][i % 2],
            "Team": ["EEM", "KSEA"][i % 2],
            "Sub-Category": SERVICES[i % 3],
        })

req = urllib.request.Request(f"{BASE}/api/upload-json",
                             data=json.dumps({"rows": rows}).encode(),
                             headers={"Content-Type": "application/json"})
sid = json.loads(urllib.request.urlopen(req).read())["session_id"]
print(f"fixture: {len(PEOPLE)} users, newest request {TODAY:%Y-%m-%d}\n")


def call(path, **params):
    q = urllib.parse.urlencode({k: v for k, v in params.items() if v})
    return json.loads(urllib.request.urlopen(f"{BASE}{path}{'?' + q if q else ''}").read())


def metrics(**p):
    return call(f"/api/sessions/{sid}/user-metrics", **p)


def user_list(**p):
    return call(f"/api/sessions/{sid}/user-activity", **p)


WINDOWS = [
    ("no filter",  {}),
    ("last 30d",   {"date_from": (TODAY - timedelta(days=30)).strftime("%Y-%m-%d"),
                    "date_to": TODAY.strftime("%Y-%m-%d")}),
    ("last 90d",   {"date_from": (TODAY - timedelta(days=90)).strftime("%Y-%m-%d"),
                    "date_to": TODAY.strftime("%Y-%m-%d")}),
]

print("TEST 1 — a short window must still show Dormant users")
for label, p in WINDOWS:
    m = metrics(**p)
    lc = m["lifecycle"]
    a, r, d = len(lc["active"]), len(lc["regular"]), len(lc["dormant"])
    print(f"  {label:<10} anchor {m['period_end']}  requests in window {m['volume']['total_requests']:>2}  "
          f"active {a} regular {r} dormant {d}  engagement {m['rates']['engagement_pct']}%")
    assert d > 0, f"{label}: no dormant users, recency is still bounded by the window"
    assert m["rates"]["engagement_pct"] < 100, f"{label}: engagement pinned at 100%"

# The lifecycle split must be identical in every window: it describes the
# people, and the people have not changed.
splits = {label: tuple(len(metrics(**p)["lifecycle"][k])
                       for k in ("active", "regular", "dormant"))
          for label, p in WINDOWS}
assert len(set(splits.values())) == 1, f"lifecycle moved with the window: {splits}"
print(f"  same split in every window: {splits['no filter']}")

print("\nTEST 2 — volume still follows the window")
vols = {label: metrics(**p)["volume"]["total_requests"] for label, p in WINDOWS}
print("  requests per window:", vols)
assert vols["last 30d"] < vols["last 90d"] < vols["no filter"], vols

# Recency is measured from the newest request in the data, which is the
# youngest user's — so every age shifts down by that much.
OFFSET = min(age for _, age in PEOPLE)

print("\nTEST 3 — the user list is lifetime and keeps everyone")
ul = user_list(**WINDOWS[1][1])
names = {u["creator"] for u in ul}
print(f"  {len(ul)} users with a 30-day range (fixture has {len(PEOPLE)})")
for who, age in PEOPLE:
    assert who in names, f"{who} ({age}d old) vanished from the list"
    row = next(u for u in ul if u["creator"] == who)
    assert row["days_since_last"] == age - OFFSET, (who, row["days_since_last"], age - OFFSET)
print("  every user present, days-since correct against their real last request")

print("\nTEST 4 — the access tiers use the shared thresholds")
tiers = {u["creator"]: u["engagement_tier"] for u in ul}
for who, age in PEOPLE:
    aged = age - OFFSET
    want = "Active" if aged < 30 else "At Risk" if aged <= 90 else "Review Access"
    assert tiers[who] == want, (who, age, tiers[who], want)
print("  ", {k: v for k, v in list(tiers.items())[:4]}, "…")
assert "Remove Access" not in set(tiers.values())

print("\nTEST 5 — an Area filter moves no recency window")
base = metrics()
one = metrics(area="EUR")
assert base["period_end"] == one["period_end"], (base["period_end"], one["period_end"])
print(f"  anchor {base['period_end']} unchanged by the Area filter")

print("\nTEST 6 — per-service recency is as-of, not in-window")
for label, p in WINDOWS:
    m = metrics(**p)
    dormant = sum(r["users"]["dormant"] for r in m["service_utility"])
    print(f"  {label:<10} dormant service-users {dormant}")
    assert dormant > 0, f"{label}: no service has a dormant user"

print("\nALL CHECKS PASSED")
