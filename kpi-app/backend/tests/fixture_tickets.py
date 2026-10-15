"""Ticket data shaped like the ServiceNow export, for the User Activity page.

The point of this fixture is the awkward cases the real estate has and a tidy
one would not: users who have never touched a service, frontlines that stopped
using one months ago, a frontline that only ever used a single service, and an
area with one frontline in it. Those are what the utility table and the heat map
are for, so they have to be in the data or the page is being checked empty.
"""
import random
from datetime import datetime, timedelta

SERVICES = [
    "Website Content Management",
    "Demand Creation – Global",
    "Email – Local",
    "Retention – Activations",
    "Content Production – Graphic Design",
]

FRONTLINES = {
    "AME":    ["USCA", "USMX"],
    "APM":    ["KANZ", "KEI", "KMTA", "KSEA"],
    "EUR":    ["DACH", "EEM", "FBL", "GIN", "ITIB", "NORD"],
    "GCN":    ["GCN", "BRAND"],
    # The long one, which is what forced the column labels to be abbreviated.
    "GLOBAL": ["Customer Marketing", "GC", "OTHER", "PWR"],
}

FIRST = ["Anna", "Marco", "Priya", "Tom", "Lena", "Raj", "Sofia", "Nils", "Mei", "Pablo",
         "Ines", "Karl", "Yuki", "Omar", "Elin", "Jonas", "Ravi", "Clara", "Hugo", "Aino"]
LAST = ["Virtanen", "Rossi", "Nair", "Fischer", "Berg", "Kumar", "Lopez", "Hansen",
        "Chen", "Garcia", "Silva", "Weber", "Tanaka", "Haddad", "Lind", "Olsen"]


def build(seed=11):
    rnd = random.Random(seed)
    end = datetime(2026, 9, 30)

    people = []
    for area, fls in FRONTLINES.items():
        for fl in fls:
            for _ in range(rnd.randint(2, 5)):
                people.append({
                    "name": f"{rnd.choice(FIRST)} {rnd.choice(LAST)} {len(people) + 1}",
                    "team": fl,
                    "area": area,
                })

    rows = []
    n = 0
    for p in people:
        # What this person has ever asked for. Most use one or two services;
        # nobody is given all five, so "users who haven't used X" is never empty.
        offered = rnd.sample(SERVICES, rnd.randint(1, 3))
        # How recently they were last seen, spread across the three lifecycle
        # buckets so Active/Regular/Dormant all have something in them.
        recency = rnd.choice([3, 12, 25, 40, 65, 88, 120, 200, 320])
        for service in offered:
            # A service this person has drifted away from, even while they are
            # active elsewhere — the case the utility table is meant to catch.
            drift = rnd.choice([0, 0, 0, 60, 150])
            for _ in range(rnd.randint(1, 9)):
                n += 1
                age = recency + drift + rnd.randint(0, 60)
                created = end - timedelta(days=age, hours=rnd.randint(0, 20))
                rows.append({
                    "Number": f"PC{2000000 + n}",
                    "Short description": f"{service} request from {p['team']}",
                    "Requested by": p["name"],
                    "Assigned to": rnd.choice(["Ajith A", "Akshaya Praveen", "Divya S", "Jerlin Jeba"]),
                    "Created": created.strftime("%Y-%m-%d %H:%M:%S"),
                    "Closed": (created + timedelta(days=rnd.randint(1, 20))).strftime("%Y-%m-%d %H:%M:%S"),
                    "State": "Closed Completed",
                    "Area": p["area"],
                    "Team": p["team"],
                    "Sub-Category": service,
                })
    rnd.shuffle(rows)
    return rows


if __name__ == "__main__":
    rows = build()
    print(len(rows), "rows,", len({r["Requested by"] for r in rows}), "users,",
          len({r["Team"] for r in rows}), "frontlines")
