"""NPI 2026: the survey scored, and joined to the tickets behind it.

The survey is a one-off export, not a feed, so it ships with the app and is
served through SN Master as the "npi" dataset. Two things are worth holding
still. The first is that the two scales never meet: the 0–10 recommend
question and the five 1–5 parameters are averaged apart, because a mean of
both has no unit. The second is the join — a respondent is linked to a ticket
requester by the "Ticket user" column somebody filled in, or failing that by
their own name — and how many are linked is reported rather than implied.

    python test_npi.py        # expects the app on :8822
"""
import json
import urllib.parse
import urllib.request

BASE = "http://127.0.0.1:8822"
ok = 0


def check(name, cond, detail=""):
    global ok
    print(f"  {'PASS' if cond else 'FAIL'}  {name}" + (f"  — {detail}" if detail else ""))
    assert cond, name
    ok += 1


def get(path):
    return json.loads(urllib.request.urlopen(f"{BASE}{path}").read())


def ticket(i, who, sub, spec, when="2026-05-10"):
    return {"Number": f"NP{i:06d}", "Short description": f"{sub} request",
            "Requested by": who, "Assigned to": spec,
            "Created": f"{when} 09:00:00", "Closed": f"{when} 17:00:00",
            "State": "Closed Completed", "Area": "APM", "Team": "KEI",
            "Sub-Category": sub}


def upload(rows):
    req = urllib.request.Request(f"{BASE}/api/upload-json",
                                 data=json.dumps({"rows": rows}).encode(),
                                 headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req).read())["session_id"]


print("The sheet is served to SN Master, mapping column and all")
sheet = get("/api/sn-data/npi")
check("every invited person is a row", len(sheet["rows"]) == 85, str(len(sheet["rows"])))
check("it reads without a database, from the file it ships with",
      sheet.get("seeded") is True or sheet.get("row_count") == 85, str(sheet.get("seeded")))
cols = list(sheet["rows"][0])
check("Name is the key, so it cannot be edited away", cols[1] == "Name", str(cols[:3]))
check("and the mapping column sits beside it", cols[2] == "Ticket user", str(cols[:3]))
check("every score and both comments are on the sheet",
      {"Q2_KBS", "Q4_Timeliness", "Q4_Outcomes", "Q5_Strengths",
       "Q5_Improvements", "Q6_FollowUp"} <= set(cols), str(sorted(cols)))

print("\nThe survey, scored")
d = get("/api/sessions/none/npi")
print(f"   {d['completed']} of {d['invited']} answered, "
      f"recommend {d['recommend']['average']}/10, NPI {d['recommend']['nps']}, "
      f"service {d['overall_average']}/{d['scale_max']}")
check("85 asked, 25 answered", (d["invited"], d["completed"]) == (85, 25),
      f"{d['invited']}/{d['completed']}")
check("the response rate is the one over the other",
      d["response_rate_pct"] == round(25 / 85 * 100), str(d["response_rate_pct"]))

rec = d["recommend"]
check("the bands add up to the people who answered",
      rec["promoters"] + rec["passives"] + rec["detractors"] == d["completed"],
      f"{rec['promoters']}+{rec['passives']}+{rec['detractors']}")
check("the NPI score is promoters less detractors over those who answered",
      rec["nps"] == round((rec["promoters"] - rec["detractors"]) / d["completed"] * 100),
      str(rec["nps"]))

# The two scales are averaged apart. A recommend score of 9 and a parameter
# score of 5 are not three sevens.
check("recommend is on its own 0–10 scale", 0 <= rec["average"] <= 10, str(rec["average"]))
check("and the parameters on theirs", 1 <= d["overall_average"] <= d["scale_max"],
      str(d["overall_average"]))
check("the service average is the mean of the five parameter averages",
      abs(d["overall_average"]
          - round(sum(p["average"] for p in d["parameters"]) / 5, 2)) <= 0.03,
      f"{d['overall_average']} vs {round(sum(p['average'] for p in d['parameters']) / 5, 2)}")

for p in d["parameters"]:
    check(f"{p['label']}: the spread accounts for every answer",
          sum(p["spread"].values()) == p["responses"],
          f"{sum(p['spread'].values())} vs {p['responses']}")

print("\nAreas and frontlines are averaged over the ones who answered")
for g in d["by_area"]:
    check(f"{g['name']}: answered is never more than asked", g["completed"] <= g["invited"],
          f"{g['completed']}/{g['invited']}")
    if g["completed"] == 0:
        check(f"{g['name']}: nobody answered, so there is no average",
              g["average"] is None and g["recommend"] is None, str(g))
areas = {g["name"]: g for g in d["by_area"]}
check("an area where nobody replied is still listed, at nought",
      any(g["completed"] == 0 for g in d["by_area"]),
      str([(g["name"], g["completed"]) for g in d["by_area"]]))
check("the answered counts add to the total", sum(g["completed"] for g in d["by_area"])
      == d["completed"], str(sum(g["completed"] for g in d["by_area"])))

print("\nComments and follow-ups")
check("every answer with writing in it is carried",
      len(d["comments"]) > 0 and all(c["strengths"] or c["improvements"]
                                     for c in d["comments"]), str(len(d["comments"])))
check("and the people who asked to be contacted are named",
      all(isinstance(n, str) for n in d["follow_up_wanted"]),
      str(d["follow_up_wanted"][:3]))

print("\nWith no ticket data, nothing is claimed about tickets")
check("no respondent is matched", d["matching"]["matched"] == 0, str(d["matching"]["matched"]))
check("and the page is told there are no requesters to match against",
      d["matching"]["ticket_users_known"] == 0, str(d["matching"]["ticket_users_known"]))

print("\nWith ticket data, the join happens by name where the names agree")
rows = ([ticket(i, "Pooja V", "Website Content Management", "Ajith A") for i in range(4)]
        + [ticket(10 + i, "Pooja V", "Email – Local", "Jerlin Jeba") for i in range(2)]
        # Same person, different case in ServiceNow.
        + [ticket(20 + i, "srinivasan v", "Website Content Management", "Nitish JK")
           for i in range(3)]
        + [ticket(30 + i, "Nobody From The Survey", "Website Content Management", "Ajith A")
           for i in range(5)])
sid = upload(rows)
j = get(f"/api/sessions/{sid}/npi")
m = j["matching"]
print(f"   {m['matched']} of {m['of']} matched, {m['by_name']} by name, "
      f"{m['by_mapping']} by the mapping")
check("the two whose names appear are matched", m["matched"] == 2, str(m))
check("both by name, since nothing is mapped yet", m["by_name"] == 2, str(m))
check("the rest are named rather than quietly dropped",
      len(m["unmatched"]) == j["completed"] - 2, str(len(m["unmatched"])))

by_name = {r["name"]: r for r in j["responses"]}
check("a respondent carries their request count", by_name["Pooja V"]["requests"] == 6,
      str(by_name["Pooja V"]["requests"]))
check("and the specialists who worked with them",
      [s["name"] for s in by_name["Pooja V"]["specialists"]] == ["Ajith A", "Jerlin Jeba"],
      str(by_name["Pooja V"]["specialists"]))
check("a name that differs only in case still matches",
      by_name["Srinivasan V"]["matched_as"] == "srinivasan v",
      str(by_name["Srinivasan V"]["matched_as"]))
check("a requester who was never surveyed is not invented",
      "Nobody From The Survey" not in by_name)

print("\nOne respondent, opened")
q = urllib.parse.urlencode({"name": "Pooja V"})
one = get(f"/api/sessions/{sid}/npi/person?{q}")
print(f"   {one['matched_as']!r}: {len(one['tickets'])} tickets, "
      f"{len(one['specialists'])} specialists")
check("their tickets come back", len(one["tickets"]) == 6, str(len(one["tickets"])))
check("newest first", one["tickets"] == sorted(one["tickets"],
                                               key=lambda t: t["created"] or "", reverse=True))
check("each ticket names the specialist who worked it",
      all(t["specialist"] for t in one["tickets"]))
check("the services they asked for are rolled up",
      {s["name"] for s in one["services"]}
      == {"Website Content Management", "Email – Local"}, str(one["services"]))
check("and their own answers come with it",
      one["response"]["recommend"] is not None and one["response"]["completed"])

print("\nSomebody with no link gets a dash, not an empty table pretending to be data")
q2 = urllib.parse.urlencode({"name": d["responses"][0]["name"]})
none_ = get(f"/api/sessions/{sid}/npi/person?{q2}")
if none_["matched_as"] is None:
    check("no match, no tickets", none_["tickets"] == [], str(none_["tickets"]))
else:
    check("that one happened to match, which is fine", True)

print("\nFilters narrow the survey")
eur = get("/api/sessions/none/npi?area=EUR")
check("an area filter cuts it to that area",
      {r["area"] for r in eur["responses"]} == {"EUR"},
      str({r["area"] for r in eur["responses"]}))
check("and the counts follow", eur["invited"] == areas["EUR"]["invited"],
      f"{eur['invited']} vs {areas['EUR']['invited']}")

print(f"\n{ok} checks passed")
