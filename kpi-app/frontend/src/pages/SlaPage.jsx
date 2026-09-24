import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LabelList, Cell,
} from 'recharts'
import { KONE_FONT, Card, MetricCard, Empty } from '../components/KoneUI'

// ── Colours ───────────────────────────────────────────────────────────────────
// The whole report turns on one comparison: what the clock counted against what
// could actually have been worked. Calendar time is the pale, inert colour and
// working time is KONE blue, so the gap between the two bars is the message.
const C = {
  working: '#1450f5',
  calendar: '#e8e2d6',
  ours: '#1450f5',
  waiting: '#ffcdd7',
  terminal: '#aae1c8',
  saved: '#1e8a5e',
  ink: '#141414',
  muted: '#6e6e6e',
  line: '#e8e2d6',
}

const SIDE_COLOUR = { Ours: C.ours, Waiting: C.waiting, Closed: C.terminal }

// ── Units ─────────────────────────────────────────────────────────────────────
// Every duration arrives as seconds and is turned into a figure here, once.
// Hours are the default because a stage a ticket sat in for an afternoon is
// 0.19 days — a number that reads as nothing — and 4.5 hours, which reads as an
// afternoon. It is also the one unit with no ambiguity: a working day is nine
// hours and a calendar day twenty-four, so in days the same word means two
// different lengths depending on which figure it is attached to.
const UNITS = {
  hours: {
    label: 'Hours',
    short: 'h',
    // A duration measured from the wall clock and one measured from the working
    // day are both just hours, so nothing has to be said about which is which.
    calendar: (s) => (s == null ? null : s / 3600),
    working: (s) => (s == null ? null : s / 3600),
    calendarName: 'hours',
    workingName: 'working hours',
  },
  days: {
    label: 'Days',
    short: 'd',
    calendar: (s) => (s == null ? null : s / 86400),
    // Nine hours to the day, because that is the day the team has. Dividing by
    // twenty-four would report a fifth of the real figure.
    working: (s) => (s == null ? null : s / 32400),
    calendarName: 'calendar days',
    workingName: 'working days',
  },
}

const DIMS = [
  ['by_area', 'By Area'],
  ['by_team', 'By Frontline'],
  ['by_service', 'By Service'],
]

const FILTERS = [
  ['area', 'Area'],
  ['team', 'Frontline'],
  ['service', 'Service'],
]

const num = (v, d = 1) => (v == null ? '—' : Number(v).toLocaleString(undefined, {
  minimumFractionDigits: d, maximumFractionDigits: d,
}))

// Recharts colours legend text with the series colour, which leaves the sand and
// pink series barely legible. The swatch already carries the colour.
const legendLabel = (value) => (
  <span style={{ color: C.muted, fontFamily: 'Inter, sans-serif' }}>{value}</span>
)

function SectionNote({ children }) {
  return <p style={{ fontSize: 11, color: C.muted, margin: '0 0 12px', lineHeight: 1.6 }}>{children}</p>
}

const th = {
  textAlign: 'left', padding: '7px 10px', fontFamily: KONE_FONT,
  textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 10,
  color: C.muted, fontWeight: 400, borderBottom: `1px solid ${C.line}`,
}
const td = { padding: '6px 10px', borderBottom: `1px solid ${C.line}` }

const selectStyle = {
  fontSize: 12, fontFamily: 'Inter, sans-serif', color: C.ink,
  border: `1px solid ${C.line}`, borderRadius: 8, padding: '7px 10px',
  background: '#fff', minWidth: 150, cursor: 'pointer',
}

function Toggle({ options, value, onChange }) {
  return (
    <div style={{ display: 'inline-flex', border: `1px solid ${C.line}`, borderRadius: 8, overflow: 'hidden' }}>
      {options.map(([id, label]) => (
        <button key={id} onClick={() => onChange(id)}
          style={{
            border: 'none', cursor: 'pointer', padding: '6px 12px', fontSize: 12,
            fontFamily: 'Inter, sans-serif', fontWeight: value === id ? 600 : 500,
            background: value === id ? C.working : '#fff', color: value === id ? '#fff' : C.muted,
          }}>
          {label}
        </button>
      ))}
    </div>
  )
}

export default function SlaPage() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [dim, setDim] = useState('by_area')
  const [unit, setUnit] = useState('hours')
  const [selected, setSelected] = useState({ area: '', team: '', service: '' })

  const U = UNITS[unit]
  // The figures themselves, in whichever unit is open.
  const cal = useCallback((s) => U.calendar(s), [U])
  const wrk = useCallback((s) => U.working(s), [U])

  const query = useMemo(() => {
    const q = new URLSearchParams()
    FILTERS.forEach(([key]) => { if (selected[key]) q.set(key, selected[key]) })
    const s = q.toString()
    return s ? `?${s}` : ''
  }, [selected])

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetch(`/api/sla/metrics${query}`)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(body.detail || `HTTP ${r.status}`)
        return body
      })
      .then((d) => { if (alive) { setData(d); setError('') } })
      .catch((e) => { if (alive) setError(e.message || 'Could not load SLA data') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [query])

  // Groups are ordered by ticket count from the API; here they are re-ordered by
  // the figure the chart is about, so the worst offender is the top bar rather
  // than whichever group happens to be busiest.
  const dimData = useMemo(() => {
    const rows = (data?.[dim] || []).filter((g) => g.timed > 0)
    return rows
      .map((g) => ({
        name: g.name,
        // Both parts of the stacked bar are the same unit, so the pale part is
        // exactly the off-hours time rather than a gap between two scales.
        Working: cal(g.avg_working_seconds),
        'Off the clock': cal(g.avg_off_hours_seconds),
        saved: cal(g.avg_off_hours_seconds),
        tickets: g.timed,
        elapsed: cal(g.avg_elapsed_seconds),
        workingOwn: wrk(g.avg_working_seconds),
        offHoursTotal: cal(g.off_hours_seconds),
        avg_ours: wrk(g.avg_ours_seconds),
        avg_waiting: wrk(g.avg_waiting_seconds),
      }))
      .sort((a, b) => (b.saved ?? 0) - (a.saved ?? 0))
  }, [data, dim, cal, wrk])

  const splitData = useMemo(() => (
    dimData
      .filter((g) => g.avg_ours != null || g.avg_waiting != null)
      .map((g) => ({
        name: g.name,
        'Being worked on': g.avg_ours || 0,
        'Waiting on others': g.avg_waiting || 0,
        tickets: g.tickets,
      }))
      .sort((a, b) => b['Waiting on others'] - a['Waiting on others'])
  ), [dimData])

  const stageData = useMemo(() => (
    (data?.by_stage || [])
      .filter((s) => s.working_seconds > 0)
      .map((s) => ({
        name: s.stage,
        perTicket: wrk(s.avg_working_seconds),
        total: wrk(s.working_seconds),
        tickets: s.tickets,
        side: s.side,
      }))
      .sort((a, b) => (b.perTicket ?? 0) - (a.perTicket ?? 0))
  ), [data, wrk])

  const filtered = FILTERS.some(([key]) => selected[key])
  const clearFilters = () => setSelected({ area: '', team: '', service: '' })

  const controls = (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
      {FILTERS.map(([key, label]) => (
        <select key={key} value={selected[key]} style={selectStyle}
          onChange={(e) => setSelected((s) => ({ ...s, [key]: e.target.value }))}>
          <option value="">All {label.toLowerCase()}s</option>
          {(data?.filters?.[key] || []).map((o) => (
            <option key={o.name} value={o.name}>{o.name} ({o.count})</option>
          ))}
        </select>
      ))}
      {filtered && (
        <button onClick={clearFilters}
          style={{
            border: `1px solid ${C.line}`, borderRadius: 8, padding: '7px 12px', fontSize: 12,
            background: '#fff', color: C.muted, cursor: 'pointer', fontFamily: 'Inter, sans-serif',
          }}>
          Clear
        </button>
      )}
      <Toggle options={[['hours', 'Hours'], ['days', 'Days']]} value={unit} onChange={setUnit} />
    </div>
  )

  if (loading && !data) return <Empty text="Loading SLA and time tracking…" />

  if (error || !data?.timed) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {!!data?.filters && <Card title="SLA and time tracking" controls={controls}><div /></Card>}
        <Card title={data ? 'Nothing matches these filters' : 'SLA and time tracking'}>
          <div style={{ padding: 24, textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: C.ink, margin: '0 0 8px' }}>
              {error || (filtered
                ? 'No ticket in this selection has both a created and a closed date.'
                : 'No SLA rows could be timed yet.')}
            </p>
            <p style={{ fontSize: 12, color: C.muted, margin: 0, lineHeight: 1.7 }}>
              {filtered
                ? 'Clear a filter to widen the selection.'
                : `Upload the SLA export on the SLA tab of the ServiceNow Master page, and make sure
                   the ticket table there is synced — the created and closed dates come from the
                   tickets, matched on ticket number.`}
            </p>
          </div>
        </Card>
      </div>
    )
  }

  const m = data
  const dimLabel = DIMS.find(([id]) => id === dim)?.[1].replace('By ', '') || 'Area'
  const scope = FILTERS.map(([key]) => selected[key]).filter(Boolean).join(' · ')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, opacity: loading ? 0.6 : 1 }}>

      {/* ── Filters and the unit everything is read in ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
        flexWrap: 'wrap', background: '#fff', border: `1px solid ${C.line}`, borderRadius: 8,
        padding: '14px 18px',
      }}>
        <div>
          <div style={{
            fontFamily: KONE_FONT, textTransform: 'uppercase', letterSpacing: '0.04em',
            fontSize: 12, color: C.ink,
          }}>
            {scope ? `SLA and time tracking — ${scope}` : 'SLA and time tracking'}
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>
            {scope
              ? `${m.tickets} of ${m.total_tickets} tickets in this selection`
              : `${m.tickets} tickets · 09:00–18:00 Monday to Friday, Indian public holidays excluded`}
          </div>
        </div>
        {controls}
      </div>

      {/* ── Headline numbers ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}>
        <MetricCard label="Tickets timed" value={m.timed}
          sub={`of ${m.tickets} in this selection`} />
        <MetricCard label="Recorded by ServiceNow" value={num(cal(m.elapsed_seconds), 0)}
          suffix={` ${U.short}`}
          sub={`${num(cal(m.avg_elapsed_seconds), 1)} ${U.short} per ticket, round the clock`} />
        {/* Working time in the calendar reading here, so this card and the one
            beside it add back to the recorded figure. */}
        <MetricCard label="Inside working hours" value={num(cal(m.working_seconds), 0)}
          suffix={` ${U.short}`}
          sub={`${num(wrk(m.avg_working_seconds), 1)} ${U.short} per ticket of real working time`} />
        {/* The number the report exists for: what a raw ServiceNow figure charges
            the team for nights, weekends and holidays. */}
        <MetricCard label="Off the clock" value={num(cal(m.off_hours_seconds), 0)}
          suffix={` ${U.short}`}
          sub={`${m.off_hours_share}% of the recorded time was outside working hours`} />
      </div>

      {/* ── Leadership narrative ── */}
      {!!(m.report || []).length && (
        <Card title="For leadership"
              subtitle="Generated from the figures on this page, so the wording cannot drift from the charts">
          <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.85, color: C.ink }}>
            {m.report.map((line, i) => <li key={i} style={{ marginBottom: 6 }}>{line}</li>)}
          </ol>
          <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <a href={`/api/sla/report.xlsx${query}`}
               style={{
                 display: 'inline-flex', alignItems: 'center', gap: 7, textDecoration: 'none',
                 background: C.working, color: '#fff', borderRadius: 8, padding: '9px 16px',
                 fontSize: 13, fontWeight: 600, fontFamily: 'Inter, sans-serif',
               }}>
              Download the SLA pack
            </a>
            <span style={{ fontSize: 11, color: C.muted, alignSelf: 'center' }}>
              Excel in hours — summary, Area, Frontline, Service, stage times, the longest waits and
              every ticket{scope ? `, for ${scope} only` : ''}
            </span>
          </div>
        </Card>
      )}

      {/* ── Calendar against working time ── */}
      <Card
        title="What the clock counted against what could be worked"
        subtitle={`Average ${U.label.toLowerCase()} per ticket by ${dimLabel.toLowerCase()}`}
        controls={<Toggle options={DIMS} value={dim} onChange={setDim} />}
      >
        <SectionNote>
          ServiceNow times a ticket from creation to close without pausing for nights, weekends or
          Indian public holidays. The whole bar is what it recorded. The blue part fell inside
          09:00–18:00, Monday to Friday; the pale part is time no one could have been working, and
          it is what a figure taken straight from ServiceNow charges the team for.
        </SectionNote>
        {!dimData.length ? <Empty /> : (
          <ResponsiveContainer width="100%" height={Math.max(260, dimData.length * 40 + 60)}>
            <BarChart data={dimData} layout="vertical" margin={{ top: 4, right: 110, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.line} horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} stroke={C.muted} />
              <YAxis type="category" dataKey="name" width={130}
                     tick={{ fontSize: 11, fontFamily: KONE_FONT }} stroke={C.muted} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${C.line}` }}
                formatter={(v, n, p) => [
                  n === 'Inside working hours' && unit === 'days'
                    ? `${num(v, 1)} ${U.short} — ${num(p.payload.workingOwn, 1)} working days of nine hours`
                    : `${num(v, 1)} ${U.short}`,
                  n,
                ]}
                labelFormatter={(name) => {
                  const row = dimData.find((r) => r.name === name)
                  return `${name} — ${row?.tickets ?? 0} tickets, ${num(row?.elapsed, 1)} ${U.short} recorded each, ${num(row?.offHoursTotal, 0)} ${U.short} off the clock in total`
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} formatter={legendLabel} />
              <Bar isAnimationActive={false} dataKey="Working" name="Inside working hours"
                   stackId="a" fill={C.working} maxBarSize={34} />
              <Bar isAnimationActive={false} dataKey="Off the clock" name="Nights, weekends, holidays"
                   stackId="a" fill={C.calendar} radius={[0, 4, 4, 0]} maxBarSize={34}>
                <LabelList dataKey="saved" position="right"
                           formatter={(v) => (v ? `${num(v, 1)} ${U.short} off the clock` : '')}
                           style={{ fontSize: 10, fill: C.saved, fontFamily: KONE_FONT }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* ── Ours against waiting ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 20 }}>
        <Card title="Worked on against waiting"
              subtitle={`${U.workingName[0].toUpperCase()}${U.workingName.slice(1)} per ticket by ${dimLabel.toLowerCase()}`}>
          <SectionNote>
            {m.stage_split.ours.join(', ')} is the team holding the ticket.{' '}
            {m.stage_split.waiting.join(', ')} is the ticket sitting with someone else. Across this
            selection, {m.waiting_share}% of working time was spent waiting.
          </SectionNote>
          {!splitData.length ? <Empty /> : (
            <ResponsiveContainer width="100%" height={Math.max(240, splitData.length * 32 + 60)}>
              <BarChart data={splitData} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.line} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} stroke={C.muted} />
                <YAxis type="category" dataKey="name" width={130}
                       tick={{ fontSize: 11, fontFamily: KONE_FONT }} stroke={C.muted} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${C.line}` }}
                         formatter={(v, n) => [`${num(v, 1)} ${U.short} of ${U.workingName}`, n]} />
                <Legend wrapperStyle={{ fontSize: 11 }} formatter={legendLabel} />
                <Bar isAnimationActive={false} dataKey="Being worked on" stackId="a" fill={C.ours} maxBarSize={28} />
                <Bar isAnimationActive={false} dataKey="Waiting on others" stackId="a" fill={C.waiting}
                     radius={[0, 4, 4, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Per ticket rather than in total: a total says which state the whole
            queue has spent the most time in, which is mostly a count of how many
            tickets passed through it. What a state costs is the average. */}
        <Card title="What each state costs a ticket"
              subtitle={`${U.workingName[0].toUpperCase()}${U.workingName.slice(1)} per ticket that passed through it`}>
          <SectionNote>
            Each stage's tracked duration is re-scaled to its ticket's working time, so a stage is
            counted only for the hours it could have been worked. The figure is an estimate for one
            stage of one ticket and sound across many, because the sheet gives stage durations but
            no timestamps to place them by.
          </SectionNote>
          {!stageData.length ? <Empty /> : (
            <ResponsiveContainer width="100%" height={Math.max(240, stageData.length * 32 + 60)}>
              <BarChart data={stageData} layout="vertical" margin={{ top: 4, right: 76, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.line} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} stroke={C.muted} />
                <YAxis type="category" dataKey="name" width={150}
                       tick={{ fontSize: 11, fontFamily: KONE_FONT }} stroke={C.muted} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${C.line}` }}
                         formatter={(v, _n, p) => [
                           `${num(v, 1)} ${U.short} per ticket · ${num(p.payload.total, 0)} ${U.short} across ${p.payload.tickets} tickets`,
                           p.payload.side === 'Ours' ? 'Held by the team'
                             : p.payload.side === 'Waiting' ? 'Waiting on others' : 'Closed',
                         ]} />
                <Bar isAnimationActive={false} dataKey="perTicket" radius={[0, 4, 4, 0]} maxBarSize={28}>
                  {stageData.map((s, i) => <Cell key={i} fill={SIDE_COLOUR[s.side] || C.calendar} />)}
                  <LabelList dataKey="perTicket" position="right"
                             formatter={(v) => `${num(v, 1)} ${U.short}`}
                             style={{ fontSize: 10, fill: C.muted, fontFamily: KONE_FONT }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* ── The longest waits ── */}
      {!!(m.worst || []).length && (
        <Card title="Longest waits"
              subtitle="Tickets that spent the most working time sitting with someone outside the team">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  {['Ticket', 'Title', 'Area', 'Frontline', `Recorded (${U.short})`,
                    `Working (${U.short})`, `Worked on (${U.short})`, `Waiting (${U.short})`].map((h, i) => (
                    <th key={h} style={i < 4 ? th : { ...th, textAlign: 'right' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {m.worst.map((r) => (
                  <tr key={r.number}>
                    <td style={{ ...td, fontFamily: KONE_FONT, color: C.working }}>{r.number}</td>
                    <td style={{ ...td, maxWidth: 340, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={r.title}>{r.title || '—'}</td>
                    <td style={td}>{r.area || '—'}</td>
                    <td style={td}>{r.team || '—'}</td>
                    <td style={{ ...td, textAlign: 'right', color: C.muted }}>{num(cal(r.elapsed_seconds), 1)}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{num(wrk(r.working_seconds), 1)}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{num(wrk(r.ours_seconds), 1)}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{num(wrk(r.waiting_seconds), 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <SectionNote>
            Recorded is wall-clock time from creation to close. The last three columns count only
            the hours inside a working day; worked on and waiting are apportioned across the stages
            the ticket passed through, so they are an estimate where the ticket total is exact.
          </SectionNote>
        </Card>
      )}

      {/* ── Data quality ── */}
      {!!m.unmatched && (
        <Card title="Not found in ServiceNow"
              subtitle={`${m.unmatched} ticket${m.unmatched === 1 ? '' : 's'} in the SLA sheet ${m.unmatched === 1 ? 'has' : 'have'} no matching ticket record`}>
          <SectionNote>
            Without the ticket there is no created or closed date, so these carry no working time and
            no Area or frontline — they are left out of every chart above. Re-sync the ticket table
            on the ServiceNow Master page if these should be there.
          </SectionNote>
          <p style={{ fontSize: 12, color: C.ink, margin: 0, lineHeight: 1.9, fontFamily: KONE_FONT }}>
            {(m.unmatched_numbers || []).join(' · ')}
            {m.unmatched > (m.unmatched_numbers || []).length
              ? ` … and ${m.unmatched - m.unmatched_numbers.length} more`
              : ''}
          </p>
        </Card>
      )}

      <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>
        {m.row_count || m.total_tickets} rows{m.filename ? ` from ${m.filename}` : ''}
        {m.uploaded_at ? `, uploaded ${new Date(m.uploaded_at).toLocaleString()}` : ''}.
        Re-upload on the ServiceNow Master page's SLA tab to refresh.
      </p>
    </div>
  )
}
