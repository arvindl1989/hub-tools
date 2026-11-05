import { Fragment, useEffect, useState } from 'react'
import { getCapacityPlan } from '../api'
import { INTER, KONE_FONT, Card, Empty } from '../components/KoneUI'
import CapacityEditBar from '../components/CapacityEditBar'
import CapacityCellDialog from '../components/CapacityCellDialog'

// ── The capacity sheet, computed ─────────────────────────────────────────────
// The team keeps this by hand. Everything in it that can be derived is derived
// here, from the tickets each person actually closed; everything that cannot —
// holidays, training, the cadence share, what an hour of each service is
// reckoned to cost — is a setting, per year, because a rate agreed for 2026
// says nothing about 2024.
//
//   availability = working days − holidays
//   productivity = availability − cadence − training
//   allocated    = what the closed work is worth in days, at that year's rate
//   utility      = allocated ÷ productivity
//
// Every service column is shown whether or not it carries anything. A column
// that is empty because nobody did that work and a column that is empty
// because nothing routes into it look the same when one of them is hidden,
// and the second is the one worth knowing about.

const BLUE = '#1450f5'
const INK = '#141414'
const DIM = '#6e6e6e'
const FAINT = '#b6b2aa'
const LINE = '#e8e2d6'
const RULE = '#f1ede3'
const SAND = '#faf8f3'
const BAND_A = '#eef3fe'   // availability
const BAND_D = '#e7edfd'   // delivered / allocated
const BAND_S = '#f6f1e8'   // by service
const BAND_W = '#fdf3dd'   // waiting on a route
const AMBER = '#b87d00'

function bandOf(s) {
  if (!s.mapped) return { bg: BAND_W, fg: AMBER }
  if (s.routed_by === 'everything else') return { bg: BAND_S, fg: '#8a6d2f' }
  return { bg: BAND_D, fg: BLUE }
}
const YEARS = [2024, 2025, 2026, 2027]

const n0 = (v) => (v == null ? '—' : Math.round(v).toLocaleString())
const n1 = (v) => (v == null ? '—' : Number(v).toFixed(1))

const th = {
  padding: '7px 10px', fontSize: 10, fontWeight: 600, color: DIM, textAlign: 'right',
  textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: INTER,
  whiteSpace: 'nowrap', verticalAlign: 'bottom',
}
const band = {
  ...th, textAlign: 'center', color: BLUE, letterSpacing: '0.08em',
  padding: '6px 10px', fontSize: 9.5,
}
const td = {
  padding: '7px 10px', fontSize: 12.5, textAlign: 'right', fontFamily: KONE_FONT,
  whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', color: INK,
}
// The name column stays put while the service columns scroll past it, which is
// the whole reason this table is readable at nine services wide.
const stick = {
  ...td, textAlign: 'left', fontFamily: INTER, fontWeight: 600, position: 'sticky',
  left: 0, zIndex: 1, boxShadow: `1px 0 0 ${RULE}`,
}
const edge = { borderLeft: `1px solid ${LINE}` }

// The spreadsheet's own banding, which is how the room already reads it.
function utilityTone(pct) {
  if (pct == null) return { bg: 'transparent', fg: FAINT }
  if (pct > 105) return { bg: '#cdeedd', fg: '#0f5c3c' }   // over the line
  if (pct >= 85) return { bg: '#e6f6ee', fg: '#1e8a5e' }   // about right
  if (pct >= 60) return { bg: '#fff1f4', fg: '#c0305a' }   // light
  return { bg: '#ffdde3', fg: '#8c1f3d' }                  // very light
}

function Pill({ pct, title }) {
  const tone = utilityTone(pct)
  return (
    <span title={title}
          style={{ display: 'inline-block', minWidth: 52, padding: '3px 8px',
                   borderRadius: 999, background: tone.bg, color: tone.fg,
                   fontWeight: 700, fontSize: 12, fontFamily: KONE_FONT,
                   fontVariantNumeric: 'tabular-nums' }}>
      {pct == null ? '—' : `${pct}%`}
    </span>
  )
}

function Note({ children, tone = '#b87d00' }) {
  return (
    <span style={{ display: 'inline-block', marginRight: 14, color: tone,
                   fontSize: 11, fontFamily: INTER }}>{children}</span>
  )
}

export default function CapacityPlanPage({ sessionId, onSessionExpired, filters = {},
                                           range = {} }) {
  const [year, setYear] = useState(2026)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  // Bumped when the editor saves, so the tables re-read the figures they were
  // computed from rather than sitting on the ones that were just replaced.
  const [stamp, setStamp] = useState(0)
  // Which cell is open. Clicking one shows the tickets behind it and lets the
  // figure be typed instead — Adhoc is the reason, but every column gets it,
  // because "what is actually in here" is the same question everywhere.
  const [cell, setCell] = useState(null)

  // Depend on the filter VALUES, not the object. `filters = {}` is a fresh
  // object on every render, so putting it in the dependency list re-ran the
  // fetch forever and the page never left its loading state.
  const { assignedTo, team, area, subCategory } = filters
  useEffect(() => {
    if (!sessionId) return
    let live = true
    setData(null); setError(null)
    getCapacityPlan(sessionId, year, {
      assignedTo, team, area, subCategory, dateFrom: range.from, dateTo: range.to,
    })
      .then(d => { if (live) setData(d) })
      .catch(e => {
        if (e?.sessionExpired) return onSessionExpired?.()
        if (live) setError(e?.message || 'Could not build the plan.')
      })
    return () => { live = false }
  }, [sessionId, year, assignedTo, team, area, subCategory, range.from, range.to,
      stamp, onSessionExpired])

  const bar = <CapacityEditBar year={year} onSaved={() => setStamp(n => n + 1)} />

  if (error || !data || !data.people.length) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {bar}
        <Card title="Capacity">
          {error
            ? <div style={{ padding: 22, color: '#c0305a', fontSize: 13,
                            fontFamily: INTER }}>{error}</div>
            : !data
              ? <div style={{ padding: 22, color: DIM, fontSize: 13,
                              fontFamily: INTER }}>Working it out…</div>
              : <Empty />}
        </Card>
      </div>
    )
  }

  const t = data.totals
  const shown = data.services           // all of them, always
  const residual = Math.max(0, 100 - (data.cadence_pct || 0) - (data.training_pct || 0))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {bar}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
                    background: '#fff', border: `1px solid ${LINE}`, borderRadius: 12,
                    padding: '10px 14px' }}>
        {YEARS.map(y => (
          <button key={y} onClick={() => setYear(y)}
                  style={{ background: y === year ? BLUE : '#fff',
                           color: y === year ? '#fff' : DIM,
                           border: `1px solid ${y === year ? BLUE : LINE}`,
                           borderRadius: 999, padding: '5px 16px', fontSize: 12,
                           fontWeight: 700, fontFamily: INTER, cursor: 'pointer' }}>{y}</button>
        ))}
        <span style={{ fontSize: 11, color: DIM, fontFamily: INTER, marginLeft: 4 }}>
          {data.as_of
            ? `closed up to ${data.as_of}`
            : `nothing closed in ${year}`}
          {' · '}{data.closed_states.join(' + ')}
          {' · '}{(data.total_tickets ?? 0).toLocaleString()} tickets counted
        </span>
      </div>

      {/* ── Availability and allocation ──────────────────────────────────── */}
      <Card title={`Availability and allocation — ${year}`}
            subtitle="Days. Allocation is what each person's closed work is worth at this year's rate.">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...stick, ...band, background: '#fff' }} />
                <th colSpan={6} style={{ ...band, background: BAND_A }}>Availability</th>
                <th colSpan={2} style={{ ...band, background: BAND_D, ...edge }}>
                  Delivered / allocated
                </th>
                <th colSpan={shown.length} style={{ ...band, background: BAND_S, ...edge,
                     color: '#8a6d2f' }}>
                  By service — days
                </th>
              </tr>
              <tr style={{ borderBottom: `2px solid ${LINE}` }}>
                <th style={{ ...stick, ...th, textAlign: 'left', background: '#fff',
                             fontWeight: 700, color: INK }}>{year}</th>
                <th style={th}>Working days</th>
                <th style={th}>Holidays</th>
                <th style={th}>Availability</th>
                <th style={th} title={`${data.cadence_pct}% of availability, everyone`}>
                  Cadence {data.cadence_pct}%
                </th>
                <th style={th} title={`${data.training_pct}% of availability unless a `
                                      + 'figure is typed in for somebody'}>
                  Training {data.training_pct}%
                </th>
                <th style={th} title={'Availability less cadence and training — '
                                      + `${residual}% for anybody on both shares`}>
                  Productivity
                  <div style={{ fontWeight: 400, color: FAINT, textTransform: 'none',
                                letterSpacing: 0 }}>{residual}% default</div>
                </th>
                <th style={{ ...th, ...edge }}>Allocated</th>
                <th style={th}>Utility rate</th>
                {shown.map(s => (
                  <th key={s.short} style={{ ...th, ...edge, color: bandOf(s).fg }}
                      title={s.routed_by ? `${s.name} — by ${s.routed_by}`
                        : `${s.name} — nothing routes here yet`}>
                    {s.short}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.people.map((p, i) => {
                const zebra = i % 2 ? SAND : '#fff'
                return (
                  <tr key={p.name} style={{ background: zebra }}>
                    <td style={{ ...stick, background: zebra }}>{p.name}</td>
                    <td style={td}>{n0(p.working_days)}</td>
                    <td style={td}>{n0(p.holidays)}</td>
                    <td style={td}>{n0(p.availability)}</td>
                    <td style={td}>{n0(p.cadence_days)}</td>
                    {/* The share is the default; a typed figure says so, because
                        40% of Jerlin's year in training is not a rounding error
                        and should not read like one. */}
                    <td style={td}
                        title={p.training_from_share
                          ? `${data.training_pct}% of ${n1(p.availability)} available days`
                          : `Set for ${p.name}, rather than the ${data.training_pct}% share`}>
                      {n0(p.training_days)}
                      {!p.training_from_share && (
                        <span style={{ color: BLUE, fontSize: 9, verticalAlign: 'super',
                                       marginLeft: 1 }}>&#9679;</span>
                      )}
                    </td>
                    <td style={{ ...td, fontWeight: 700 }}>{n0(p.productivity_days)}</td>
                    <td style={{ ...td, ...edge, fontWeight: 700 }}>
                      {n0(p.allocated_days)}
                    </td>
                    <td style={{ ...td, padding: '5px 10px' }}>
                      <Pill pct={p.utility_pct}
                            title={`${n1(p.allocated_days)} allocated of `
                                   + `${n1(p.productivity_days)} productive days`} />
                    </td>
                    {shown.map(s => {
                      const days = p.by_service[s.short]
                      const tick = p.tickets[s.short] ?? 0
                      // Counted but not costed: show the tickets rather than a
                      // nought, so the work is visible before the rate is set.
                      const bare = !days && tick
                      const byHand = (p.manual || []).includes(s.short)
                      const why = (p.manual_notes || {})[s.short]
                      return (
                        <td key={s.short}
                            onClick={() => setCell({ person: p.name, service: s.short })}
                            style={{ ...td, ...edge, cursor: 'pointer',
                                     color: byHand ? BLUE
                                       : days ? INK : bare ? AMBER : '#ddd8cf' }}
                            title={byHand
                              ? (why ? `Set by hand — ${why}. ${tick} closed`
                                : `Set by hand. ${tick} closed — click to see them or change it`)
                              : bare
                                ? `${tick} closed — no ${year} hours set for ${s.short}. `
                                  + 'Click to see them or set the days by hand'
                                : `${tick} closed — click to see them`}>
                          {days ? n0(days) : bare ? `${tick}t` : '–'}
                          {byHand && (
                            <span style={{ color: why ? BLUE : '#9ab2fb', fontSize: 9,
                                           verticalAlign: 'super', marginLeft: 1 }}>
                              &#9998;
                            </span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
              <tr style={{ borderTop: `2px solid ${LINE}`, background: BAND_D }}>
                <td style={{ ...stick, background: BAND_D, fontWeight: 700 }}>
                  Consolidated
                </td>
                <td style={{ ...td, fontWeight: 700 }}>{n0(t.working_days)}</td>
                <td style={{ ...td, fontWeight: 700 }}>{n0(t.holidays)}</td>
                <td style={{ ...td, fontWeight: 700 }}>{n0(t.availability)}</td>
                <td style={{ ...td, fontWeight: 700 }}>{n0(t.cadence_days)}</td>
                <td style={{ ...td, fontWeight: 700 }}>{n0(t.training_days)}</td>
                <td style={{ ...td, fontWeight: 700 }}>{n0(t.productivity_days)}</td>
                <td style={{ ...td, ...edge, fontWeight: 700 }}>{n0(t.allocated_days)}</td>
                <td style={{ ...td, padding: '5px 10px' }}>
                  <Pill pct={t.utility_pct} />
                </td>
                {shown.map(s => (
                  <td key={s.short} style={{ ...td, ...edge, fontWeight: 700,
                       color: t.by_service[s.short] ? INK : '#c8c3ba' }}>
                    {t.by_service[s.short] ? n0(t.by_service[s.short]) : '–'}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── Per service ──────────────────────────────────────────────────── */}
      <Card title={`Each service — ${year}`}
            subtitle="Tickets. Goal is the same delivered days worked at the target rate; the year column is what was closed.">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...stick, ...band, background: '#fff' }} />
                {shown.map(s => (
                  <th key={s.short} colSpan={3}
                      style={{ ...band, background: bandOf(s).bg,
                               borderLeft: '2px solid #fff', color: bandOf(s).fg }}
                      title={s.routed_by ? `${s.name} — by ${s.routed_by}`
                        : `${s.name} — nothing routes here yet`}>
                    {s.short}
                  </th>
                ))}
                <th style={{ ...band, background: BAND_S, color: '#8a6d2f',
                             borderLeft: '2px solid #fff' }}>Total</th>
              </tr>
              <tr style={{ borderBottom: `2px solid ${LINE}` }}>
                <th style={{ ...stick, ...th, textAlign: 'left', background: '#fff' }} />
                {shown.map(s => (
                  <Fragment key={s.short}>
                    <th style={{ ...th, borderLeft: `2px solid ${LINE}` }}>Goal</th>
                    <th style={{ ...th, color: INK }}>{year}</th>
                    <th style={{ ...th, color: FAINT }}>{year - 1}</th>
                  </Fragment>
                ))}
                <th style={{ ...th, borderLeft: `2px solid ${LINE}` }}>All</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ ...stick, background: '#fff', fontWeight: 400,
                             color: DIM }}>Avg TAT (hours)</td>
                {shown.map(s => (
                  <Fragment key={s.short}>
                    <td style={{ ...td, borderLeft: `2px solid ${LINE}`, color: DIM }}>
                      {s.goal_hours ?? '—'}
                    </td>
                    {/* Measured, not echoed: the days that went into the
                        service over the tickets that came out. Where every
                        cell is priced from the rate it restates the rate;
                        where days were set by hand the two part company. */}
                    <td style={{ ...td, color: s.year_hours ? INK
                      : s.actual ? AMBER : FAINT }}
                        title={s.year_hours && s.rate_hours
                          && Math.abs(s.year_hours - s.rate_hours) > 0.05
                          ? `${s.days} days over ${s.actual} closed. The rate set for `
                            + `pricing is ${s.rate_hours}h; this is what it came to.`
                          : s.days
                            ? `${s.days} days over ${s.actual} closed`
                            : 'No days to measure yet'}>
                      {s.year_hours ?? (s.actual ? 'set it' : '—')}
                    </td>
                    <td style={{ ...td, color: s.prev_hours ? FAINT : FAINT }}
                        title={s.prev_days
                          ? `${s.prev_days} days over ${s.previous} closed`
                          : ''}>
                      {s.prev_hours ?? '—'}
                    </td>
                  </Fragment>
                ))}
                <td style={{ ...td, borderLeft: `2px solid ${LINE}`, color: FAINT }}>—</td>
              </tr>
              <tr style={{ background: SAND }}>
                <td style={{ ...stick, background: SAND, fontWeight: 400,
                             color: DIM }}>Per day</td>
                {shown.map(s => (
                  <Fragment key={s.short}>
                    <td style={{ ...td, borderLeft: `2px solid ${LINE}`, color: DIM }}>
                      {s.goal_per_day ?? '—'}
                    </td>
                    <td style={td}>{s.year_per_day ?? '—'}</td>
                    <td style={{ ...td, color: FAINT }}>{s.prev_per_day ?? '—'}</td>
                  </Fragment>
                ))}
                <td style={{ ...td, borderLeft: `2px solid ${LINE}`, color: FAINT }}>—</td>
              </tr>
              <tr style={{ background: '#e9e4f8' }}>
                <td style={{ ...stick, background: '#e9e4f8', fontWeight: 700 }}>
                  Team capacity
                </td>
                {shown.map(s => (
                  <Fragment key={s.short}>
                    <td style={{ ...td, fontWeight: 700,
                                 borderLeft: `2px solid ${LINE}`,
                                 color: s.goal_capacity == null ? AMBER : INK,
                                 fontSize: s.goal_capacity == null ? 10.5 : 12.5 }}
                        title={s.goal_capacity == null
                          ? (s.projected
                            ? `No goal typed for ${s.short} yet. At this year's rate so far `
                              + `it lands near ${s.projected}.`
                            : `No goal typed for ${s.short} yet.`)
                          : `Typed, summed across the team`}>
                      {s.goal_capacity == null ? 'not set' : n0(s.goal_capacity)}
                    </td>
                    <td style={{ ...td, fontWeight: 700 }}>{n0(s.actual)}</td>
                    <td style={{ ...td, fontWeight: 700, color: DIM }}>{n0(s.previous)}</td>
                  </Fragment>
                ))}
                <td style={{ ...td, fontWeight: 700, borderLeft: `2px solid ${LINE}` }}>
                  {n0(shown.reduce((a, s) => a + (s.goal_capacity || 0) + s.actual
                                    + s.previous, 0))}
                </td>
              </tr>
              {data.people.map((p, i) => {
                const zebra = i % 2 ? SAND : '#fff'
                const total = shown.reduce((a, s) => {
                  const c = s.people[p.name] || {}
                  return a + (c.goal || 0) + (c.actual || 0) + (c.previous || 0)
                }, 0)
                return (
                  <tr key={p.name} style={{ background: zebra }}>
                    <td style={{ ...stick, background: zebra, fontWeight: 400 }}>{p.name}</td>
                    {shown.map(s => {
                      const c = s.people[p.name] || {}
                      const blank = !c.actual && !c.previous
                      return (
                        <Fragment key={s.short}>
                          <td onClick={() => setCell({ person: p.name, service: s.short })}
                              style={{ ...td, borderLeft: `2px solid ${LINE}`,
                                       cursor: 'pointer',
                                       color: c.goal == null ? '#ddd8cf' : BLUE }}
                              title={c.goal == null
                                ? (c.projected
                                  ? `No ${year} goal set for ${p.name}. At this rate they `
                                    + `land near ${c.projected} — click to set one`
                                  : `No ${year} goal set for ${p.name} — click to set one`)
                                : `Goal for ${year}, set by hand — click to change it`}>
                            {c.goal == null ? '–' : n0(c.goal)}
                          </td>
                          <td style={{ ...td, color: blank ? '#ddd8cf' : INK,
                                       fontWeight: blank ? 400 : 600 }}>
                            {blank ? '–' : n0(c.actual)}
                          </td>
                          <td style={{ ...td, color: blank ? '#ddd8cf' : FAINT }}>
                            {blank ? '–' : n0(c.previous)}
                          </td>
                        </Fragment>
                      )
                    })}
                    <td style={{ ...td, borderLeft: `2px solid ${LINE}`, fontWeight: 700,
                                 color: total ? INK : '#ddd8cf' }}>
                      {total ? n0(total) : '–'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <p style={{ fontSize: 11, color: '#9c9c9c', fontFamily: INTER, lineHeight: 1.8,
                  margin: 0 }}>
        {data.unmapped?.length ? (
          <Note>{data.unmapped.join(' and ')} {data.unmapped.length > 1 ? 'have' : 'has'} no
          route yet — send the ServiceNow sub-category names and they fill in.</Note>
        ) : null}
        {data.unpriced?.length ? (
          <Note>{data.unpriced.join(', ')} {data.unpriced.length > 1 ? 'carry' : 'carries'}
          {' '}tickets but no {year} hours, so they show a ticket count rather than days.
          Set the hours in the bar above.</Note>
        ) : null}
        <br />
        <b>Goal</b> is what the team anticipates finishing by the end of the year. It is
        typed, per person, because nothing in the tickets implies it — set it in the grid in
        the edit bar, or by clicking a Goal cell. Until then it reads
        {' '}<span style={{ color: '#b87d00' }}>not set</span>, and hovering a cell offers
        where this year&rsquo;s rate so far would land. <b>Avg TAT</b> for {year} and
        {' '}{year - 1} is measured rather than typed: the days that went into a service over
        the tickets that came out of it. While every day on the page is priced from the rate
        in the edit bar that calculation is circular and simply restates that rate — which is
        what it is doing now. It only becomes a measurement once days are set by hand, cell
        by cell, from what the work actually took.
        <br />
        <b>Click any service cell</b>, or a Goal cell, to see the tickets behind it, and the sub-categories
        and teams that put them there — and to type the days in by hand, with a note
        saying why, where the ticket count does not describe the work. A
        {' '}<span style={{ color: BLUE }}>&#9998;</span> marks a figure set that way;
        hover it for the note.
        <br />
        <b>Where each figure comes from.</b> Working days, holidays, the cadence and training
        shares and each service&rsquo;s hours are settings, per year, in the bar above.
        Training is {data.training_pct}% of availability for anybody without a figure of
        their own; a <span style={{ color: BLUE }}>&#9679;</span> marks the ones that have
        one. A ticket reaches a service by its sub-category, or by its team where the work
        is filed that way — PWR and KDB are two teams in one column — and anything matching
        neither lands in Adhoc / Others, so every closed ticket is counted exactly once.
        Everything else is computed from the tickets closed in {year} —
        {' '}{data.closed_states.join(' and ')} — so nothing on this page is typed twice.
      </p>

      {cell && (
        <CapacityCellDialog sessionId={sessionId} year={year} person={cell.person}
                            service={cell.service} filters={filters} range={range}
                            onClose={() => setCell(null)}
                            onSaved={() => setStamp(n => n + 1)} />
      )}
    </div>
  )
}
