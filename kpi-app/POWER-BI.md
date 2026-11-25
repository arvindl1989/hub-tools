# The Marketing Hub model in Power BI

The app builds a star schema in which **every definition is already a column**.
Power BI never re-derives anything, so a figure in a report and the same figure
on a page cannot drift apart. That is the whole point: a second front end is
only worth having if it agrees with the first.

```
GET /api/powerbi/model.xlsx            one workbook, six sheets
GET /api/powerbi/<table>.csv           one sheet, if the flow prefers files
```

Both take an optional `?sid=` to build from a specific upload instead of the
live ticket source.

---

## Wiring it to the flow you already have

Power Automate drops the ServiceNow export in SharePoint on a schedule. Add two
actions to that same flow, after the download:

1. **HTTP** — `GET https://<the app>/api/powerbi/model.xlsx`
2. **Create file** (SharePoint) — same folder as the ServiceNow export,
   file name `marketing-hub-model.xlsx`, content = the HTTP step's **Body**

Then in Power BI Desktop: **Get data → SharePoint folder** (or Web, pointed at
the file), pick the six sheets, publish, and set a scheduled refresh that runs
after the flow. Nothing else to install — no gateway, no database credentials
in Power BI.

If the flow's HTTP action is not available on your plan, the `.csv` endpoints
do the same thing one table at a time and can be fetched with a plain
**Get file content using path** against a URL.

---

## The six sheets

| Sheet | Grain | What it is for |
|---|---|---|
| `fact_ticket` | one row per ticket | everything the Dashboard and User Activity count |
| `dim_person` | person × year | working, holiday, cadence, training and **productive** days |
| `dim_service` | service × year | goal and actual hours a ticket is reckoned to take |
| `dim_date` | one row per day, 2024–27 | the working-day calendar every day count is measured on |
| `fact_npi` | one row per surveyed person | the NPI 2026 survey, scored |
| `dim_setting` | key/value | the rules that produced the numbers, so a report can state them |

### Relationships

```
dim_date[date]              1 → *  fact_ticket[created]      (active)
dim_date[date]              1 → *  fact_ticket[closed]       (inactive — see below)
dim_service[capacity_column] 1 → * fact_ticket[capacity_column]   *
dim_person[person]          1 → *  fact_ticket[specialist]        *
fact_npi[ticket_user]       1 → *  fact_ticket[requested_by]
```

\* `dim_service` and `dim_person` are keyed on **column × year**, so either make
a composite key column in Power Query (`capacity_column & "|" & year`) or treat
them as lookup tables and use `LOOKUPVALUE`. The composite key is tidier.

Mark `dim_date` as the date table. Two date relationships to one fact is normal:
keep `created` active and reach the other with `USERELATIONSHIP`.

---

## The columns that carry the definitions

These are the ones that exist so Power BI does not have to think:

| Column | What was decided before it got here |
|---|---|
| `service` | the display service — Demand Engagement Activations is a roll-up of three sub-categories |
| `capacity_column` | which capacity column it counts in: **team beats sub-category**, so PWR and KDB keep their own work whatever it is filed as, and anything matching nothing lands in Adhoc |
| `is_closed` | closed means **Closed Completed + Closed Rejected** — a rejected ticket still took the time it took |
| `effort_hours` / `effort_days` | priced at the rate for the year the ticket **closed** in, falling back to the year it was raised for work still open |
| `sla_due` | created plus the SLA's working days, against the real holiday calendar |
| `sla_breached` | only where there is a due date to miss, and the work is finished or the date has passed — an open ticket inside its window is not a breach |
| `productive_days` (dim_person) | working days, less holidays, less the cadence share, less training |
| `has_left` (dim_person) | excluded from anything that suggests somebody to contact, still counted everywhere the past is described |

---

## Measures

Because the hard part is already a column, these are the whole of it.

```dax
Requests          = COUNTROWS ( fact_ticket )
Closed            = CALCULATE ( [Requests], fact_ticket[is_closed] = TRUE )
Open              = CALCULATE ( [Requests], fact_ticket[is_open] = TRUE )

Effort days       = SUM ( fact_ticket[effort_days] )
Productive days   = SUM ( dim_person[productive_days] )
Utility rate      = DIVIDE ( [Effort days], [Productive days] )

SLA breached      = CALCULATE ( [Requests], fact_ticket[sla_breached] = TRUE )
SLA met %         = DIVIDE ( [Requests] - [SLA breached], [Requests] )
Avg turnaround    = AVERAGE ( fact_ticket[turnaround_days] )

-- Avg TAT the capacity sheet's way: the days that went in over the tickets
-- that came out. Eight is the hours in a working day.
Avg TAT hours     = DIVIDE ( [Effort days] * 8, [Closed] )
Tickets per day   = DIVIDE ( [Closed], [Effort days] )

Requesters        = DISTINCTCOUNT ( fact_ticket[requested_by] )
Frontlines        = DISTINCTCOUNT ( fact_ticket[frontline] )

-- Closed in a period, using the inactive relationship on closed date.
Closed in period  =
CALCULATE ( [Closed], USERELATIONSHIP ( dim_date[date], fact_ticket[closed] ) )

-- NPI
Answered          = CALCULATE ( COUNTROWS ( fact_npi ), fact_npi[answered] = TRUE )
Recommend         = AVERAGE ( fact_npi[recommend] )
Service score     = AVERAGE ( fact_npi[service_average] )
Promoters         = CALCULATE ( [Answered], fact_npi[band] = "promoter" )
Detractors        = CALCULATE ( [Answered], fact_npi[band] = "detractor" )
NPI score         = DIVIDE ( [Promoters] - [Detractors], [Answered] ) * 100
```

Two that are deliberately **not** here, because they cannot be a simple
aggregate and getting them wrong is how the two systems start disagreeing:

- **Service utility rate** — used ÷ total frontlines, where "used" means at
  least one request **inside the selected period**. In DAX that is a
  `CALCULATE` over `DISTINCTCOUNT` with the period filter still applied, not a
  column. Build it against the app's own figure and check they match before
  trusting it.
- **Hand-set capacity days** — the capacity sheet lets somebody type a figure
  over the computed one, with a note saying why. Power BI cannot write back, so
  those stay in the app. `effort_days` here is always the computed figure.

---

## Keeping them honest

`dim_setting` carries the rules the model was built under. Put it on a page as
a plain table. If somebody asks why a Power BI number differs from the app, the
first question is whether the model is stale, and the **Built** row answers it.

When a definition changes in the app — a rate, the cadence share, who has left,
how a service routes — the next refresh carries it, because the column is
computed here. Nothing in the report needs editing.
