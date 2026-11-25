# Building the three reports in Power BI

Page by page, with the fields and the traps. Read `../POWER-BI.md` first for
the model and the wiring; this is what to do once the data is in.

The order below is deliberate. **Dashboard** ports almost perfectly,
**Feedback** ports well, and **User Activity** is the one that needs care —
most of what makes it useful is a measure over a period, not a column, so it
is the one where a careless build will quietly disagree with the app.

---

## Page size, and A4

**Format pane → Canvas settings → Type.** The presets are 16:9 (1280×720),
4:3 (960×720), **Letter** (1056×816), Tooltip, and **Custom**.

Custom takes any pixel size, so a tall page is just a tall canvas. A4 portrait
is **794 × 1123** at 96 DPI, or **1240 × 1754** if you want it crisp when
exported. Set that and then **View → Page view → Fit to width**: the page
scrolls instead of shrinking to fit. Leave it on *Fit to page* and a tall
canvas is squashed to nothing.

Two things to know before you commit to it:

- **The canvas does not reflow.** It is a fixed coordinate space, not a
  responsive layout — a visual placed at the bottom of a 1754px page stays
  there at every window size. That is fine for a page meant to be scrolled or
  printed, and wrong for one meant to be glanced at.
- **A4 for print is a different product.** If you actually want paginated
  output — page headers and footers, a table that breaks across pages, exact
  margins, "print 40 pages of tickets" — that is **Power BI Paginated Reports**
  (`.rdl`, built in Report Builder, needs Premium or PPU to publish). Normal
  Power BI exports to PDF by taking a picture of each page; it will not break a
  long table across pages.

For these three reports: **16:9 for Dashboard and Feedback** (they are glanced
at), and a **custom tall canvas for User Activity** (it is a page people scroll
through, and the app's own version is long).

---

## Report 1 — Dashboard

The closest port of the three. Everything on it is a count or a sum over
`fact_ticket`.

### Page: Overview

| Visual | Type | Fields |
|---|---|---|
| KPI row | 3 × Card | `[Requests]`, `[Requesters]`, `[Frontlines]` |
| State split | Stacked bar, 100% | Axis: blank · Legend: `fact_ticket[state]` · Value: `[Requests]` |
| Inflow vs outflow | Line and clustered column | X: `dim_date[month]` · Column: `[Requests]` · Line: `[Closed in period]` |
| By specialist | Clustered bar | Y: `fact_ticket[specialist]` · X: `[Requests]` |
| By area | Clustered bar | Y: `fact_ticket[area]` · X: `[Requests]` |
| By frontline | Stacked bar | Y: `fact_ticket[frontline]` · X: `[Requests]` · Legend: `fact_ticket[sub_category]` |
| Top requestors | Stacked bar | Y: `fact_ticket[requested_by]` · Legend: `sub_category` · **Filter: Top 15 by `[Requests]`** |
| Monthly trend | Stacked column | X: `dim_date[month]` · Legend: `sub_category` · Y: `[Requests]` |

Slicers across the top: `dim_date[date]` (Between), `fact_ticket[specialist]`,
`[frontline]`, `[area]`, `[sub_category]`.

### The one that catches people

**Inflow and outflow are two different date questions.** `[Requests]` counts by
`created_date` — the active relationship. `[Closed in period]` counts by
`closed_date` through the inactive one, which is why it is written with
`USERELATIONSHIP`. Put both on the same axis and you have the app's chart. Use
a plain `COUNTROWS` for the second and you will be counting tickets *raised* in
the month, twice, and wondering why net flow is always zero.

**Use bars, not pies.** The app uses pies for by-user and by-area because they
sit in a small card. At report size a bar sorted descending is easier to read
and lets you label values.

---

## Report 2 — Feedback

Ports well. The bands are already a column, so the NPS arithmetic cannot drift.

### Page: Feedback

| Visual | Type | Fields |
|---|---|---|
| Headline | 3 × Card | `[Responses]`, `[Avg score]`, `[NPS]` |
| Band split | Stacked bar, 100% | Legend: `fact_feedback[band]` · Value: `[Responses]` |
| Parameters | Clustered bar | Y: a measure each — `[Avg quality]`, `[Avg timeliness]`, `[Avg interaction]` |
| By specialist | Table or bar | `fact_feedback[specialist]` · `[Responses]`, `[Avg score]`, `[NPS]` |
| By area / frontline | Matrix | Rows: `[area]` · Columns: `[band]` · Values: `[Responses]` |
| Over time | Line | X: `dim_date[month]` · Y: `[Avg score]`, with `[Responses]` as a column behind it |
| Comments | Table | `[submitted]`, `[specialist]`, `[score]`, `[comment]` · Filter: `has_comment` is True |

### Worth knowing

- **Colour the bands by hand** — Format → Data colours, promoter green,
  passive amber, detractor pink. Power BI will otherwise assign them by
  alphabetical order, which puts detractor first in green.
- **`[Feedback rate]` divides by `[Closed]`, not `[Requests]`.** People are
  asked once the work is finished, so the denominator is closed tickets. The
  join from `fact_feedback` to `fact_ticket` is on ticket number, so this only
  works on a page where both tables are in filter context.
- **A score average over a tiny slice is noise.** Put `[Responses]` beside
  every average, and consider a visual-level filter of `[Responses] >= 5` on
  the per-specialist view.

---

## Report 3 — User Activity

The hard one. The app's version answers "how far has each service reached, and
who has stopped using it" — and reach and recency are **measures over the
selected period**, not columns. Build these carefully or they will disagree
with the app.

### What ports cleanly

| Visual | Type | Fields |
|---|---|---|
| Reach cards | Cards | `[Requesters]`, `[Frontlines]`, `[Specialists]` |
| Requests per user | Card | `DIVIDE([Requests], [Requesters])` |
| By frontline | Matrix | Rows: `[frontline]` · Columns: `[service]` · Values: `[Requests]` |
| By service | Bar | Y: `fact_ticket[service]` · X: `[Requests]`, `[Requesters]` |
| User list | Table | `[requested_by]`, `[frontline]`, `[area]`, `[Requests]`, `[Last request]`, `[Days since]` |

### The measures it needs that are not in the file

Add these; they are the User Activity definitions, written out.

```dax
-- The anchor the app measures recency from: the newest request in view, not
-- today. A report read in March must not call everybody dormant because the
-- export stopped in January.
Period end = MAX ( fact_ticket[created_date] )

Last request = CALCULATE ( MAX ( fact_ticket[created_date] ), ALLSELECTED ( dim_date ) )

Days since = DATEDIFF ( [Last request], [Period end], DAY )

-- Active ≤ 30 days, Regular 31–90, Dormant > 90. The same cuts the app uses;
-- change them in one place or the two stop agreeing.
Lifecycle =
VAR D = [Days since]
RETURN SWITCH ( TRUE (), D <= 30, "Active", D <= 90, "Regular", "Dormant" )

Active users   = CALCULATE ( [Requesters], FILTER ( VALUES ( fact_ticket[requested_by] ), [Days since] <= 30 ) )
Regular users  = CALCULATE ( [Requesters], FILTER ( VALUES ( fact_ticket[requested_by] ), [Days since] > 30 && [Days since] <= 90 ) )
Dormant users  = CALCULATE ( [Requesters], FILTER ( VALUES ( fact_ticket[requested_by] ), [Days since] > 90 ) )

-- Engaged means came back: two or more requests inside the window.
Engaged users =
CALCULATE ( [Requesters], FILTER ( VALUES ( fact_ticket[requested_by] ), [Requests] >= 2 ) )

Engagement rate = DIVIDE ( [Engaged users], [Requesters] )

-- Service utility rate. "Used" means at least one request INSIDE the selected
-- period — which is why it is a DISTINCTCOUNT under the filter and not a
-- column. Check it against the app's own figure before anybody quotes it.
Frontlines using = DISTINCTCOUNT ( fact_ticket[frontline] )

Frontlines all = CALCULATE ( DISTINCTCOUNT ( fact_ticket[frontline] ), ALLSELECTED ( fact_ticket[service] ) )

Service utility rate = DIVIDE ( [Frontlines using], [Frontlines all] )
```

### The heat map

A **Matrix**: rows `fact_ticket[frontline]`, columns `fact_ticket[service]`,
values `[Requests]`. Then Format → Cell elements → Background colour → **Rules**,
not Gradient:

```
1–5   ·  6–20  ·  21–50  ·  51–150  ·  151+
```

Those are the app's own bands. Use Gradient and the scale re-computes on every
filter change, so two screenshots of the same estate cannot be compared — which
is exactly the bug the fixed banding was introduced to fix.

### Three traps, in order of how much they will cost you

1. **`[Utility rate]` is only valid sliced by person or year.** `dim_person` is
   at person × year and knows nothing about services or areas, so slicing by
   either repeats the whole denominator and the rate collapses. Put it on a
   page sliced by specialist, or by nothing, and nowhere else.
2. **Recency is anchored to the data, not to today.** Use `[Period end]`
   above. `TODAY()` makes every band wrong the moment the export is a week old.
3. **"Used" is period-scoped.** A frontline that raised a service in 2025 and
   nothing in 2026 has not used it under a 2026 filter. The measure above gets
   this right because the filter context does it for you — but only if you
   leave the date slicer applied to the visual. Remove it and you are measuring
   all time while the page says otherwise.

---

## Before anyone quotes a number

Put `dim_setting` on a page as a plain table. It carries the rules the model
was built under and the time it was built, so the first question — "is this
stale, or is it a different definition?" — answers itself.

Then take three figures off the app and three off the report for the same
filters, and make sure they match. The ones worth checking are **closed count**
(the states), **utility rate** (the denominator) and **SLA met %** (the breach
rule). If those three agree, the rest will.
