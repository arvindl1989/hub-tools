"""The capacity sheet: availability down to a utility rate, and back up again.

Built on a fixture whose answer is known by hand, because every figure on that
page is three or four arithmetic steps from the tickets and a wrong one looks
exactly like a right one.

    python test_capacity_plan.py        # expects the app on :8822
"""
import json
import urllib.parse
import urllib.request

BASE = "http://127.0.0.1:8822"
WHO = "Ajith A"
WCM = "Website Content Management"
ok = 0


def check(name, cond, detail=""):
    global ok
    print(f"  {'PASS' if cond else 'FAIL'}  {name}" + (f"  — {detail}" if detail else ""))
    assert cond, name
    ok += 1


def plan(rows, year=2026):
    req = urllib.request.Request(f"{BASE}/api/upload-json",
                                 data=json.dumps({"rows": rows}).encode(),
                                 headers={"Content-Type": "application/json"})
    sid = json.loads(urllib.request.urlopen(req).read())["session_id"]
    q = urllib.parse.urlencode({"year": year})
    return json.loads(urllib.request.urlopen(
        f"{BASE}/api/sessions/{sid}/capacity-plan?{q}").read())


def ticket(i, year, state="Closed Completed", sub=WCM, who=WHO):
    return {"Number": f"CP{i:06d}", "Short description": "r", "Requested by": f"U{i % 7}",
            "Assigned to": who, "Created": f"{year}-03-02 09:00:00",
            "Closed": None if state == "Work in progress" else f"{year}-03-20 17:00:00",
            "State": state, "Area": "EUR", "Team": "EEM", "Sub-Category": sub}


# 100 WCM closed in 2026, 40 in 2025, plus work that must not count.
rows = [ticket(i, 2026) for i in range(100)]
rows += [ticket(500 + i, 2025) for i in range(40)]
rows += [ticket(900 + i, 2026, state="Work in progress") for i in range(25)]
d = plan(rows)

print(f"as of {d['as_of']}, counting {d['closed_states']}")
check("closed means completed or rejected",
      d["closed_states"] == ["Closed Completed", "Closed Rejected"], str(d["closed_states"]))

p = next(r for r in d["people"] if r["name"] == WHO)
print(f"   {p['working_days']} working − {p['holidays']} holidays = {p['availability']}, "
      f"− {p['cadence_days']} cadence − {p['training_days']} training "
      f"= {p['productivity_days']} productive")
check("availability is working days less holidays",
      p["availability"] == p["working_days"] - p["holidays"], str(p["availability"]))
check("cadence is the configured share of availability",
      p["cadence_days"] == round(p["availability"] * d["cadence_pct"] / 100, 1),
      str(p["cadence_days"]))
check("productivity is what is left",
      p["productivity_days"] == round(p["availability"] - p["cadence_days"]
                                      - p["training_days"], 1),
      str(p["productivity_days"]))

# 100 tickets at the 2026 WCM rate of 4.6 hours = 460 hours = 57.5 days.
print(f"   100 closed WCM → {p['by_service']['WCM']} days, "
      f"{p['allocated_days']} allocated, {p['utility_pct']}%")
check("allocation is the closed work priced at this year's rate",
      p["by_service"]["WCM"] == 57.5, str(p["by_service"]["WCM"]))
check("open work is not priced", p["tickets"]["WCM"] == 100, str(p["tickets"]["WCM"]))
check("allocated is the sum across services", p["allocated_days"] == 57.5,
      str(p["allocated_days"]))
check("utility is allocated over productive days",
      p["utility_pct"] == round(57.5 / p["productivity_days"] * 100),
      f"{p['utility_pct']}% of {p['productivity_days']} days")

wcm = next(s for s in d["services"] if s["short"] == "WCM")
print(f"   WCM goal {wcm['goal_hours']}h ({wcm['goal_per_day']}/day), "
      f"2026 {wcm['year_hours']}h ({wcm['year_per_day']}/day), "
      f"goal capacity {wcm['goal_capacity']} vs actual {wcm['actual']}, 2025 {wcm['previous']}")
check("per day is eight hours over the rate", wcm["goal_per_day"] == round(8 / 4.5, 2),
      str(wcm["goal_per_day"]))
# The same 57.5 days worked at the 4.5-hour goal instead of the 4.6 it took.
check("goal capacity is those days at the target rate",
      wcm["goal_capacity"] == round(57.5 * (8 / 4.5)), str(wcm["goal_capacity"]))
check("which is above the actual, because the goal is the faster rate",
      wcm["goal_capacity"] > wcm["actual"], f"{wcm['goal_capacity']} vs {wcm['actual']}")
check("last year is counted separately", wcm["previous"] == 40, str(wcm["previous"]))

print("\nA rejected ticket still took the time it took")
rows2 = [ticket(i, 2026) for i in range(10)] \
    + [ticket(700 + i, 2026, state="Closed Rejected") for i in range(10)]
d2 = plan(rows2)
p2 = next(r for r in d2["people"] if r["name"] == WHO)
check("both closed states are counted", p2["tickets"]["WCM"] == 20,
      str(p2["tickets"]["WCM"]))

print("\nServices with no sub-category mapped carry nothing")
check("they are named rather than hidden",
      set(d["unmapped"]) == {"PM", "Local SEO", "PWR/KDB", "Adhoc"}, str(d["unmapped"]))
for short in d["unmapped"]:
    svc = next(s for s in d["services"] if s["short"] == short)
    assert svc["days"] == 0 and svc["actual"] == 0, short
check("and they claim no days and no tickets", True)

print("\nAnother year is another set of rates")
d25 = plan(rows, year=2025)
p25 = next(r for r in d25["people"] if r["name"] == WHO)
# 40 tickets at 2025's 5.0 hours = 200 hours = 25 days.
print(f"   2025: {p25['tickets']['WCM']} closed → {p25['by_service']['WCM']} days")
check("2025 is priced at 2025's rate", p25["by_service"]["WCM"] == 25.0,
      str(p25["by_service"]["WCM"]))

print("\nThe editor writes back, and the page follows")
settings = json.loads(urllib.request.urlopen(
    f"{BASE}/api/capacity-plan/settings?year=2026").read())
before_days = dict(settings["working_days"])
check("it reads the same working days the page used",
      before_days.get(WHO) == p["working_days"], str(before_days.get(WHO)))


def save(payload):
    req = urllib.request.Request(f"{BASE}/api/capacity-plan/settings",
                                 data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json"},
                                 method="PUT")
    return json.loads(urllib.request.urlopen(req).read())


try:
    save({"year": 2026, "working_days": {**before_days, WHO: 200},
          "cadence_pct": 10})
    after = plan(rows)
    pa = next(r for r in after["people"] if r["name"] == WHO)
    print(f"   200 working days at 10% cadence → {pa['availability']} available, "
          f"{pa['cadence_days']} cadence, {pa['productivity_days']} productive")
    check("the new working days are used", pa["working_days"] == 200,
          str(pa["working_days"]))
    check("and the new cadence share", after["cadence_pct"] == 10,
          str(after["cadence_pct"]))
    check("which moves productivity, and so the rate",
          pa["productivity_days"] != p["productivity_days"],
          f"{p['productivity_days']} → {pa['productivity_days']}")
finally:
    save({"year": 2026, "working_days": before_days, "cadence_pct": 20})

restored = plan(rows)
pr = next(r for r in restored["people"] if r["name"] == WHO)
check("and it goes back", pr["productivity_days"] == p["productivity_days"],
      str(pr["productivity_days"]))

# The Utility Rate page owns /api/capacity-settings; this page must not have
# taken that path from it.
other = json.loads(urllib.request.urlopen(f"{BASE}/api/capacity-settings").read())
check("the older capacity-settings endpoint is untouched",
      "default_working_days" in other, str(sorted(other)[:4]))

print(f"\n{ok} checks passed")
