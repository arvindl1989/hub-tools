"""Working-day maths and per-ticket pricing.

Runs in-process — no server needed:  python test_effort_working_days.py
"""
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import main  # noqa: E402
import user_activity_config as ua_config  # noqa: E402

ok = 0


def check(name, got, want):
    global ok
    good = got == want
    print(f"  {'PASS' if good else 'FAIL'}  {name}: got {got!r}, want {want!r}")
    assert good, name
    ok += 1


T = pd.Timestamp

print("working_days_between — the start day is not counted")
check("same day", main.working_days_between(T("2026-01-05"), T("2026-01-05")), 0)
check("Mon to Tue", main.working_days_between(T("2026-01-05"), T("2026-01-06")), 1)

print("\nweekends")
# 2 Jan 2026 is a Friday; 5 Jan the Monday after.
check("Fri to Mon", main.working_days_between(T("2026-01-02"), T("2026-01-05")), 1)
check("Fri to Sat", main.working_days_between(T("2026-01-02"), T("2026-01-03")), 0)
check("Fri to next Fri", main.working_days_between(T("2026-01-02"), T("2026-01-09")), 5)

print("\nholidays (Diwali falls on Monday 9 November 2026)")
check("Fri to the Diwali Monday", main.working_days_between(T("2026-11-06"), T("2026-11-09")), 0)
check("Fri to the Tuesday after", main.working_days_between(T("2026-11-06"), T("2026-11-10")), 1)
# Pongal, Thu 15 Jan 2026.
check("Wed to Fri across Pongal", main.working_days_between(T("2026-01-14"), T("2026-01-16")), 1)

print("\nodd inputs")
check("closed before created", main.working_days_between(T("2026-01-09"), T("2026-01-05")), 0)
check("missing end", main.working_days_between(T("2026-01-05"), None), None)
check("missing start", main.working_days_between(None, T("2026-01-05")), None)

print("\nadd_working_days skips holidays too")
# 2 Nov 2026 is a Monday; ten working days later crosses Diwali on the 9th.
check("+10 working days over Diwali",
      str(main.add_working_days(T("2026-11-02"), 10).date()), "2026-11-16")
check("day 1 is the start day",
      str(main.add_working_days(T("2026-11-02"), 1).date()), "2026-11-02")
check("a start on a holiday moves to the next working day",
      str(main.add_working_days(T("2026-11-09"), 1).date()), "2026-11-10")

print("\nper-ticket estimates come from the ticket's own sub-category")
df = main.process_dataframe(pd.DataFrame([
    {"Number": "1", "Requested by": "A", "Created": "2026-01-05",
     "Sub-Category": "Demand Creation – Global"},
    {"Number": "2", "Requested by": "A", "Created": "2026-01-05",
     "Sub-Category": "Email – Local"},
    {"Number": "3", "Requested by": "A", "Created": "2026-01-05",
     "Sub-Category": "Retention – Activations"},
    {"Number": "4", "Requested by": "A", "Created": "2026-01-05",
     "Sub-Category": "Website Content Management"},
    {"Number": "5", "Requested by": "A", "Created": "2026-01-05",
     "Sub-Category": "Content Production - Graphic Design"},
    {"Number": "6", "Requested by": "A", "Created": "2026-01-05", "Sub-Category": None},
]))
hours = dict(zip(df["sub_category"].fillna("(none)"), df["est_hours"]))
slas = dict(zip(df["sub_category"].fillna("(none)"), df["sla_wd"]))
check("Demand Creation is 20 h, not the 12.7 blend",
      round(hours["Demand Creation – Global"], 2), 20.0)
check("Email – Local is 7.27 h", round(hours["Email – Local"], 2), 7.27)
check("Retention is 20 h", round(hours["Retention – Activations"], 2), 20.0)
check("WCM is 5 h", round(hours["Website Content Management"], 2), 5.0)
check("CP is 6.15 h", round(hours["Content Production – Graphic Design"], 2), 6.15)
check("no sub-category gets no estimate", pd.isna(hours["(none)"]), True)
check("Demand Creation SLA is 30 wd", slas["Demand Creation – Global"], 30)
check("Email SLA is 7 wd", slas["Email – Local"], 7)
check("WCM SLA is 10 wd", slas["Website Content Management"], 10)

print("\nthe blended DEA rate is never applied to a priced ticket")
blend = round(main.BANDWIDTH_HOURS_PER_DAY
              / main.BANDWIDTH_RATES["Demand Engagement Activations"], 2)
check("the blend exists and is 12.7", blend, 12.7)
check("no ticket carries it",
      any(round(h, 2) == blend for h in df["est_hours"].dropna()), False)

print("\nhours come from the Rates & SLA store, not from a copy")
check("hours per day is the config's", main.BANDWIDTH_HOURS_PER_DAY, ua_config.HOURS_PER_DAY)
original = main.BANDWIDTH_RATES["Website Content Management"]
try:
    main.BANDWIDTH_RATES["Website Content Management"] = 2.0   # i.e. 4 h/ticket
    again = main.process_dataframe(pd.DataFrame([
        {"Number": "9", "Requested by": "A", "Created": "2026-01-05",
         "Sub-Category": "Website Content Management"}]))
    check("editing the rate changes the estimate", round(float(again["est_hours"].iloc[0]), 2), 4.0)
finally:
    main.BANDWIDTH_RATES["Website Content Management"] = original

print(f"\n{ok} checks passed")
