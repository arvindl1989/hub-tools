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
      f"2026 measured {wcm['year_hours']}h ({wcm['year_per_day']}/day) "
      f"from {wcm['days']} days over {wcm['actual']} closed, "
      f"2025 {wcm['prev_hours']}h over {wcm['previous']}")
check("per day is eight hours over the rate", wcm["goal_per_day"] == round(8 / 4.5, 2),
      str(wcm["goal_per_day"]))
# Avg TAT is measured, not echoed: the days that went into the service over
# the tickets that came out. Where every cell is priced from the rate it
# restates the rate, which is why this reads 4.6 and not something else.
check("this year's TAT is the days over the tickets",
      wcm["year_hours"] == round(8 * wcm["days"] / wcm["actual"], 2),
      f"{wcm['year_hours']} from {wcm['days']}/{wcm['actual']}")
check("and with nothing set by hand that is the rate restated",
      wcm["year_hours"] == wcm["rate_hours"],
      f"{wcm['year_hours']} vs {wcm['rate_hours']}")
check("the year before is measured the same way, at its own rate",
      wcm["prev_hours"] == 5.0, str(wcm["prev_hours"]))
check("per day is the other way up", wcm["year_per_day"] == round(100 / 57.5, 2),
      str(wcm["year_per_day"]))
check("the goal is typed, so nothing is claimed until somebody types it",
      wcm["goal_capacity"] is None, str(wcm["goal_capacity"]))
check("last year is counted separately", wcm["previous"] == 40, str(wcm["previous"]))

print("\nA hand-set figure parts the measured rate from the one set for pricing")
hand = json.loads(urllib.request.urlopen(urllib.request.Request(
    f"{BASE}/api/capacity-plan/manual",
    data=json.dumps({"year": 2026, "person": WHO, "service": "WCM", "days": 100,
                     "goal": 120, "set_goal": True}).encode(),
    headers={"Content-Type": "application/json"}, method="PUT")).read())
try:
    dh2 = plan(rows)
    wh = next(s for s in dh2["services"] if s["short"] == "WCM")
    print(f"   100 days by hand over {wh['actual']} closed → {wh['year_hours']}h measured, "
          f"{wh['rate_hours']}h set, goal {wh['goal_capacity']}")
    check("the measured rate follows the days", wh["year_hours"] == 8.0,
          str(wh["year_hours"]))
    check("while the rate used for pricing is untouched", wh["rate_hours"] == 4.6,
          str(wh["rate_hours"]))
    check("the goal is what was typed", wh["goal_capacity"] == 120,
          str(wh["goal_capacity"]))
    check("and it is carried per person", wh["people"][WHO]["goal"] == 120.0,
          str(wh["people"][WHO]["goal"]))
finally:
    urllib.request.urlopen(urllib.request.Request(
        f"{BASE}/api/capacity-plan/manual",
        data=json.dumps({"year": 2026, "person": WHO, "service": "WCM",
                         "days": None, "goal": None, "set_goal": True}).encode(),
        headers={"Content-Type": "application/json"}, method="PUT"))
back_wcm = next(s for s in plan(rows)["services"] if s["short"] == "WCM")
check("clearing both puts it all back",
      back_wcm["year_hours"] == 4.6 and back_wcm["goal_capacity"] is None,
      f"{back_wcm['year_hours']}, {back_wcm['goal_capacity']}")

print("\nTraining is a share of availability, with a figure for the exceptions")
tsettings = json.loads(urllib.request.urlopen(
    f"{BASE}/api/capacity-plan/settings?year=2026").read())
check("the share is offered as a setting", tsettings["training_pct"] == 5,
      str(tsettings["training_pct"]))


def save_t(payload):
    req = urllib.request.Request(f"{BASE}/api/capacity-plan/settings",
                                 data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json"},
                                 method="PUT")
    return json.loads(urllib.request.urlopen(req).read())


before_training = dict(tsettings["training_days"])
try:
    # Nobody has a figure of their own, so everybody is on the share.
    save_t({"year": 2026, "training_days": {}, "training_pct": 5})
    ds = plan(rows)
    ps = next(r for r in ds["people"] if r["name"] == WHO)
    print(f"   5% of {ps['availability']} available → {ps['training_days']} days "
          f"(from the share: {ps['training_from_share']})")
    check("the share is reported", ds["training_pct"] == 5, str(ds["training_pct"]))
    check("and applied when no figure is set",
          ps["training_days"] == round(ps["availability"] * 5 / 100, 1),
          str(ps["training_days"]))
    check("which the row says it is", ps["training_from_share"] is True)
    check("productivity still takes it off",
          ps["productivity_days"] == round(ps["availability"] - ps["cadence_days"]
                                           - ps["training_days"], 1),
          str(ps["productivity_days"]))

    # Change the share and everybody moves with it.
    save_t({"year": 2026, "training_pct": 10})
    d10 = plan(rows)
    p10 = next(r for r in d10["people"] if r["name"] == WHO)
    print(f"   10% → {p10['training_days']} days")
    check("doubling the share doubles the days",
          p10["training_days"] == round(ps["training_days"] * 2, 1),
          f"{ps['training_days']} → {p10['training_days']}")

    # One person spent a month in training; the share does not describe them.
    save_t({"year": 2026, "training_days": {WHO: 34}, "training_pct": 10})
    dov = plan(rows)
    pov = next(r for r in dov["people"] if r["name"] == WHO)
    other = next(r for r in dov["people"] if r["name"] != WHO
                 and r["availability"] > 0)
    print(f"   {WHO} set to 34 → {pov['training_days']}; "
          f"{other['name']} still on the share → {other['training_days']}")
    check("the figure wins for the person it is set for", pov["training_days"] == 34,
          str(pov["training_days"]))
    check("and is flagged as theirs rather than the share",
          pov["training_from_share"] is False)
    check("while everybody else stays on the share",
          other["training_from_share"] is True
          and other["training_days"] == round(other["availability"] * 10 / 100, 1),
          str(other["training_days"]))

    # Clearing it hands them back to the share.
    save_t({"year": 2026, "training_days": {}, "training_pct": 10})
    dcl = plan(rows)
    pcl = next(r for r in dcl["people"] if r["name"] == WHO)
    check("clearing the figure returns them to the share",
          pcl["training_from_share"] is True
          and pcl["training_days"] == p10["training_days"],
          str(pcl["training_days"]))
finally:
    save_t({"year": 2026, "training_days": before_training, "training_pct": 5})

back = plan(rows)
pb = next(r for r in back["people"] if r["name"] == WHO)
check("and the configured figures come back",
      pb["training_days"] == p["training_days"], str(pb["training_days"]))

print("\nA rejected ticket still took the time it took")
rows2 = [ticket(i, 2026) for i in range(10)] \
    + [ticket(700 + i, 2026, state="Closed Rejected") for i in range(10)]
d2 = plan(rows2)
p2 = next(r for r in d2["people"] if r["name"] == WHO)
check("both closed states are counted", p2["tickets"]["WCM"] == 20,
      str(p2["tickets"]["WCM"]))

print("\nPWR and KDB come in by team, and nothing else is dropped")
# Team is free text on the sheet, so the match is on whole words.
mixed = ([ticket(i, 2026) for i in range(10)]
         + [ticket(100 + i, 2026, sub="Something Else", who=WHO) for i in range(7)]
         + [ticket(200 + i, 2026, sub="Another Thing") for i in range(3)]
         + [ticket(300 + i, 2026, sub="Yet More") for i in range(4)]
         + [ticket(400 + i, 2026, sub="Mystery Work") for i in range(5)]
         + [ticket(500 + i, 2026, sub="") for i in range(2)])
for r in mixed[10:17]:
    r["Team"] = "PWR"
for r in mixed[17:20]:
    r["Team"] = "Other PWR"          # the word is there, inside a longer name
for r in mixed[20:24]:
    r["Team"] = "KDB Nordics"
for r in mixed[24:29]:
    r["Team"] = "Brand"              # routes nowhere, so it is Adhoc
for r in mixed[29:]:
    r["Team"] = "KDBX"               # not KDB: a word, not a prefix
dm = plan(mixed)
pm_ = next(r for r in dm["people"] if r["name"] == WHO)
print(f"   {pm_['tickets']}")
check("PWR, Other PWR and KDB Nordics land in one column",
      pm_["tickets"]["PWR/KDB"] == 14, str(pm_["tickets"]["PWR/KDB"]))
check("a team that merely starts the same does not",
      pm_["tickets"]["Adhoc"] == 7, str(pm_["tickets"]["Adhoc"]))
check("and work on any other team still routes by its sub-category",
      pm_["tickets"]["WCM"] == 10, str(pm_["tickets"]["WCM"]))

# The team owns its own work. A PWR ticket filed as Website Content
# Management is PWR's, not WCM's — reading the sub-category first was why
# the PWR column sat empty while WCM carried their tickets.
owned = ([ticket(i, 2026) for i in range(12)]
         + [ticket(600 + i, 2026) for i in range(5)])
for r in owned[12:]:
    r["Team"] = "PWR"
downed = plan(owned)
pw = next(r for r in downed["people"] if r["name"] == WHO)
print(f"   12 WCM on EEM, 5 WCM-shaped on PWR → {pw['tickets']}")
check("the team wins over the sub-category", pw["tickets"]["PWR/KDB"] == 5,
      str(pw["tickets"]["PWR/KDB"]))
check("so WCM keeps only the work that is actually WCM's",
      pw["tickets"]["WCM"] == 12, str(pw["tickets"]["WCM"]))
check("so every closed ticket is counted exactly once",
      dm["total_tickets"] == len(mixed), f"{dm['total_tickets']} of {len(mixed)}")
check("PWR/KDB is priced, so it is worth days",
      pm_["by_service"]["PWR/KDB"] > 0, str(pm_["by_service"]["PWR/KDB"]))
check("Adhoc has no rate, and says so rather than hiding",
      dm["unpriced"] == ["Adhoc"] and pm_["by_service"]["Adhoc"] == 0,
      str(dm["unpriced"]))
check("PWR/KDB and Adhoc are no longer called unrouted",
      set(dm["unmapped"]) == {"PM", "Local SEO"}, str(dm["unmapped"]))
pwr = next(s for s in dm["services"] if s["short"] == "PWR/KDB")
check("and the page is told how it is routed",
      pwr["routed_by"] == "team PWR or KDB", str(pwr["routed_by"]))

print("\nPWR and KDB are matched in the sub-category too, not only the team")
# ServiceNow files them in whichever column the exporting view carries, and
# the sheet people read shows them as a sub-category.
subbed = ([ticket(i, 2026) for i in range(10)]
          + [ticket(100 + i, 2026, sub="PWR") for i in range(6)]
          + [ticket(200 + i, 2026, sub="KDB Update") for i in range(4)]
          + [ticket(300 + i, 2026, sub="Random Thing") for i in range(5)])
for r in subbed[300 - 300 + 20:]:
    r["Team"] = "Brand"
dsub = plan(subbed)
psub = next(r for r in dsub["people"] if r["name"] == WHO)
print(f"   {psub['tickets']}")
check("a sub-category that says PWR or KDB lands in that column",
      psub["tickets"]["PWR/KDB"] == 10, str(psub["tickets"]["PWR/KDB"]))
check("and the rest still falls to Adhoc", psub["tickets"]["Adhoc"] == 5,
      str(psub["tickets"]["Adhoc"]))

print("\nA cell opens on what is behind it, and can be set by hand")
sid_cell = json.loads(urllib.request.urlopen(urllib.request.Request(
    f"{BASE}/api/upload-json", data=json.dumps({"rows": subbed}).encode(),
    headers={"Content-Type": "application/json"})).read())["session_id"]


def cell(service, person=WHO, sid=None):
    q = urllib.parse.urlencode({"year": 2026, "person": person, "service": service})
    return json.loads(urllib.request.urlopen(
        f"{BASE}/api/sessions/{sid or sid_cell}/capacity-plan/tickets?{q}").read())


def manual(service, days, person=WHO, note=None):
    req = urllib.request.Request(
        f"{BASE}/api/capacity-plan/manual",
        data=json.dumps({"year": 2026, "person": person, "service": service,
                         "days": days, "note": note}).encode(),
        headers={"Content-Type": "application/json"}, method="PUT")
    return json.loads(urllib.request.urlopen(req).read())


c = cell("Adhoc")
print(f"   Adhoc holds {c['total']}, from {[x['name'] for x in c['sub_categories']]}")
check("the cell lists exactly what the table counted", c["total"] == 5, str(c["total"]))
check("with the ticket numbers", c["rows"][0]["number"].startswith("CP"),
      c["rows"][0]["number"])
check("and what routed them there, which is how the next rule gets written",
      [x["name"] for x in c["sub_categories"]] == ["Random Thing"]
      and [x["name"] for x in c["teams"]] == ["Brand"],
      str(c["sub_categories"]))
check("a priced cell shows its rate", cell("WCM")["hours"] == 4.6,
      str(cell("WCM")["hours"]))
check("an unpriced one admits it has none", c["hours"] is None, str(c["hours"]))

try:
    manual("Adhoc", 70, note="Agreed with the team at the October review")
    dh = plan(subbed)
    ph = next(r for r in dh["people"] if r["name"] == WHO)
    print(f"   Adhoc set to 70 → allocated {ph['allocated_days']}")
    check("the typed figure replaces the computed one",
          ph["by_service"]["Adhoc"] == 70.0, str(ph["by_service"]["Adhoc"]))
    check("the row says which cells were typed", ph["manual"] == ["Adhoc"],
          str(ph["manual"]))
    check("and it counts towards the allocation",
          ph["allocated_days"] == round(psub["allocated_days"] + 70, 1),
          f"{psub['allocated_days']} → {ph['allocated_days']}")
    check("only that cell moves",
          ph["by_service"]["WCM"] == psub["by_service"]["WCM"],
          str(ph["by_service"]["WCM"]))
    check("and the dialog knows it is set", cell("Adhoc")["manual"] == 70.0,
          str(cell("Adhoc")["manual"]))
    check("the reason is kept with the figure",
          cell("Adhoc")["note"] == "Agreed with the team at the October review",
          str(cell("Adhoc")["note"]))
    check("and reaches the table, so the cell can say why",
          ph["manual_notes"]["Adhoc"].startswith("Agreed with the team"),
          str(ph.get("manual_notes")))
finally:
    manual("Adhoc", None)

dc = plan(subbed)
pc = next(r for r in dc["people"] if r["name"] == WHO)
check("clearing it goes back to the rate",
      pc["by_service"]["Adhoc"] == 0.0 and pc["manual"] == [], str(pc["manual"]))
check("and takes the note with it, a reason for a vanished number explaining nothing",
      cell("Adhoc")["note"] is None, str(cell("Adhoc")["note"]))

print("\nServices with no route carry nothing")
check("they are named rather than hidden",
      set(d["unmapped"]) == {"PM", "Local SEO"}, str(d["unmapped"]))
for short in d["unmapped"]:
    svc = next(s for s in d["services"] if s["short"] == short)
    assert svc["days"] == 0 and svc["actual"] == 0, short
check("and they claim no days and no tickets", True)
check("every service is returned, routed or not",
      [s["short"] for s in d["services"]]
      == ["WCM", "DEA", "CP-GD", "PM", "Local SEO", "PWR/KDB", "Adhoc"],
      str([s["short"] for s in d["services"]]))

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
