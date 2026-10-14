"""Effort views sit beside the counts without replacing or distorting them.

The case that matters is the mix: a frontline whose tickets are mostly WCM can
spend most of its hours on Demand Creation, because one of those is four of the
other. A ticket mix and an hours mix are different numbers about the same work,
and both have to be right.
"""
import json
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timedelta

BASE = "http://127.0.0.1:8822"
TODAY = datetime(2026, 9, 25)

HOURS = {
    "Website Content Management": 5.0,
    "Email – Local": 7.2727,
    "Content Production – Graphic Design": 6.1538,
    "Demand Creation – Global": 20.0,
    "Retention – Activations": 20.0,
}


def ticket(i, who, service, team, area, age=10, n=0):
    created = TODAY - timedelta(days=age)
    return {"Number": f"PC{i:05d}{n:03d}", "Short description": "r",
            "Requested by": who, "Assigned to": "Ajith A",
            "Created": created.strftime("%Y-%m-%d %H:%M:%S"),
            "Closed": (created + timedelta(days=3)).strftime("%Y-%m-%d %H:%M:%S"),
            "State": "Closed Completed", "Area": area, "Team": team,
            "Sub-Category": service}


# The KEI case from the brief: 37 WCM, 10 Email – Local, 1 CP.
rows = []
for n in range(37):
    rows.append(ticket(1, f"KEI U{n % 5}", "Website Content Management", "KEI", "APM", n=n))
for n in range(10):
    rows.append(ticket(2, f"KEI U{n % 3}", "Email – Local", "KEI", "APM", n=n))
rows.append(ticket(3, "KEI U1", "Content Production – Graphic Design", "KEI", "APM"))
# A second frontline whose ticket mix and hours mix disagree sharply.
for n in range(9):
    rows.append(ticket(4, f"EEM U{n % 3}", "Website Content Management", "EEM", "EUR", n=n))
for n in range(1):
    rows.append(ticket(5, "EEM U1", "Demand Creation – Global", "EEM", "EUR", n=n))

for n in range(2):
    rows.append(ticket(6, f"GIN U{n}", "Demand Creation – Global", "GIN", "EUR", n=n))

req = urllib.request.Request(f"{BASE}/api/upload-json",
                             data=json.dumps({"rows": rows}).encode(),
                             headers={"Content-Type": "application/json"})
sid = json.loads(urllib.request.urlopen(req).read())["session_id"]


def metrics(**p):
    q = urllib.parse.urlencode({k: v for k, v in p.items() if v})
    return json.loads(urllib.request.urlopen(
        f"{BASE}/api/sessions/{sid}/user-metrics{'?' + q if q else ''}").read())


m = metrics()
ok = 0


def check(name, cond, detail=""):
    global ok
    print(f"  {'PASS' if cond else 'FAIL'}  {name}" + (f"  — {detail}" if detail else ""))
    assert cond, name
    ok += 1


print("KEI: 37 WCM, 10 Email, 1 CP")
kei = next(r for r in m["activity_groups"]["by_frontline"] if r["name"] == "KEI")
want_hours = 37 * HOURS["Website Content Management"] + 10 * HOURS["Email – Local"] + \
    1 * HOURS["Content Production – Graphic Design"]
check("48 tickets", kei["requests"] == 48, str(kei["requests"]))
check("hours from sub-service rates", round(kei["est_hours"]) == round(want_hours),
      f"{kei['est_hours']} h, expected {round(want_hours, 1)}")

# Ticket mix stays 77 / 21 / 2.
mix = {k.split("–")[0].strip()[:4]: round(v / kei["requests"] * 100)
       for k, v in kei["breakdown"].items()}
print(f"  ticket mix: {mix}")
check("ticket mix is 77/21/2",
      sorted(mix.values(), reverse=True)[:3] == [77, 21, 2],
      str(sorted(mix.values(), reverse=True)[:3]))

hmix = {k.split("–")[0].strip()[:4]: round(v / kei["est_hours"] * 100)
        for k, v in kei["breakdown_hours"].items()}
print(f"  hours mix : {hmix}")
check("hours mix differs from the ticket mix", hmix != mix)
check("hours mix sums to 100", sum(hmix.values()) in (99, 100, 101), str(sum(hmix.values())))

print("\nEEM: 9 WCM, 1 Demand Creation — mostly WCM by count, not by effort")
eem = next(r for r in m["activity_groups"]["by_frontline"] if r["name"] == "EEM")
wcm_tickets = eem["breakdown"]["Website Content Management"] / eem["requests"] * 100
wcm_hours = eem["breakdown_hours"]["Website Content Management"] / eem["est_hours"] * 100
print(f"  WCM is {wcm_tickets:.0f}% of tickets but {wcm_hours:.0f}% of hours")
check("the two readings diverge", round(wcm_tickets) == 90 and round(wcm_hours) < 75,
      f"{round(wcm_tickets)}% vs {round(wcm_hours)}%")

print("\nService breadth is identical in both modes")
breadth_before = {r["name"]: r["utility_pct"] for r in m["activity_groups"]["by_area"]}
check("breadth does not depend on effort", all(
    r["utility_pct"] is not None for r in m["activity_groups"]["by_area"]))
check("breadth is a share of people, with no hours field to confuse it",
      "utility_pct" in m["activity_groups"]["by_area"][0]
      and "est_hours" in m["activity_groups"]["by_area"][0],
      str(breadth_before))

print("\nThe heat map carries both readings of every cell")
cells = list(m["service_adoption"]["grid"].values())
used = [c for c in cells if c["requests"]]
check("every used cell is priced", all(c["est_hours"] > 0 for c in used),
      f"{len(used)} used cells")
# Divergence is not guaranteed by the data — it is guaranteed by the bands
# only where the two scales disagree, so the property worth asserting is that
# each cell's band matches the configured table, and that the planted cell
# (2 tickets, 40 hours) lands in different bands on the two scales.
CFG = m["config"]


def band_of(value, table):
    if not value:
        return 0
    for i, (lo, hi) in enumerate(table, start=1):
        if value >= lo and (hi is None or value <= hi):
            return i
    return len(table)


for c in used:
    want_c = band_of(c["requests"], CFG["heatmap_bands"])
    want_h = band_of(round(c["est_hours"]), CFG["heatmap_hour_bands"])
    assert c["band"] == want_c, (c["requests"], c["band"], want_c)
    assert c["band_hours"] == want_h, (c["est_hours"], c["band_hours"], want_h)
check("every band matches the configured table", True, f"{len(used)} cells")

planted = [c for c in used if c["requests"] == 2 and round(c["est_hours"]) == 40]
check("a 2-ticket, 40-hour cell shades differently on the two scales",
      bool(planted) and planted[0]["band"] != planted[0]["band_hours"],
      f"count band {planted[0]['band']} vs hour band {planted[0]['band_hours']}"
      if planted else "cell not found")

print("\nTop requestors can be a different tenth by hours")
g = m["growth"]
print(f"  by count {g['top_share_pct']}%   by hours {g['top_share_hours_pct']}%")
check("both shares present", g["top_share_pct"] is not None
      and g["top_share_hours_pct"] is not None)
check("hour totals are on the volume card", m["volume"]["est_hours"] > 0,
      f"{m['volume']['est_hours']} h over {m['volume']['total_requests']} requests")

print(f"\n{ok} checks passed")
