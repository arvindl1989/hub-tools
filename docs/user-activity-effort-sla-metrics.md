# Estimated effort — every new metric on the User Activity page

What each number means, which window it is measured over, and which value in
the **Rates & SLA** panel it moves with. Nothing here is logged time: every hour
is a standard per-ticket estimate.

## The three scopes

| Scope | What it covers | Used for |
|---|---|---|
| `scoped` | Requests **raised** between the two dates in the filter | Volume, mix, who asked |
| `as_of` | Everything raised **up to** the end of the range, however long ago | Recency, lifecycle, open backlog |
| `lifetime` | Every request the dimension filters allow, whenever it happened | The user list, "has ever used" |
| `closed in window` | Tickets whose **Closed** date falls in the range, whenever they were raised | Capacity utilisation |

`period_end` is the end of the date filter, capped at the newest request in the
data — a range that ends in the future cannot make the most recent request look
old.

## Per ticket (Step 2)

| Field | Definition | Scope | Depends on |
|---|---|---|---|
| `est_hours` | `8 ÷ Tickets per Day` of the ticket's **own** Sub-Category | per ticket | Hours / Ticket |
| `sla_wd` | Target working days of the ticket's own Sub-Category. Still derived, no longer shown anywhere | per ticket | SLA (working days) |

Sub-service first, always. A Demand Creation ticket is 20 h and an Email – Local
ticket 7.27 h; the 12.7 h blend behind "Demand Engagement Activations" is never
applied to a ticket whose sub-category is known, because it would understate one
by 7.3 h and overstate the other by 5.4 h in opposite directions. A ticket with
a missing or unrecognised sub-category gets **no** estimate rather than a guess,
and the count is logged at parse time.

Pricing is redone every time the page is read, so editing a rate in the panel
lands without re-uploading the export.

## Effort views (Step 3) — the "Tickets | Est. hours" toggle

| Metric | Definition | Scope | Depends on |
|---|---|---|---|
| Est. hours (window) | Σ `est_hours` of requests raised in the window | `scoped` | Hours / Ticket |
| Est. h / user | Σ `est_hours` ÷ users in the group | `scoped` | Hours / Ticket |
| Request mix in hours (`breakdown_hours`) | Σ `est_hours` per service within the row | `scoped` | Hours / Ticket |
| Heat-map cell hours | Σ `est_hours` for that frontline × service | `scoped` | Hours / Ticket |
| Heat-map shading in hours (`band_hours`) | Fixed bands 1–25 / 26–100 / 101–250 / 251–750 / 751+ | `scoped` | Hours / Ticket, `HEATMAP_HOUR_BANDS` |
| Top requestors by hours (`top_share_hours_pct`) | Share of all estimated hours from the busiest 10% of users **by hours** | `scoped` | Hours / Ticket |

The toggle does **not** touch the Utility rate, lifecycle, New users or the
user list. Those are yes/no or date questions and effort has no bearing on them
— there is one utility figure in the payload, not an hours twin.

## Specialist capacity (Step 4)

| Metric | Definition | Scope | Depends on |
|---|---|---|---|
| `delivered_tickets` | Tickets the specialist closed in the window | closed in window | — |
| `delivered_hours` | Σ `est_hours` of those tickets | closed in window | Hours / Ticket |
| `working_days` | Weekdays in the range, public holidays excluded | the range | holiday calendar |
| `available_hours` | `working_days × 8` | the range | `HOURS_PER_DAY` |
| **Capacity utilisation** | `delivered_hours ÷ available_hours` | closed in window ÷ the range | Hours / Ticket |

Never capped: 10 working days and 100 estimated hours reads 125%, because over
100% means either genuine overload or estimates set too high for that person's
mix, and flattening it hides both.

Credit falls on the **close** date, not the raise date: a ticket raised in March
and finished in September is September's delivery. Volume and utilisation
therefore describe different ticket sets, and the page says so.

**Assumption to replace:** available hours assume full time with no leave — the
ServiceNow export carries no absence or part-time data, so a person who took
leave reads high. A feed of approved leave days, or contracted hours per person
per week, would replace it. Marked `TODO` in `_available_hours()`.

## SLA compliance — withdrawn 15 October

Built, shipped, and taken back off the page at your request: SLA met %, Open &
late and the working-day median are gone from By Specialist and from the
Service Utility Rate board, and the `sla` fields are out of the payload. By
Specialist is back to Capacity utilisation, median **calendar** days and Open.

The working-day machinery stays, because other things lean on it: capacity uses
the working-day count, and the email tracker computes its due dates from the
same calendar. `git show ac605b5 594fe34` has the removed work if it is ever
wanted back.

## The working calendar

Weekends plus the hub's public holidays, 2024–2026 (Tamil Nadu). The 2026 list
is: 1 Jan, 15 Jan, 26 Jan, 14 Apr, 23 Apr, 1 May, 15 Aug, 14 Sep, 2 Oct, 19 Oct,
9 Nov, 25 Dec.

`working_days_between(start, end)` does not count the start day, so a ticket
raised and closed the same day is 0 working days. The email tracker now reads
the same calendar from `/api/holidays` and the same targets from
`/api/sla-rules`: it was skipping weekends only, which made every due date
before a holiday a day early.

## Config

All of it lives in `kpi-app/backend/user_activity_config.py` and is echoed to
the browser under `config`, so no threshold is written twice:
`HOURS_PER_DAY = 8`, `WORKING_DAYS = Mon–Fri`, `UTILISATION_BASIS = "closed"`,
`EFFORT_LABEL = "Estimated hours"`, `HEATMAP_HOUR_BANDS`, `MIN_GROUP_SIZE_FOR_PCT = 5`.
The per-service hours and SLA targets are **read from the Rates & SLA store**,
never copied. The holiday list stays in `main.py` beside the working-day maths.

## Tests

`python kpi-app/backend/tests/run_all.py` — 11 suites against a live instance.
The effort ones are `test_effort_working_days.py`, `test_effort_views.py`,
`test_effort_capacity.py` and `test_effort_brief.py` (the brief's acceptance
cases, less the withdrawn SLA one). `test_sub_service_reach.py` covers the
Demand Engagement split, and `test_email_sla_calendar.py` checks the tracker's
due dates against the dashboard's.
