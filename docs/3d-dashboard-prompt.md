# What was built: the 3D board and the KONE world

A prompt for review. Paste the whole thing into a fresh chat and ask for whatever
you want checked — the logic, the metaphor, the honesty of the visual encodings,
the performance, or what a leadership audience would misread.

---

I have a React/Vite + FastAPI internal reporting tool (the KONE Digital Marketing
Hub "TicketIQ"). It reads a ServiceNow CSV/Sheet export of marketing service
requests. Existing tabs: Dashboard, User Activity, Feedback, Service 2, SLA &
Time. I added a sixth tab, **3D Board**, in two stages. Review what follows.

## The data, and what is NOT in it

One upload per session, held server-side in a pandas DataFrame. Per ticket:
Number, Short description, Requested by, Assigned to, Created, Closed, State,
Area, Team (frontline), Sub-Category. **There is no logged time, no leave data,
no headcount.** Feedback comes from a separate sheet (survey responses with a
score per response, scale usually 1–5) and may be absent entirely.

Three services as the business talks about them: Website Content Management
(WCM), Demand Engagement Activations (DEA — a roll-up of three ServiceNow
sub-categories: Demand Creation – Global, Email – Local, Retention –
Activations), Content Production – Graphic Design (CP). Areas: AME, APM, EUR,
GCN, GLOBAL.

## Stage 1 — the volume field

**Backend:** one new endpoint, `GET /api/sessions/{sid}/kpi-3d?months=12`.
It returns, in one call:

- `months`: a **complete** `period_range` from `(newest created − months + 1)`
  to the newest created month. Not "the months that have data" — a gap has to
  be a hole in the landscape, not a missing column that silently shortens the
  axis.
- `areas`: sorted unique areas (after an `EU → EUR` rename).
- `grid`: one cell per (month × area) as `{m, a, n}` where n = requests created.
- `max`: the largest n, used as the height scale.
- `trend`: per month `{raised, closed}` — raised counted on Created, closed on
  Closed, so a ticket raised in March and closed in September counts in both
  months but different ones.
- `services`: counts per display service (DEA rolled up).
- `headline`: requests, closed, open, median_open_age, users, period_end,
  window_start, months_shown.

**Frontend:** three.js via @react-three/fiber and @react-three/drei.

The field: X = months, Z = areas, Y = requests. `STEP = 1.45` spacing,
`BAR = 0.85` footprint, `MAX_H = 5.0` for the tallest bar; every other bar is
`n / max * MAX_H`. A zero cell still gets a 0.04-high footprint so the grid has
no holes. Bar colour comes from its own height on a five-step KONE blue scale
(`#d0dcfd → #a1b9fb → #7296f9 → #4373f7 → #1450f5`), so the landscape reads
without consulting a legend. Month and area labels are 3D text lying on the
floor plane in the KONE Information typeface, so they turn with the scene.
Camera `[13, 10.5, 17]`, fov 40, OrbitControls target `[0, 0.4, 0]`, pan
disabled, distance clamped 9–30. The group auto-rotates at `delta * 0.055`
rad/s and **stops while a bar is hovered** — chasing a bar that is turning away
is how you make a room motion-sick. Hover shows a white DOM label with the
count and the "AREA · Month Year" it belongs to.

**A thing I built and then removed:** closed-per-month was a sand-coloured sixth
row sitting behind the area rows in the same field. It was wrong twice over —
a whole month's closures stood against a *single area's* raises, so the sand
bar towered over everything and invited a comparison that is not a comparison.
Raised-vs-closed is now a flat DOM strip under the canvas where the two share a
scale with each other and nothing else.

## Stage 2 — the KONE world

A **World / Volume field** toggle; World is the default. No new endpoint: the
page fetches `/overview`, `/user-metrics` and `/feedback` with
`Promise.allSettled`, so each may fail independently. No feedback sheet means a
lift with nothing to read, not an empty screen.

The building, in three.js primitives:

- **Floors** — one per area, `STOREY = 2.45` apart, slab `9.0 × 0.26 × 6.4`,
  four corner columns per storey. Sorted **descending by requests** so the
  busiest area is the ground floor. On each slab stands a blue block whose
  width is `requests / busiest × (FLOOR_W − 1.6)`, floor at 0.6 minimum. The
  area's name is 3D text cut into the front edge of its own slab.
- **Lift bank** — three glass shafts at x = 3.5 / 5.3 / 7.1 (the tower is
  centred at x = −2.2 and is 9 wide, so the bank stands just clear of it),
  `SHAFT_W = 1.35`, full building height. Four emissive corner rails and a head
  beam, because transparent glass alone was invisible against a near-black
  background. Tick marks at 0/25/50/75/100% on the outside of each shaft, the
  100 mark in KONE sand. A car rides to
  `(value / 100) × (height − 1.4) + 0.85`, eased each frame by
  `delta * 2.2` — it travels up on arrival rather than appearing at its floor,
  because the movement is what tells a room the height means something. The
  percentage is 3D text on the car's face, riding with it. The KPI's name is on
  the ground at the foot of its shaft (it was above the shaft and got cropped).
- **Escalators** — two, in front of the building, rise `STOREY` over a run of
  4.4. Identical trusses leaning the same way; only the step direction differs.
  16 step boxes per escalator repositioned each frame along the incline from a
  wrapping phase, hidden in the last 3% at each end. Speed is
  `0.1 + (monthly average / busier of the two) × 0.4`, so the busier escalator
  runs at 0.5 and the other is scaled against it — the *gap* is the thing you
  see. Blue = raised, sand = closed.
- Camera `[17, 12, 20]`, fov 38, target `[1, 4.5, 0]`, OrbitControls
  autoRotate 0.35, pan disabled, 14–46 distance.

### The three lift metrics, one from each tab

| Lift | Formula | Source |
|---|---|---|
| ON TIME | `(total_active − overdue_sla) / total_active × 100` | Dashboard `/overview` |
| ENGAGED | `rates.engagement_pct` = (Active + Regular) ÷ all users | User Activity |
| SCORE | `avg_score / scale_max × 100` | Feedback |

"Active" = last request ≤ 30 days before period_end; "Regular" = 31–90;
"Dormant" = > 90. period_end is the end of the date filter **capped at the
newest request in the data**, so a range ending in the future cannot age
everybody.

### Interaction

Clicking a floor or a car sets a selection; a 300px DOM panel beside the canvas
fills with that thing's actual figures (floor: requests, users, utility rate,
requests per person, feedback score, responses — card: the reading plus its
components and a sentence defining it). `onPointerMissed` clears it. Hovering a
floor lights the slab and shows a count label. A Hold button stops the
rotation.

### Stated principle

Perspective is honest about shape and dishonest about value: a near bar looks
taller than an equal one at the back, and a floor's width and a car's height
are comparisons rather than readings. So **every exact number lives on a flat
panel**, and the 3D is there to show shape, relative size and flow.

## Engineering notes

- `three` + `@react-three/fiber` + `@react-three/drei` are lazy-loaded via
  `React.lazy` + `Suspense`: a 279 KB gzipped chunk that loads only when the
  tab is opened. The main bundle is unchanged at 283 KB gzipped.
- A WebGL capability check renders a sentence ("every figure here is also on
  the Dashboard/User Activity/Feedback tabs") instead of a blank rectangle on a
  machine that cannot run it.
- 3D text uses the self-hosted KONE Information TTF passed to troika, so no
  font is fetched from a CDN at runtime.
- Tests (`kpi-app/backend/tests/test_3d_board.py`, 26 checks) build a fixture
  whose grid is known by hand, assert every cell, then drive a real headless
  Chromium with SwiftShader: canvas present and ≥ 360px tall, headline figures
  rendered, a floor can be clicked and names an area, the panel carries that
  area's figures, clicking away clears it, the field still renders behind the
  toggle, and nothing threw.

## Bugs this found, for context on what to look for

1. A dialog in the heat-map component called a helper declared inside a
   *different* component — a free variable that threw `ReferenceError` on
   render and blanked the whole page. Invisible to the bundler, fatal at
   runtime, and no test had clicked that cell.
2. The 3D canvas collapsed to 150px tall because it was a flex child whose
   height came from its siblings; it now has an explicit
   `clamp(420px, 56vh, 680px)`.
3. A ticket raised at 09:00 on the newest day read as **minus one** day old,
   because period_end is that date at midnight. Both sides are now normalised
   to the day before subtracting.

## What I want from you

Review the above. In particular:

1. Are the visual encodings honest? Where could a leadership audience read
   something off this building that is not true?
2. Is the lift metaphor defensible — three different rates on one 0–100 scale?
   What does that comparison imply that the data does not support?
3. The escalator speeds encode a rate as *motion*. Does that communicate or
   just entertain?
4. What is missing that a hub leadership team would actually ask about?
5. Anything in the geometry, the maths or the engineering above that you would
   challenge.
