import { useEffect, useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LabelList, Cell,
} from 'recharts'
import { KONE_FONT, Card, MetricCard, Empty } from '../components/KoneUI'

// ── Status colours ────────────────────────────────────────────────────────────
// Utilised states in KONE blue and mint, unused states in sand and pink, so the
// two halves of the utilisation question read apart at a glance without a
// legend.
const C = {
  done: '#1450f5',
  inProgress: '#aae1c8',
  rejected: '#ffcdd7',
  unassigned: '#f1ede3',
  ink: '#141414',
  muted: '#6e6e6e',
  line: '#e8e2d6',
}

const pct = (v) => `${Number(v ?? 0).toFixed(1)}%`

// A single ramp from sand to KONE blue. Intensity carries the count, which is
// what makes a heat map readable; hue changes would imply categories that are
// not there.
function heatColour(value, max) {
  if (!value) return '#faf8f3'
  const t = max > 1 ? (value - 1) / (max - 1) : 1
  const mix = (a, b) => Math.round(a + (b - a) * t)
  return `rgb(${mix(233, 20)}, ${mix(227, 80)}, ${mix(214, 245)})`
}

function SectionNote({ children }) {
  return <p style={{ fontSize: 11, color: C.muted, margin: '0 0 12px', lineHeight: 1.6 }}>{children}</p>
}

export default function Service2Page() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [dim, setDim] = useState('by_frontline')

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetch('/api/journeys/metrics')
      .then(async (r) => {
        const body = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(body.detail || `HTTP ${r.status}`)
        return body
      })
      .then((d) => { if (alive) { setData(d); setError('') } })
      .catch((e) => { if (alive) setError(e.message || 'Could not load Service 2') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const quarterData = useMemo(
    () => (data?.by_quarter || []).map((q) => ({
      quarter: q.quarter,
      Done: q.done,
      'In Progress': q.in_progress,
      Rejected: q.rejected,
      'Un Assigned': q.unassigned,
      util: q.util_pct,
      planned: q.planned,
    })),
    [data],
  )

  const dimData = useMemo(
    () => (data?.[dim] || []).map((r) => ({
      name: r.name,
      Done: r.done,
      'In Progress': r.in_progress,
      Rejected: r.rejected,
      'Un Assigned': r.unassigned,
      done_pct: r.done_pct,
      rejected_pct: r.rejected_pct,
      total: r.total,
    })),
    [data, dim],
  )

  if (loading) return <Empty text="Loading Service 2…" />

  if (error) {
    return (
      <Card title="Service 2">
        <div style={{ padding: 24, textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: C.ink, margin: '0 0 8px' }}>{error}</p>
          <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>
            Upload the journey sheet on the Service 2 tab of the ServiceNow Master page,
            then reload this tab.
          </p>
        </div>
      </Card>
    )
  }

  const m = data
  const hm = m.heatmap || { journeys: [], frontlines: [], grid: [], max: 0 }
  const slip = m.slippage || {}

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Headline numbers ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}>
        <MetricCard label="Planned journeys" value={m.total} sub="rows in the sheet" />
        <MetricCard label="Plan utilised" value={pct(m.util_pct)}
          sub={`${m.utilised} done or in progress`} />
        <MetricCard label="Not taken up" value={m.not_utilised}
          sub="rejected or unassigned" />
        {/* The one card that points somewhere rather than totalling something.
            Recomputed on every upload, so it always names whoever is currently
            worst instead of freezing today's answer into the page. */}
        {m.attention
          ? <MetricCard label="Needs attention" value={m.attention.name}
              sub={`${pct(m.attention.dropped_pct)} of its plan dropped — ${m.attention.dropped} of ${m.attention.total}`} />
          : <MetricCard label="Needs attention" value="None"
              sub="no frontline of a meaningful size is dropping planned work" />}
      </div>

      {/* ── Leadership narrative ── */}
      {!!(m.report || []).length && (
        <Card title="For leadership" subtitle="Generated from the figures on this page, so the wording cannot drift from the charts">
          <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.85, color: C.ink }}>
            {m.report.map((line, i) => <li key={i} style={{ marginBottom: 6 }}>{line}</li>)}
          </ol>
          <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <a href="/api/journeys/report.xlsx"
               style={{
                 display: 'inline-flex', alignItems: 'center', gap: 7, textDecoration: 'none',
                 background: C.done, color: '#fff', borderRadius: 8, padding: '9px 16px',
                 fontSize: 13, fontWeight: 600, fontFamily: 'Inter, sans-serif',
               }}>
              Download the leadership pack
            </a>
            <span style={{ fontSize: 11, color: C.muted, alignSelf: 'center' }}>
              Excel — summary, plan utilisation, Area, Frontline, Service Line, journey mix,
              the heat map and every row
            </span>
          </div>
        </Card>
      )}

      {/* ── Quarter utilisation: the headline question ── */}
      <Card title="How each quarter's plan was used"
            subtitle="Every planned journey by what became of it">
        <SectionNote>
          Done and In Progress count as the plan being used. Rejected and Un Assigned are
          planned slots that produced nothing — the gap between the bar height and the blue
          is the waste in that quarter's planning.
        </SectionNote>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={quarterData} margin={{ top: 24, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.line} vertical={false} />
            <XAxis dataKey="quarter" tick={{ fontSize: 12, fontFamily: KONE_FONT }} stroke={C.muted} />
            <YAxis tick={{ fontSize: 11 }} stroke={C.muted} allowDecimals={false} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${C.line}` }}
              formatter={(v, n) => [v, n]}
              labelFormatter={(q) => {
                const row = quarterData.find((r) => r.quarter === q)
                return `${q} — ${row?.planned ?? 0} planned, ${pct(row?.util ?? 0)} utilised`
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar isAnimationActive={false} dataKey="Done" stackId="a" fill={C.done} />
            <Bar isAnimationActive={false} dataKey="In Progress" stackId="a" fill={C.inProgress} />
            <Bar isAnimationActive={false} dataKey="Rejected" stackId="a" fill={C.rejected} />
            <Bar isAnimationActive={false} dataKey="Un Assigned" stackId="a" fill={C.unassigned}>
              <LabelList dataKey="util" position="top"
                         formatter={(v) => `${v}%`}
                         style={{ fontSize: 11, fill: C.muted, fontFamily: KONE_FONT }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* ── Completed vs rejected by Area / Frontline ── */}
      <Card
        title="Completed against rejected"
        subtitle="Where planned demand converts, and where it is dropped"
        controls={
          <div style={{ display: 'inline-flex', border: `1px solid ${C.line}`, borderRadius: 8, overflow: 'hidden' }}>
            {[['by_frontline', 'By Frontline'], ['by_area', 'By Area'],
              ['by_service_line', 'By Service Line'], ['by_type', 'By Type']].map(([id, label]) => (
              <button key={id} onClick={() => setDim(id)}
                style={{
                  border: 'none', cursor: 'pointer', padding: '6px 12px', fontSize: 12,
                  fontFamily: 'Inter, sans-serif', fontWeight: dim === id ? 600 : 500,
                  background: dim === id ? C.done : '#fff', color: dim === id ? '#fff' : C.muted,
                }}>
                {label}
              </button>
            ))}
          </div>
        }
      >
        {!dimData.length ? <Empty /> : (
          <ResponsiveContainer width="100%" height={Math.max(260, dimData.length * 34 + 60)}>
            <BarChart data={dimData} layout="vertical" margin={{ top: 4, right: 70, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.line} horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} stroke={C.muted} allowDecimals={false} />
              <YAxis type="category" dataKey="name" width={104}
                     tick={{ fontSize: 11, fontFamily: KONE_FONT }} stroke={C.muted} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${C.line}` }}
                labelFormatter={(name) => {
                  const row = dimData.find((r) => r.name === name)
                  return `${name} — ${row?.total ?? 0} planned, ${pct(row?.done_pct ?? 0)} done, ${pct(row?.rejected_pct ?? 0)} not taken up`
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar isAnimationActive={false} dataKey="Done" stackId="a" fill={C.done} />
              <Bar isAnimationActive={false} dataKey="In Progress" stackId="a" fill={C.inProgress} />
              <Bar isAnimationActive={false} dataKey="Rejected" stackId="a" fill={C.rejected} />
              <Bar isAnimationActive={false} dataKey="Un Assigned" stackId="a" fill={C.unassigned}>
                <LabelList dataKey="rejected_pct" position="right"
                           formatter={(v) => (v ? `${v}% dropped` : '')}
                           style={{ fontSize: 10, fill: C.muted, fontFamily: KONE_FONT }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* ── Journey × Frontline heat map ── */}
      <Card title="Which journeys are running where"
            subtitle="Journey against frontline — darker is more requests">
        {!hm.journeys.length ? <Empty /> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr>
                  <th style={{
                    position: 'sticky', left: 0, background: '#fff', textAlign: 'left',
                    padding: '6px 10px', fontFamily: KONE_FONT, textTransform: 'uppercase',
                    letterSpacing: '0.04em', fontSize: 10, color: C.muted, fontWeight: 400,
                    borderBottom: `1px solid ${C.line}`, minWidth: 210,
                  }}>Journey</th>
                  {hm.frontlines.map((f) => (
                    <th key={f} style={{
                      padding: '6px 8px', fontFamily: KONE_FONT, textTransform: 'uppercase',
                      letterSpacing: '0.04em', fontSize: 10, color: C.muted, fontWeight: 400,
                      borderBottom: `1px solid ${C.line}`, whiteSpace: 'nowrap',
                    }}>{f}</th>
                  ))}
                  <th style={{
                    padding: '6px 8px', fontFamily: KONE_FONT, textTransform: 'uppercase',
                    letterSpacing: '0.04em', fontSize: 10, color: C.muted, fontWeight: 400,
                    borderBottom: `1px solid ${C.line}`,
                  }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {hm.journeys.map((j, ri) => {
                  const row = hm.grid[ri] || []
                  const total = row.reduce((a, b) => a + b, 0)
                  return (
                    <tr key={j}>
                      <td style={{
                        position: 'sticky', left: 0, background: '#fff', padding: '5px 10px',
                        borderBottom: `1px solid ${C.line}`, color: C.ink, whiteSpace: 'nowrap',
                      }}>{j}</td>
                      {row.map((v, ci) => (
                        <td key={ci} title={`${j} · ${hm.frontlines[ci]}: ${v}`}
                            style={{
                              padding: '5px 8px', textAlign: 'center', minWidth: 40,
                              background: heatColour(v, hm.max),
                              color: v && v / (hm.max || 1) > 0.55 ? '#fff' : C.ink,
                              borderBottom: `1px solid ${C.line}`,
                              fontWeight: v ? 600 : 400,
                            }}>
                          {v || ''}
                        </td>
                      ))}
                      <td style={{
                        padding: '5px 8px', textAlign: 'center', fontWeight: 700,
                        borderBottom: `1px solid ${C.line}`, color: C.ink,
                      }}>{total}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── Delivery against plan ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20 }}>
        <Card title="Delivery against the planned quarter"
              subtitle="Of the journeys that were worked on">
          <ResponsiveContainer width="100%" height={230}>
            <BarChart
              data={[
                { name: 'On plan', value: slip.on_plan || 0, fill: C.done },
                { name: 'Later', value: slip.later || 0, fill: '#ffe141' },
                { name: 'Earlier', value: slip.earlier || 0, fill: C.inProgress },
                { name: 'Moved out', value: slip.moved || 0, fill: C.rejected },
                { name: 'No quarter set', value: slip.no_quarter || 0, fill: C.unassigned },
              ]}
              margin={{ top: 16, right: 16, left: 0, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={C.line} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fontFamily: KONE_FONT }} stroke={C.muted}
                     interval={0} />
              <YAxis tick={{ fontSize: 11 }} stroke={C.muted} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${C.line}` }} />
              <Bar isAnimationActive={false} dataKey="value" radius={[4, 4, 0, 0]}>
                {[C.done, '#ffe141', C.inProgress, C.rejected, C.unassigned].map((c, i) => (
                  <Cell key={i} fill={c} />
                ))}
                <LabelList dataKey="value" position="top"
                           style={{ fontSize: 11, fill: C.muted, fontFamily: KONE_FONT }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Biggest journeys by volume"
              subtitle="Where the team's capacity actually goes">
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={(m.by_journey || []).slice(0, 7)} layout="vertical"
                      margin={{ top: 4, right: 40, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.line} horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} stroke={C.muted} allowDecimals={false} />
              <YAxis type="category" dataKey="name" width={140}
                     tick={{ fontSize: 10, fontFamily: KONE_FONT }} stroke={C.muted} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${C.line}` }}
                       formatter={(v, _n, p) => [`${v} journeys · ${pct(p.payload.done_pct)} done`, 'Volume']} />
              <Bar isAnimationActive={false} dataKey="total" fill={C.done} radius={[0, 4, 4, 0]}>
                <LabelList dataKey="total" position="right"
                           style={{ fontSize: 11, fill: C.muted, fontFamily: KONE_FONT }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* ── Journeys that arrived late ── */}
      {!!(m.late_rows || []).length && (
        <Card title="Landed later than planned"
              subtitle={`${slip.later} journeys slipped past their planned quarter`}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  {['Journey', 'Frontline', 'Planned', 'Completed'].map((h) => (
                    <th key={h} style={{
                      textAlign: 'left', padding: '7px 10px', fontFamily: KONE_FONT,
                      textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 10,
                      color: C.muted, fontWeight: 400, borderBottom: `1px solid ${C.line}`,
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {m.late_rows.map((r, i) => (
                  <tr key={i}>
                    <td style={{ padding: '6px 10px', borderBottom: `1px solid ${C.line}` }}>{r.instance}</td>
                    <td style={{ padding: '6px 10px', borderBottom: `1px solid ${C.line}` }}>{r.frontline}</td>
                    <td style={{ padding: '6px 10px', borderBottom: `1px solid ${C.line}`, color: C.muted }}>{r.planned}</td>
                    <td style={{ padding: '6px 10px', borderBottom: `1px solid ${C.line}`, fontWeight: 600 }}>{r.completed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── Data quality ── */}
      {!!(m.contradictions || []).length && (
        <Card title="Rows that contradict themselves"
              subtitle="Marked rejected or unassigned, yet carrying a completion quarter">
          <SectionNote>
            These are counted as not utilised above, because status is what the utilisation
            definition rests on. Only whoever maintains the sheet knows which of the two
            fields is wrong, so nothing here has been corrected automatically.
          </SectionNote>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  {['Row', 'Journey', 'Status', 'Completed In'].map((h) => (
                    <th key={h} style={{
                      textAlign: 'left', padding: '7px 10px', fontFamily: KONE_FONT,
                      textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 10,
                      color: C.muted, fontWeight: 400, borderBottom: `1px solid ${C.line}`,
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {m.contradictions.map((c) => (
                  <tr key={c.row_id}>
                    <td style={{ padding: '6px 10px', borderBottom: `1px solid ${C.line}`, fontFamily: KONE_FONT, color: C.done }}>{c.row_id}</td>
                    <td style={{ padding: '6px 10px', borderBottom: `1px solid ${C.line}` }}>{c.instance}</td>
                    <td style={{ padding: '6px 10px', borderBottom: `1px solid ${C.line}` }}>{c.status}</td>
                    <td style={{ padding: '6px 10px', borderBottom: `1px solid ${C.line}` }}>{c.completed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>
        {m.row_count || 0} rows{m.filename ? ` from ${m.filename}` : ''}
        {m.uploaded_at ? `, uploaded ${new Date(m.uploaded_at).toLocaleString()}` : ''}.
        Re-upload on the ServiceNow Master page's Service 2 tab to refresh.
      </p>
    </div>
  )
}
