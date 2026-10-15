"""The seven cases the effort and SLA brief asks for, in its own order.

The other effort suites each prove one mechanism in depth. This one walks the
acceptance list end to end through the API, so a pass here is the brief being
met rather than the parts of it working separately.

    python test_effort_brief.py        # expects the app on http://127.0.0.1:8822
"""
import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

import pandas as pd

# Case 4 is working-day arithmetic, which has no endpoint — it is checked
# against the same function the server calls.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import main  # noqa: E402

BASE = "http://127.0.0.1:8822"
ok = 0


def check(name, cond, detail=""):
    global ok
    print(f"  {'PASS' if cond else 'FAIL'}  {name}" + (f"  — {detail}" if detail else ""))
    assert cond, name
    ok += 1


def get(path):
    return json.loads(urllib.request.urlopen(f"{BASE}{path}").read())


def put(path, body):
    req = urllib.request.Request(f"{BASE}{path}", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"}, method="PUT")
    return json.loads(urllib.request.urlopen(req).read())


def upload(rows):
    req = urllib.request.Request(f"{BASE}/api/upload-json",
                                 data=json.dumps({"rows": rows}).encode(),
                                 headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req).read())["session_id"]


def metrics(sid, **p):
    q = urllib.parse.urlencode({k: v for k, v in p.items() if v})
    return get(f"/api/sessions/{sid}/user-metrics{'?' + q if q else ''}")


def ticket(n, service, who="U1", team="KEI", area="APM", created="2026-06-01 09:00:00",
           closed="2026-06-03 17:00:00", who_handles="Ajith A", state="Closed Completed"):
    return {"Number": f"BR{n:06d}", "Short description": "r", "Requested by": who,
            "Assigned to": who_handles, "Created": created, "Closed": closed,
            "State": state, "Area": area, "Team": team, "Sub-Category": service}


# ── 1 ────────────────────────────────────────────────────────────────────────
print("1. A Demand Creation ticket is 20 h and an Email – Local one 7.27 h, "
      "never the 12.7 blend")
rows = [ticket(1, "Demand Creation – Global"), ticket(2, "Email – Local", who="U2"),
        ticket(3, "Retention – Activations", who="U3")]
m = metrics(upload(rows))
# The three are shown under the DEA roll-up, so the proof is the total: 20 +
# 7.27 + 20 = 47.27, where three tickets at the blend would be 38.1.
total = m["volume"]["est_hours"]
print(f"   total {total} h over 3 tickets")
check("the three price to 47.3 h, not the blend's 38.1", round(total, 1) == 47.3, f"{total} h")

# ── 2 ────────────────────────────────────────────────────────────────────────
print("\n2. KEI's 37 WCM / 10 Email / 1 CP: ticket mix 77/21/2, hours mix its own")
rows = [ticket(100 + n, "Website Content Management", who=f"K{n % 5}") for n in range(37)]
rows += [ticket(200 + n, "Email – Local", who=f"K{n % 3}") for n in range(10)]
rows += [ticket(300, "Content Production – Graphic Design", who="K1")]
m = metrics(upload(rows))
kei = next(r for r in m["activity_groups"]["by_frontline"] if r["name"] == "KEI")
mix = sorted((round(v / kei["requests"] * 100) for v in kei["breakdown"].values()), reverse=True)
hmix = sorted((round(v / kei["est_hours"] * 100) for v in kei["breakdown_hours"].values()),
              reverse=True)
want_hours = 37 * 5 + 10 * (8 / 1.1) + 6.1538
print(f"   tickets {mix}   hours {hmix}   total {kei['est_hours']} h")
check("ticket mix is 77/21/2", mix[:3] == [77, 21, 2], str(mix[:3]))
check("hours come from the sub-service rates",
      abs(kei["est_hours"] - want_hours) < 1, f"{kei['est_hours']} vs {round(want_hours, 1)}")
check("the hours mix is not the ticket mix", hmix[:3] != mix[:3], str(hmix[:3]))

# ── 3 ────────────────────────────────────────────────────────────────────────
print("\n3. Service breadth is the same number in both modes")
# Breadth counts people against services, so there is only one value in the
# payload and the toggle cannot reach it. The check is that nothing hours-shaped
# exists to be swapped in by mistake.
area = m["activity_groups"]["by_area"][0]
check("one breadth figure, not two", area.get("utility_pct") is not None
      and "utility_pct_hours" not in area and "breadth_hours" not in area,
      f"{area['name']} {area['utility_pct']}%")
check("hours sit alongside it, in their own field", "est_hours" in area,
      f"{area['est_hours']} h")

# ── 4 ────────────────────────────────────────────────────────────────────────
print("\n4. Friday to the following Monday is one working day; a holiday on that "
      "Monday makes it none")
T = pd.Timestamp
check("Fri 2 Jan to Mon 5 Jan 2026", main.working_days_between(T("2026-01-02"), T("2026-01-05")) == 1)
# Diwali 2026 falls on Monday 9 November, so the same shape with a holiday in it.
check("Fri 6 Nov to the Diwali Monday",
      main.working_days_between(T("2026-11-06"), T("2026-11-09")) == 0)
check("and on to the Tuesday", main.working_days_between(T("2026-11-06"), T("2026-11-10")) == 1)
check("closed the day it was raised", main.working_days_between(T("2026-06-01"), T("2026-06-01")) == 0)

# ── 5 ────────────────────────────────────────────────────────────────────────
# Case 5 was SLA breach counting, withdrawn on 15 October along with the rest
# of the SLA columns — the page does not report compliance any more, so there
# is nothing left to assert. working_days_between, which the case rested on, is
# still covered by case 4 above and by test_effort_working_days.py; the email
# tracker's due dates still lean on it, and test_email_sla_calendar.py checks
# those against it.
print("\n5. (withdrawn — SLA compliance is no longer shown on the page)")

# ── 6 ────────────────────────────────────────────────────────────────────────
print("\n6. 100 estimated hours over 10 working days reads 125%, uncapped")
# 1-12 June 2026 is ten working days; five Demand Creation tickets are 100 h.
rows = [ticket(500 + n, "Demand Creation – Global", who="U1", created="2026-03-02 10:00:00",
               closed=f"2026-06-{n + 2:02d} 15:00:00") for n in range(5)]
rows.append(ticket(599, "Website Content Management", who="U2", created="2026-06-03 09:00:00",
                   closed=None, state="Assigned"))
m = metrics(upload(rows), date_from="2026-06-01", date_to="2026-06-12")
sp = next(r for r in m["activity_groups"]["by_specialist"] if r["name"] == "Ajith A")
print(f"   {sp['delivered_hours']} h of {sp['available_hours']} h = {sp['capacity_pct']}%")
check("ten working days at eight hours", sp["available_hours"] == 80.0, str(sp["available_hours"]))
check("reads 125%", sp["capacity_pct"] == 125, f"{sp['capacity_pct']}%")

# ── 7 ────────────────────────────────────────────────────────────────────────
print("\n7. Editing an Hours / Ticket value in Rates & SLA moves every effort figure")
# Rates are stored as tickets per day; 8 / rate is the hours. Doubling WCM's
# hours means halving its rate.
before = get("/api/bandwidth-rates")
sid = upload([ticket(600 + n, "Website Content Management", who=f"U{n}") for n in range(4)])
was = metrics(sid)["volume"]["est_hours"]
try:
    put("/api/bandwidth-rates", {**before, "Website Content Management": before[
        "Website Content Management"] / 2})
    now = metrics(sid)["volume"]["est_hours"]
finally:
    put("/api/bandwidth-rates", before)
restored = metrics(sid)["volume"]["est_hours"]
print(f"   {was} h → {now} h → {restored} h, on the same uploaded session")
check("doubling the estimate doubles the hours", round(now, 1) == round(was * 2, 1),
      f"{was} → {now}")
check("and the page follows the panel back", round(restored, 1) == round(was, 1),
      f"{restored} vs {was}")

print(f"\n{ok} checks passed")
