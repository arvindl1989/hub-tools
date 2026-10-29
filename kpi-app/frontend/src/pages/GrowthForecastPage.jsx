import { useEffect, useMemo, useState } from 'react'
import { getGrowthForecast } from '../api'
import { INTER, KONE_FONT, Card, Empty } from '../components/KoneUI'

// ── Three years, next year, and whether it fits ──────────────────────────────
// The projection is the dullest one available on purpose: last year's month
// times a growth rate. Three points is not a trend, and a regression through
// them would look authoritative while saying nothing more than this does. What
// it does carry is last year's seasonality, which is the one pattern this data
// genuinely supports.
//
// The capacity half is an allocation, not a measurement. Each person's hours
// are split across services in the proportion they worked them in the base
// year, so a reorganisation invalidates it. The page says so at the bottom
// rather than leaving a verdict looking like a fact.

const BLUE = '#1450f5'
const DIM = '#6e6e6e'
const LINE = '#e8e2d6'

const TONE = {
  overloaded:        { fg: '#c0305a', bg: '#fff0f3', border: '#f28ba0' },
  appropriate:       { fg: '#1e8a5e', bg: '#edf8f2', border: '#aae1c8' },
  'under-utilised':  { fg: '#b87d00', bg: '#fffae3', border: '#ffe141' },
  unknown:           { fg: '#9c9c9c', bg: '#faf8f3', border: '#e8e2d6' },
}

const GROWTH_CHOICES = [0, 5, 10, 15, 20]
const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString())
const pct = (n) => (n == null ? '—' : `${n > 0 ? '+' : ''}${n}%`)

const th = {
  padding: '8px 10px', fontSize: 10, fontWeight: 600, color: DIM,
  textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right',
  borderBottom: `2px solid ${LINE}`, fontFamily: INTER, whiteSpace: 'nowrap',
}
const td = { padding: '8px 10px', fontSize: 13, textAlign: 'right',
             borderBottom: '1px solid #f1ede3', fontFamily: KONE_FONT }

function Verdict({ value }) {
  const t = TONE[value] ?? TONE.unknown
  return (
    <span style={{
      display: 'inline-block', fontSize: 11, fontWeight: 700, fontFamily: INTER,
      color: t.fg, background: t.bg, border: `1px solid ${t.border}`,
      borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap',
    }}>{value}</span>
  )
}

function Figure({ label, value, sub, tone }) {
  return (
    <div style={{ flex: 1, minWidth: 150, background: '#fff', border: `1px solid ${LINE}`,
                  borderRadius: 10, padding: '14px 18px' }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', color: DIM,
                    textTransform: 'uppercase', fontFamily: INTER }}>{label}</div>
      <div style={{ fontFamily: KONE_FONT, fontSize: 30, color: tone ?? '#141414',
                    marginTop: 5, lineHeight: 1.15 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: DIM, marginTop: 4,
                            fontFamily: INTER }}>{sub}</div>}
    </div>
  )
}

export default function GrowthForecastPage({ sessionId, onSessionExpired }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [growth, setGrowth] = useState(10)

  useEffect(() => {
    if (!sessionId) return
    let live = true
    setData(null)
    setError(null)
    getGrowthForecast(sessionId, growth)
      .then(d => { if (live) setData(d) })
      .catch(e => {
        if (e?.sessionExpired) return onSessionExpired?.()
        if (live) setError(e?.message || 'Could not build the forecast.')
      })
    return () => { live = false }
  }, [sessionId, growth, onSessionExpired])

  const years = data?.years ?? []
  const cap = data?.capacity ?? {}
  const hottest = useMemo(() => {
    const s = [...(data?.seasonality ?? [])].sort((a, b) => b.index - a.index)
    return s.slice(0, 3)
  }, [data])

  if (error) {
    return <Card title="Growth & capacity"><div style={{ padding: 24, color: '#c0305a',
      fontSize: 13, fontFamily: INTER }}>{error}</div></Card>
  }
  if (!data) {
    return <Card title="Growth & capacity"><div style={{ padding: 24, color: DIM,
      fontSize: 13, fontFamily: INTER }}>Building the forecast…</div></Card>
  }
  if (!years.length) return <Card title="Growth & capacity"><Empty /></Card>

  const target = String(data.target_year)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* The assumption, and what it does to the year */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
                    background: '#fff', border: `1px solid ${LINE}`, borderRadius: 12,
                    padding: '12px 16px' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#141414',
                       fontFamily: INTER }}>
          {data.target_year} assumes
        </span>
        {GROWTH_CHOICES.map(g => (
          <button key={g} onClick={() => setGrowth(g)}
                  style={{
                    background: g === growth ? BLUE : '#fff',
                    color: g === growth ? '#fff' : DIM,
                    border: `1px solid ${g === growth ? BLUE : LINE}`, borderRadius: 7,
                    padding: '6px 13px', fontSize: 12, fontWeight: 700, fontFamily: INTER,
                    cursor: 'pointer',
                  }}>{g > 0 ? `+${g}%` : 'flat'}</button>
        ))}
        <span style={{ fontSize: 11, color: DIM, fontFamily: INTER, marginLeft: 4 }}>
          on {data.base_year}, month by month — so {data.base_year}&rsquo;s seasonality
          carries through
        </span>
        {!data.base_year_complete && (
          <span style={{
            fontSize: 11, color: '#b87d00', background: '#fffae3',
            border: '1px solid #ffe141', borderRadius: 20, padding: '4px 11px',
            fontFamily: INTER,
          }}>
            {data.base_year} is part-finished — {data.months_carried}{' '}
            {data.months_carried === 1 ? 'month is' : 'months are'} carried from the
            year before
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {years.map(y => (
          <Figure key={y} label={y} value={fmt(data.year_totals[String(y)])}
                  sub={data.users?.[String(y)] ? `${data.users[String(y)]} requesters` : null} />
        ))}
        <Figure label={`${target} projected`} value={fmt(data.year_totals.projected)}
                tone={BLUE} sub={`${pct(growth)} on ${data.base_year}`} />
        <Figure
          label={`Capacity for ${target}`}
          value={cap.ratio_pct == null ? '—' : `${cap.ratio_pct}%`}
          tone={TONE[cap.verdict]?.fg}
          sub={`${fmt(Math.round(cap.total_demand_hours))} h needed of `
               + `${fmt(Math.round(cap.total_capacity_hours))} h available`} />
      </div>

      {/* Month on month */}
      <Card title="Month on month"
            subtitle={`Requests raised each month. ${target} is ${data.base_year} plus `
                      + `${growth}%, month by month.`}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left' }}>Month</th>
                {years.map(y => <th key={y} style={th}>{y}</th>)}
                <th style={{ ...th, color: BLUE }}>{target} proj.</th>
                <th style={th}>Index</th>
              </tr>
            </thead>
            <tbody>
              {data.monthly.map((m, i) => {
                const season = data.seasonality[i]
                return (
                  <tr key={m.month} style={{ background: i % 2 ? '#faf8f3' : '#fff' }}>
                    <td style={{ ...td, textAlign: 'left', fontFamily: INTER,
                                 fontWeight: 600 }}>{m.month}</td>
                    {years.map(y => (
                      <td key={y} style={td}>{m[String(y)] ? fmt(m[String(y)]) : '—'}</td>
                    ))}
                    <td style={{ ...td, color: BLUE, fontWeight: 700 }}
                        title={m.from_year && m.from_year !== data.base_year
                          ? `${data.base_year} has no ${m.month} yet — carried from `
                            + `${m.from_year} and grown ${data.base_year - m.from_year + 1}×`
                          : undefined}>
                      {fmt(m.projected)}
                      {m.from_year && m.from_year !== data.base_year && (
                        <span style={{ color: '#b87d00', fontSize: 10, marginLeft: 4 }}>
                          ↩{m.from_year}
                        </span>
                      )}
                    </td>
                    {/* 100 is an average month of the base year. */}
                    <td style={{ ...td, color: season?.index >= 115 ? '#c0305a'
                      : season?.index <= 85 ? '#9c9c9c' : DIM }}>
                      {season?.index ?? '—'}
                    </td>
                  </tr>
                )
              })}
              <tr style={{ borderTop: `2px solid ${LINE}` }}>
                <td style={{ ...td, textAlign: 'left', fontFamily: INTER,
                             fontWeight: 700 }}>Year</td>
                {years.map(y => (
                  <td key={y} style={{ ...td, fontWeight: 700 }}>
                    {fmt(data.year_totals[String(y)])}
                  </td>
                ))}
                <td style={{ ...td, color: BLUE, fontWeight: 700 }}>
                  {fmt(data.year_totals.projected)}
                </td>
                <td style={td} />
              </tr>
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 11, color: '#9c9c9c', margin: '10px 0 0', fontFamily: INTER,
                    lineHeight: 1.6 }}>
          Index is that month against an average month of {data.base_year}: 130 means the
          month runs a third hot. A year that fits on the annual total can still miss
          its SLA in the two months that carry a sixth of the work.
        </p>
      </Card>

      {/* Year on year */}
      <Card title="Year on year"
            subtitle="What actually happened, and what is being assumed">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {data.yoy.map(y => (
            <div key={`${y.from}-${y.to}`} style={{
              border: `1px solid ${y.assumed ? '#dbe6fd' : LINE}`, borderRadius: 10,
              padding: '10px 16px', background: y.assumed ? '#f5f8fe' : '#fff',
            }}>
              <div style={{ fontSize: 11, color: DIM, fontFamily: INTER }}>
                {y.from} → {y.to}{y.assumed ? ' (assumed)' : ''}
              </div>
              <div style={{ fontFamily: KONE_FONT, fontSize: 22,
                            color: y.assumed ? BLUE : '#141414', marginTop: 2 }}>
                {pct(y.pct)}
              </div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 11, color: '#9c9c9c', margin: '12px 0 0', fontFamily: INTER,
                    lineHeight: 1.6 }}>
          Worth reading the assumption against the history beside it. If the last two
          years ran well above the rate being planned for, the plan is for a slowdown
          nobody has agreed to.
        </p>
      </Card>

      {/* Per service, and the verdict */}
      <Card title={`Each service in ${target}`}
            subtitle="Projected volume, the hours it needs, and the hours pointed at it">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left' }}>Service</th>
                {years.map(y => <th key={y} style={th}>{y}</th>)}
                <th style={{ ...th, color: BLUE }}>{target} proj.</th>
                <th style={th}>Hours needed</th>
                <th style={th}>Hours available</th>
                <th style={th}>Load</th>
                <th style={{ ...th, textAlign: 'left' }}>Verdict</th>
              </tr>
            </thead>
            <tbody>
              {data.by_service.map((r, i) => (
                <tr key={r.service} style={{ background: i % 2 ? '#faf8f3' : '#fff' }}>
                  <td style={{ ...td, textAlign: 'left', fontFamily: INTER,
                               fontWeight: 600 }} title={r.service}>
                    <span style={{ fontFamily: KONE_FONT, color: BLUE, background: '#eef3fe',
                                   borderRadius: 5, padding: '2px 7px', fontSize: 11,
                                   marginRight: 8 }}>{r.short}</span>
                    {r.service}
                  </td>
                  {years.map(y => <td key={y} style={td}>{fmt(r[String(y)])}</td>)}
                  <td style={{ ...td, color: BLUE, fontWeight: 700 }}>{fmt(r.projected)}</td>
                  <td style={td}>{fmt(Math.round(r.demand_hours))}</td>
                  <td style={td}>
                    {r.capacity_hours == null ? '—' : fmt(Math.round(r.capacity_hours))}
                  </td>
                  <td style={{ ...td, fontWeight: 700,
                               color: TONE[r.verdict]?.fg ?? '#141414' }}>
                    {r.ratio_pct == null ? '—' : `${r.ratio_pct}%`}
                  </td>
                  <td style={{ ...td, textAlign: 'left' }}><Verdict value={r.verdict} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 11, color: '#9c9c9c', margin: '10px 0 0', fontFamily: INTER,
                    lineHeight: 1.6 }}>
          Hours needed is the projected tickets priced at each sub-service&rsquo;s own rate for{' '}
          {target} — Demand Engagement is three offers at different costs, so it is priced
          one by one and then rolled up. Hours available is each person&rsquo;s working days at{' '}
          {cap.productive_hours_per_day} productive hours, split across services in the
          proportion they worked them in {data.base_year}. Over{' '}
          {cap.bands?.overloaded}% is overloaded, under {cap.bands?.under_used}% is
          under-utilised.
        </p>
      </Card>

      {/* The bottom line */}
      <Card title={`Does ${target} fit?`} subtitle="The whole team against the whole year">
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
              <span style={{ fontFamily: KONE_FONT, fontSize: 40,
                             color: TONE[cap.verdict]?.fg ?? '#141414' }}>
                {cap.ratio_pct == null ? '—' : `${cap.ratio_pct}%`}
              </span>
              <Verdict value={cap.verdict} />
            </div>
            <div style={{ fontSize: 13, color: DIM, marginTop: 8, fontFamily: INTER,
                          lineHeight: 1.7 }}>
              {fmt(Math.round(cap.total_demand_hours))} hours of work against{' '}
              {fmt(Math.round(cap.total_capacity_hours))} hours of people.
              {cap.shortfall_hours > 0 ? (
                <> That is <b>{fmt(Math.round(cap.shortfall_hours))} hours short</b> —
                about <b>{cap.people_needed}</b> more{' '}
                {cap.people_needed === 1 ? 'person' : 'people'} at the same days and
                productivity.</>
              ) : (
                <> That leaves <b>{fmt(Math.abs(Math.round(cap.shortfall_hours)))} hours
                </b> spare.</>
              )}
            </div>
          </div>

          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.05em',
                          color: DIM, textTransform: 'uppercase', fontFamily: INTER,
                          marginBottom: 8 }}>Busiest months of {data.base_year}</div>
            {hottest.map(m => (
              <div key={m.month} style={{ display: 'flex', justifyContent: 'space-between',
                                          padding: '5px 0', fontSize: 13, fontFamily: INTER }}>
                <span>{m.month}</span>
                <span style={{ fontFamily: KONE_FONT }}>
                  {m.requests} <span style={{ color: DIM, fontSize: 11 }}>
                    index {m.index}</span>
                </span>
              </div>
            ))}
          </div>
        </div>

        <p style={{ fontSize: 11, color: '#9c9c9c', margin: '16px 0 0', fontFamily: INTER,
                    lineHeight: 1.7, borderTop: `1px solid ${LINE}`, paddingTop: 12 }}>
          <b>What this rests on.</b> Volume grows evenly at {growth}% — real demand does not.
          Each person keeps the service mix they worked in {data.base_year}; a reorganisation
          makes the per-service verdicts meaningless.{' '}
          {cap.assumed_from_base?.length
            ? `${cap.assumed_from_base.length} ${cap.assumed_from_base.length === 1
                ? 'person has' : 'people have'} no ${target} working days set, so ${
                data.base_year}'s are assumed — set them in Rates & SLA. `
            : ''}
          {cap.people_without_days?.length
            ? `${cap.people_without_days.join(', ')} ${cap.people_without_days.length === 1
                ? 'has' : 'have'} no working days at all and count for nothing here. `
            : ''}
          Hours per ticket are standard estimates from Rates &amp; SLA, not logged time,
          and the export carries no leave, part-time pattern or absence.
        </p>
      </Card>
    </div>
  )
}
