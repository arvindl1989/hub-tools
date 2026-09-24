import { useEffect, useMemo, useState } from 'react'
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

const num = (v, d = 1) => (v == null ? '—' : Number(v).toLocaleString(undefined, {
  minimumFractionDigits: d, maximumFractionDigits: d,
}))

const DIMS = [
  ['by_area', 'By Area'],
  ['by_team', 'By Frontline'],
  ['by_service', 'By Service'],
]

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

export default function SlaPage() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [dim, setDim] = useState('by_area')

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetch('/api/sla/metrics')
      .then(async (r) => {
        const body = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(body.detail || `HTTP ${r.status}`)
        return body
      })
      .then((d) => { if (alive) { setData(d); setError('') } })
      .catch((e) => { if (alive) setError(e.message || 'Could not load SLA data') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  // Groups are ordered by ticket count from the API; here they are re-ordered by
  // the figure the chart is about, so the worst offender is the top bar rather
  // than whichever group happens to be busiest.
  const dimData = useMemo(() => {
    const rows = (data?.[dim] || []).filter((g) => g.timed > 0)
    return rows
      // Both bars are days of twenty-four hours, which is what makes the gap
      // between them readable as the off-hours time. The nine-hour working-day
      // figure is carried alongside for the tooltip, where it can be named.
      .map((g) => ({
        name: g.name,
        Working: g.avg_working_calendar_days,
        'Off the clock': g.avg_off_hours_days,
        saved: g.avg_off_hours_days,
        tickets: g.timed,
        elapsed: g.avg_elapsed_days,
        workingDays: g.avg_working_days,
        off_hours_days: g.off_hours_days,
        avg_ours: g.avg_ours_days,
        avg_waiting: g.avg_waiting_days,
      }))
      .sort((a, b) => (b.saved ?? 0) - (a.saved ?? 0))
  }, [data, dim])

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
      .filter((s) => s.working_days > 0)
      .map((s) => ({ name: s.stage, days: s.working_days, tracked: s.tracked_days, side: s.side }))
  ), [data])

  if (loading) return <Empty text="Loading SLA and time tracking…" />

  if (error || !data?.timed) {
    return (
      <Card title="SLA and time tracking">
        <div style={{ padding: 24, textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: C.ink, margin: '0 0 8px' }}>
            {error || 'No SLA rows could be timed yet.'}
          </p>
          <p style={{ fontSize: 12, color: C.muted, margin: 0, lineHeight: 1.7 }}>
            Upload the SLA export on the SLA tab of the ServiceNow Master page, and make sure the
            ticket table there is synced — the created and closed dates come from the tickets,
            matched on ticket number.
          </p>
        </div>
      </Card>
    )
  }

  const m = data
  const dimLabel = DIMS.find(([id]) => id === dim)?.[1].replace('By ', '') || 'Area'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Headline numbers ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}>
        <MetricCard label="Tickets timed" value={m.timed}
          sub={`of ${m.tickets} in the sheet`} />
        <MetricCard label="Recorded by ServiceNow" value={num(m.elapsed_days, 0)} suffix=" days"
          sub={`${num(m.avg_elapsed_days, 1)} per ticket, round the clock`} />
        {/* Working time in whole days here, so this card and the one beside it
            add back to the recorded figure. The nine-hour reading of the same
            time is the sub-line, because that is how a week is planned. */}
        <MetricCard label="Inside working hours" value={num(m.working_calendar_days, 0)} suffix=" days"
          sub={`${num(m.working_days, 0)} working days of nine hours — ${num(m.avg_working_days, 1)} per ticket`} />
        {/* The number the report exists for: what a raw ServiceNow figure charges
            the team for nights, weekends and holidays. */}
        <MetricCard label="Off the clock" value={num(m.off_hours_days, 0)} suffix=" days"
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
            <a href="/api/sla/report.xlsx"
               style={{
                 display: 'inline-flex', alignItems: 'center', gap: 7, textDecoration: 'none',
                 background: C.working, color: '#fff', borderRadius: 8, padding: '9px 16px',
                 fontSize: 13, fontWeight: 600, fontFamily: 'Inter, sans-serif',
               }}>
              Download the SLA pack
            </a>
            <span style={{ fontSize: 11, color: C.muted, alignSelf: 'center' }}>
              Excel — summary, Area, Frontline, Service, stage times, the longest waits and every ticket
            </span>
          </div>
        </Card>
      )}

      {/* ── Calendar against working time ── */}
      <Card
        title="What the clock counted against what could be worked"
        subtitle={`Average days per ticket by ${dimLabel.toLowerCase()}`}
        controls={
          <div style={{ display: 'inline-flex', border: `1px solid ${C.line}`, borderRadius: 8, overflow: 'hidden' }}>
            {DIMS.map(([id, label]) => (
              <button key={id} onClick={() => setDim(id)}
                style={{
                  border: 'none', cursor: 'pointer', padding: '6px 12px', fontSize: 12,
                  fontFamily: 'Inter, sans-serif', fontWeight: dim === id ? 600 : 500,
                  background: dim === id ? C.working : '#fff', color: dim === id ? '#fff' : C.muted,
                }}>
                {label}
              </button>
            ))}
          </div>
        }
      >
        <SectionNote>
          ServiceNow times a ticket from creation to close without pausing for nights, weekends or
          Indian public holidays. The whole bar is what it recorded. The blue part fell inside
          09:00–18:00, Monday to Friday; the pale part is time no one could have been working, and
          it is what a figure taken straight from ServiceNow charges the team for.
        </SectionNote>
        {!dimData.length ? <Empty /> : (
          <ResponsiveContainer width="100%" height={Math.max(260, dimData.length * 40 + 60)}>
            <BarChart data={dimData} layout="vertical" margin={{ top: 4, right: 96, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.line} horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} stroke={C.muted} />
              <YAxis type="category" dataKey="name" width={130}
                     tick={{ fontSize: 11, fontFamily: KONE_FONT }} stroke={C.muted} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${C.line}` }}
                formatter={(v, n, p) => [
                  n === 'Inside working hours'
                    ? `${num(v, 1)} days — ${num(p.payload.workingDays, 1)} working days of nine hours`
                    : `${num(v, 1)} days`,
                  n,
                ]}
                labelFormatter={(name) => {
                  const row = dimData.find((r) => r.name === name)
                  return `${name} — ${row?.tickets ?? 0} tickets, ${num(row?.elapsed, 1)} days recorded each, ${num(row?.off_hours_days, 0)} days off the clock in total`
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} formatter={legendLabel} />
              <Bar isAnimationActive={false} dataKey="Working" name="Inside working hours"
                   stackId="a" fill={C.working} />
              <Bar isAnimationActive={false} dataKey="Off the clock" name="Nights, weekends, holidays"
                   stackId="a" fill={C.calendar} radius={[0, 4, 4, 0]}>
                <LabelList dataKey="saved" position="right"
                           formatter={(v) => (v ? `${num(v, 1)} days off the clock` : '')}
                           style={{ fontSize: 10, fill: C.saved, fontFamily: KONE_FONT }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* ── Ours against waiting ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 20 }}>
        <Card title="Worked on against waiting"
              subtitle={`Working days per ticket by ${dimLabel.toLowerCase()}`}>
          <SectionNote>
            {m.stage_split.ours.join(', ')} is the team holding the ticket.{' '}
            {m.stage_split.waiting.join(', ')} is the ticket sitting with someone else. Across
            everything, {m.waiting_share}% of working time was spent waiting.
          </SectionNote>
          {!splitData.length ? <Empty /> : (
            <ResponsiveContainer width="100%" height={Math.max(240, splitData.length * 32 + 60)}>
              <BarChart data={splitData} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.line} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} stroke={C.muted} />
                <YAxis type="category" dataKey="name" width={130}
                       tick={{ fontSize: 11, fontFamily: KONE_FONT }} stroke={C.muted} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${C.line}` }}
                         formatter={(v, n) => [`${num(v, 1)} working days`, n]} />
                <Legend wrapperStyle={{ fontSize: 11 }} formatter={legendLabel} />
                <Bar isAnimationActive={false} dataKey="Being worked on" stackId="a" fill={C.ours} />
                <Bar isAnimationActive={false} dataKey="Waiting on others" stackId="a" fill={C.waiting}
                     radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card title="Where the time goes by stage"
              subtitle="Working days across every ticket, by the state it sat in">
          <SectionNote>
            Each stage's tracked duration is re-scaled to its ticket's working time, so these add up
            to the {num(m.working_days, 0)} working days above rather than to the raw tracker total.
          </SectionNote>
          {!stageData.length ? <Empty /> : (
            <ResponsiveContainer width="100%" height={Math.max(240, stageData.length * 32 + 60)}>
              <BarChart data={stageData} layout="vertical" margin={{ top: 4, right: 70, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.line} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} stroke={C.muted} />
                <YAxis type="category" dataKey="name" width={150}
                       tick={{ fontSize: 11, fontFamily: KONE_FONT }} stroke={C.muted} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${C.line}` }}
                         formatter={(v, _n, p) => [
                           `${num(v, 0)} working days · ${num(p.payload.tracked, 0)} as tracked`,
                           p.payload.side === 'Ours' ? 'Held by the team'
                             : p.payload.side === 'Waiting' ? 'Waiting on others' : 'Closed',
                         ]} />
                <Bar isAnimationActive={false} dataKey="days" radius={[0, 4, 4, 0]}>
                  {stageData.map((s, i) => <Cell key={i} fill={SIDE_COLOUR[s.side] || C.calendar} />)}
                  <LabelList dataKey="days" position="right"
                             formatter={(v) => num(v, 0)}
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
                  {['Ticket', 'Title', 'Area', 'Frontline', 'Calendar days',
                    'Working days', 'Worked on', 'Waiting'].map((h) => (
                    <th key={h} style={h === 'Ticket' || h === 'Title' || h === 'Area' || h === 'Frontline'
                      ? th : { ...th, textAlign: 'right' }}>{h}</th>
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
                    <td style={{ ...td, textAlign: 'right', color: C.muted }}>{num(r.elapsed_days, 1)}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{num(r.working_days, 1)}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{num(r.ours_days, 1)}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{num(r.waiting_days, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <SectionNote>
            Calendar days are whole days from creation to close. The last three columns are working
            days of nine hours; worked on and waiting are apportioned across the stages the ticket
            passed through, so they are an estimate where the ticket total is exact.
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
        {m.row_count || m.tickets} rows{m.filename ? ` from ${m.filename}` : ''}
        {m.uploaded_at ? `, uploaded ${new Date(m.uploaded_at).toLocaleString()}` : ''}.
        Re-upload on the ServiceNow Master page's SLA tab to refresh.
      </p>
    </div>
  )
}
