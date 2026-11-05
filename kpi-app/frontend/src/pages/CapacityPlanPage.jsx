import { useEffect, useMemo, useState } from 'react'
import { getCapacityPlan } from '../api'
import { INTER, KONE_FONT, Card, Empty } from '../components/KoneUI'
import CapacityEditBar from '../components/CapacityEditBar'

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

const BLUE = '#1450f5'
const DIM = '#6e6e6e'
const LINE = '#e8e2d6'
const YEARS = [2024, 2025, 2026, 2027]

const n0 = (v) => (v == null ? '—' : Math.round(v).toLocaleString())
const n1 = (v) => (v == null ? '—' : Number(v).toFixed(1))

const th = {
  padding: '7px 9px', fontSize: 10, fontWeight: 600, color: DIM, textAlign: 'right',
  textTransform: 'uppercase', letterSpacing: '0.04em', fontFamily: INTER,
  borderBottom: `2px solid ${LINE}`, whiteSpace: 'nowrap',
}
const td = {
  padding: '7px 9px', fontSize: 12.5, textAlign: 'right', fontFamily: KONE_FONT,
  borderBottom: '1px solid #f1ede3', whiteSpace: 'nowrap',
}

// The spreadsheet's own banding, which is how the room already reads it.
function utilityTone(pct) {
  if (pct == null) return { bg: 'transparent', fg: DIM }
  if (pct > 105) return { bg: '#d9f2e4', fg: '#136c47' }   // over the line
  if (pct >= 85) return { bg: '#edf8f2', fg: '#1e8a5e' }   // about right
  if (pct >= 60) return { bg: '#fff0f3', fg: '#c0305a' }   // light
  return { bg: '#ffd9e0', fg: '#8c1f3d' }                  // very light
}

export default function CapacityPlanPage({ sessionId, onSessionExpired, filters = {},
                                           range = {} }) {
  const [year, setYear] = useState(2026)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  // Bumped when the editor saves, so the tables re-read the figures they were
  // computed from rather than sitting on the ones that were just replaced.
  const [stamp, setStamp] = useState(0)

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

  const shown = useMemo(
    () => (data?.services ?? []).filter(s => s.mapped || s.days > 0),
    [data],
  )

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {bar}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
                    background: '#fff', border: `1px solid ${LINE}`, borderRadius: 12,
                    padding: '12px 16px' }}>
        {YEARS.map(y => (
          <button key={y} onClick={() => setYear(y)}
                  style={{ background: y === year ? BLUE : '#fff',
                           color: y === year ? '#fff' : DIM,
                           border: `1px solid ${y === year ? BLUE : LINE}`,
                           borderRadius: 7, padding: '6px 14px', fontSize: 12,
                           fontWeight: 700, fontFamily: INTER, cursor: 'pointer' }}>{y}</button>
        ))}
        <span style={{ fontSize: 11, color: DIM, fontFamily: INTER }}>
          {data.as_of
            ? `as per closed status on ${data.as_of}`
            : `nothing closed in ${year}`}
          {' · '}{data.closed_states.join(' + ')}
        </span>
      </div>

      {/* ── Availability and allocation ──────────────────────────────────── */}
      <Card title={`Availability and allocation — ${year}`}
            subtitle="Days. Allocation is what each person's closed work is worth at this year's rate.">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left' }} />
                <th colSpan={6} style={{ ...th, textAlign: 'center', background: '#f5f8fe',
                                         color: BLUE }}>Availability</th>
                <th colSpan={2 + shown.length} style={{ ...th, textAlign: 'center',
                     background: '#f5f8fe', color: BLUE,
                     borderLeft: `2px solid #dbe6fd` }}>Delivered / allocated</th>
              </tr>
              <tr>
                <th style={{ ...th, textAlign: 'left' }}>{year}</th>
                <th style={th}>Working days</th>
                <th style={th}>Holidays</th>
                <th style={th}>Availability</th>
                <th style={th} title={`${data.cadence_pct}% of availability`}>
                  Cadence {data.cadence_pct}%
                </th>
                <th style={th} title={`${data.training_pct}% of availability unless a `
                                      + 'figure is typed in for somebody'}>
                  Training {data.training_pct}%
                </th>
                <th style={th} title="Availability less cadence and training">Productivity</th>
                <th style={{ ...th, borderLeft: '2px solid #dbe6fd' }}>Allocated</th>
                <th style={th}>Utility rate</th>
                {shown.map(s => <th key={s.short} style={th} title={s.name}>{s.short}</th>)}
              </tr>
            </thead>
            <tbody>
              {data.people.map((p, i) => {
                const tone = utilityTone(p.utility_pct)
                return (
                  <tr key={p.name} style={{ background: i % 2 ? '#faf8f3' : '#fff' }}>
                    <td style={{ ...td, textAlign: 'left', fontFamily: INTER,
                                 fontWeight: 600 }}>{p.name}</td>
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
                        <span style={{ color: '#1450f5', fontSize: 9, verticalAlign: 'super',
                                       marginLeft: 1 }}>&#9679;</span>
                      )}
                    </td>
                    <td style={{ ...td, fontWeight: 700 }}>{n0(p.productivity_days)}</td>
                    <td style={{ ...td, borderLeft: '2px solid #dbe6fd', fontWeight: 700 }}>
                      {n0(p.allocated_days)}
                    </td>
                    <td style={{ ...td, background: tone.bg, color: tone.fg,
                                 fontWeight: 700 }}
                        title={`${n1(p.allocated_days)} allocated of `
                               + `${n1(p.productivity_days)} productive days`}>
                      {p.utility_pct == null ? '—' : `${p.utility_pct}%`}
                    </td>
                    {shown.map(s => (
                      <td key={s.short} style={{ ...td, color: p.by_service[s.short]
                        ? '#141414' : '#d0d0d0' }}
                          title={`${p.tickets[s.short] ?? 0} tickets closed`}>
                        {p.by_service[s.short] ? n0(p.by_service[s.short]) : '–'}
                      </td>
                    ))}
                  </tr>
                )
              })}
              <tr style={{ borderTop: `2px solid ${LINE}`, background: '#f5f8fe' }}>
                <td style={{ ...td, textAlign: 'left', fontFamily: INTER,
                             fontWeight: 700 }}>Consolidated</td>
                <td style={{ ...td, fontWeight: 700 }}>{n0(t.working_days)}</td>
                <td style={{ ...td, fontWeight: 700 }}>{n0(t.holidays)}</td>
                <td style={{ ...td, fontWeight: 700 }}>{n0(t.availability)}</td>
                <td style={{ ...td, fontWeight: 700 }}>{n0(t.cadence_days)}</td>
                <td style={{ ...td, fontWeight: 700 }}>{n0(t.training_days)}</td>
                <td style={{ ...td, fontWeight: 700 }}>{n0(t.productivity_days)}</td>
                <td style={{ ...td, borderLeft: '2px solid #dbe6fd', fontWeight: 700 }}>
                  {n0(t.allocated_days)}
                </td>
                <td style={{ ...td, fontWeight: 700, ...utilityTone(t.utility_pct) }}>
                  {t.utility_pct == null ? '—' : `${t.utility_pct}%`}
                </td>
                {shown.map(s => (
                  <td key={s.short} style={{ ...td, fontWeight: 700 }}>
                    {n0(t.by_service[s.short])}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── Per service ──────────────────────────────────────────────────── */}
      <Card title={`Each service — ${year}`}
            subtitle="Goal is the same delivered days worked at the target rate; the year column is what was closed.">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left' }} />
                {shown.map(s => (
                  <th key={s.short} colSpan={3} style={{ ...th, textAlign: 'center',
                       background: '#f5f8fe', color: BLUE,
                       borderLeft: '2px solid #dbe6fd' }} title={s.name}>{s.short}</th>
                ))}
              </tr>
              <tr>
                <th style={{ ...th, textAlign: 'left' }} />
                {shown.map(s => (
                  <>
                    <th key={`${s.short}g`} style={{ ...th, borderLeft: '2px solid #dbe6fd' }}>
                      Goal
                    </th>
                    <th key={`${s.short}a`} style={th}>{year}</th>
                    <th key={`${s.short}p`} style={th}>{year - 1}</th>
                  </>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ ...td, textAlign: 'left', fontFamily: INTER }}>Avg TAT (hours)</td>
                {shown.map(s => (
                  <>
                    <td key={`${s.short}gt`} style={{ ...td, borderLeft: '2px solid #dbe6fd' }}>
                      {s.goal_hours ?? '—'}
                    </td>
                    <td key={`${s.short}at`} style={td}>{s.year_hours ?? '—'}</td>
                    <td key={`${s.short}pt`} style={{ ...td, color: DIM }}>—</td>
                  </>
                ))}
              </tr>
              <tr style={{ background: '#faf8f3' }}>
                <td style={{ ...td, textAlign: 'left', fontFamily: INTER }}>Per day</td>
                {shown.map(s => (
                  <>
                    <td key={`${s.short}gd`} style={{ ...td, borderLeft: '2px solid #dbe6fd' }}>
                      {s.goal_per_day ?? '—'}
                    </td>
                    <td key={`${s.short}ad`} style={td}>{s.year_per_day ?? '—'}</td>
                    <td key={`${s.short}pd`} style={{ ...td, color: DIM }}>—</td>
                  </>
                ))}
              </tr>
              <tr style={{ background: '#ede9fb' }}>
                <td style={{ ...td, textAlign: 'left', fontFamily: INTER,
                             fontWeight: 700 }}>Team capacity</td>
                {shown.map(s => (
                  <>
                    <td key={`${s.short}gc`} style={{ ...td, fontWeight: 700,
                         borderLeft: '2px solid #dbe6fd' }}>{n0(s.goal_capacity)}</td>
                    <td key={`${s.short}ac`} style={{ ...td, fontWeight: 700 }}>
                      {n0(s.actual)}
                    </td>
                    <td key={`${s.short}pc`} style={{ ...td, fontWeight: 700, color: DIM }}>
                      {n0(s.previous)}
                    </td>
                  </>
                ))}
              </tr>
              {data.people.map((p, i) => (
                <tr key={p.name} style={{ background: i % 2 ? '#faf8f3' : '#fff' }}>
                  <td style={{ ...td, textAlign: 'left', fontFamily: INTER }}>{p.name}</td>
                  {shown.map(s => {
                    const c = s.people[p.name] || {}
                    const blank = !c.goal && !c.actual && !c.previous
                    return (
                      <>
                        <td key={`${s.short}${p.name}g`}
                            style={{ ...td, borderLeft: '2px solid #dbe6fd',
                                     color: blank ? '#d0d0d0' : '#141414' }}>
                          {blank ? '–' : n0(c.goal)}
                        </td>
                        <td key={`${s.short}${p.name}a`}
                            style={{ ...td, color: blank ? '#d0d0d0' : '#141414' }}>
                          {blank ? '–' : n0(c.actual)}
                        </td>
                        <td key={`${s.short}${p.name}p`}
                            style={{ ...td, color: blank ? '#d0d0d0' : DIM }}>
                          {blank ? '–' : n0(c.previous)}
                        </td>
                      </>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <p style={{ fontSize: 11, color: '#9c9c9c', fontFamily: INTER, lineHeight: 1.7,
                  margin: 0 }}>
        <b>Where each figure comes from.</b> Working days, holidays, the cadence and training
        shares and each service&rsquo;s hours are settings, per year, in the bar above.
        Training is {data.training_pct}% of availability for anybody without a figure of
        their own; a <span style={{ color: '#1450f5' }}>&#9679;</span> marks the ones that
        have one.
        Everything else is computed from the tickets closed in {year} —
        {' '}{data.closed_states.join(' and ')} — so nothing on this page is typed twice.
        {data.unmapped?.length ? (
          <> <b style={{ color: '#b87d00' }}>{data.unmapped.join(', ')} are not mapped to a
          ServiceNow sub-category yet</b>, so they carry no tickets and no days. Send me the
          sub-category names and they fill in.</>
        ) : null}
      </p>
    </div>
  )
}
