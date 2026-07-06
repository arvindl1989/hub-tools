import {
  ComposedChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

// ── Chart ─────────────────────────────────────────────────────────────────────

function PipelineTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const completed = payload.find(p => p.dataKey === 'completed')?.value ?? 0
  const rejected  = payload.find(p => p.dataKey === 'rejected')?.value  ?? 0
  const open      = payload.find(p => p.dataKey === 'open')?.value      ?? 0
  return (
    <div style={{
      background: '#fff', border: '1px solid #e8e2d6', borderRadius: 10,
      boxShadow: '0 4px 16px rgba(0,0,0,0.1)', padding: '10px 14px',
      fontSize: 12, minWidth: 190,
    }}>
      <p style={{ fontWeight: 700, color: '#404040', marginBottom: 8, marginTop: 0 }}>{label}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <TRow color="#1e8a5e" label="Cumul. Completed" value={completed} />
        <TRow color="#9c9c9c" label="Cumul. Rejected"  value={rejected}  />
        <TRow color="#b87d00" label="Open Pipeline"    value={open}      bold />
        <div style={{ borderTop: '1px solid #f1ede3', marginTop: 3, paddingTop: 5 }}>
          <TRow color="#1450f5" label="Cumul. Created" value={completed + rejected + open} bold />
        </div>
      </div>
    </div>
  )
}

function TRow({ color, label, value, bold }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
      <span style={{ color, fontWeight: bold ? 700 : 500 }}>{label}</span>
      <span style={{ fontWeight: bold ? 700 : 600, color: '#141414' }}>{value}</span>
    </div>
  )
}

export function buildPipelineData(data) {
  let cumCreated   = 0
  let cumCompleted = 0
  let cumRejected  = 0
  return data.map(r => {
    cumCreated   += r.inflow             || 0
    cumCompleted += r.closed_completed   || 0
    cumRejected  += r.closed_rejected    || 0
    const open    = Math.max(0, cumCreated - cumCompleted - cumRejected)
    return { label: r.label, completed: cumCompleted, rejected: cumRejected, open }
  })
}

export default function PipelineChart({ data = [] }) {
  if (!data.length) return (
    <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9c9c9c', fontSize: 13 }}>
      No data for this range
    </div>
  )

  const chartData = buildPipelineData(data)
  const maxY = Math.max(...chartData.map(d => d.completed + d.rejected + d.open), 1)

  return (
    <div style={{ marginTop: 20 }}>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 20, left: 0, bottom: 70 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#ece7dc" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: '#6e6e6e' }}
            angle={-40}
            textAnchor="end"
            interval={0}
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#6e6e6e' }}
            allowDecimals={false}
            domain={[0, Math.ceil(maxY * 1.1)]}
          />
          <Tooltip content={<PipelineTooltip />} />
          <Legend
            verticalAlign="top"
            wrapperStyle={{ fontSize: 12, paddingBottom: 8 }}
            formatter={(v) =>
              v === 'completed' ? 'Cumul. Completed' :
              v === 'rejected'  ? 'Cumul. Rejected'  :
              v === 'open'      ? 'Open Pipeline'     : v
            }
          />
          {/* Stacked: completed (green) + rejected (gray) + open pipeline (amber) */}
          <Area type="monotone" dataKey="completed" name="completed" stackId="pl"
            fill="#d3efe0" stroke="#1e8a5e" strokeWidth={2} fillOpacity={0.85} dot={false}
            activeDot={{ r: 4, fill: '#1e8a5e' }} />
          <Area type="monotone" dataKey="rejected"  name="rejected"  stackId="pl"
            fill="#f1ede3" stroke="#9c9c9c" strokeWidth={1.5} fillOpacity={0.75} dot={false}
            activeDot={{ r: 4, fill: '#9c9c9c' }} />
          <Area type="monotone" dataKey="open"      name="open"      stackId="pl"
            fill="#fff3b0" stroke="#b87d00" strokeWidth={2} fillOpacity={0.75} dot={false}
            activeDot={{ r: 4, fill: '#b87d00' }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Table ─────────────────────────────────────────────────────────────────────

function _cellStyle(bg = '#fff') {
  return {
    padding: '7px 12px', textAlign: 'center',
    fontSize: 12, color: '#404040',
    borderRight: '1px solid #f3eee6',
    background: bg,
  }
}

const HDR = {
  padding: '8px 12px', fontSize: 11, fontWeight: 700,
  background: '#1450f5', color: '#fff',
  borderRight: '1px solid #3b70f7',
  textAlign: 'center', whiteSpace: 'nowrap',
}

const STICKY = (left, bg) => ({ position: 'sticky', left, zIndex: 1, background: bg, whiteSpace: 'nowrap' })

const METRIC_W = 140

function pipelineColor(open, totalCreated) {
  if (!totalCreated) return {}
  const pct = open / totalCreated * 100
  if (pct > 60) return { background: '#ffdee5', color: '#8c1a2e' }
  if (pct > 30) return { background: '#fff6c4', color: '#7a5400' }
  return { background: '#d3efe0', color: '#147a50' }
}

export function PipelineTable({ data = [] }) {
  if (!data.length) return null

  // Compute per-period open pipeline (delta, not cumulative) and cumulative totals
  let cumCreated   = 0
  let cumCompleted = 0
  let cumRejected  = 0

  const rows = data.map(r => {
    cumCreated   += r.inflow           || 0
    cumCompleted += r.closed_completed || 0
    cumRejected  += r.closed_rejected  || 0
    return {
      ...r,
      open_pipeline: Math.max(0, cumCreated - cumCompleted - cumRejected),
    }
  })

  const totalCreated   = rows.reduce((s, r) => s + (r.inflow           || 0), 0)
  const totalCompleted = rows.reduce((s, r) => s + (r.closed_completed || 0), 0)
  const totalRejected  = rows.reduce((s, r) => s + (r.closed_rejected  || 0), 0)
  const finalOpen      = Math.max(0, totalCreated - totalCompleted - totalRejected)

  const metrics = [
    { key: 'inflow',           label: 'Created',         total: totalCreated,   color: '#1450f5', bg: '#eef3fe' },
    { key: 'closed_completed', label: 'Closed Completed',total: totalCompleted, color: '#147a50', bg: '#d3efe0' },
    { key: 'closed_rejected',  label: 'Closed Rejected', total: totalRejected,  color: '#6e6e6e', bg: '#f1ede3' },
    { key: 'open_pipeline',    label: 'Open Pipeline',   total: finalOpen,      color: '#8a5f00', bg: '#fff3b0', derived: true },
  ]

  return (
    <div style={{ marginTop: 16, overflowX: 'auto', borderRadius: 8, border: '1px solid #e8e2d6' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: '100%' }}>
        <thead>
          <tr>
            <th style={{ ...HDR, textAlign: 'left', minWidth: METRIC_W, ...STICKY(0, '#1450f5') }}>
              Metric
            </th>
            <th style={{ ...HDR, minWidth: 72 }}>Total</th>
            {data.map(r => (
              <th key={r.period} style={{ ...HDR, minWidth: 110 }}>{r.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {metrics.map((m, mi) => {
            const rowBg = mi % 2 === 0 ? '#fff' : '#faf8f3'
            return (
              <tr key={m.key}>
                <td style={{
                  ..._cellStyle(rowBg), ...STICKY(0, rowBg),
                  textAlign: 'left', fontWeight: 600,
                  color: m.derived ? m.color : '#404040',
                  borderRight: '2px solid #e8e2d6',
                  borderBottom: m.derived ? '2px solid #e8e2d6' : undefined,
                  borderTop:    m.derived ? '2px solid #e8e2d6' : undefined,
                }}>
                  {m.label}
                </td>
                <td style={{
                  ..._cellStyle(m.bg), fontWeight: 700, color: m.color,
                }}>
                  {m.total.toLocaleString()}
                </td>
                {rows.map(r => {
                  const val = r[m.key] ?? 0
                  const extra = m.key === 'open_pipeline'
                    ? pipelineColor(val, r.inflow || 0)
                    : {}
                  return (
                    <td key={r.period} style={{
                      ..._cellStyle(rowBg),
                      ...extra,
                      fontWeight: m.derived ? 700 : val ? 500 : 400,
                      color: extra.color ?? (val ? m.color : '#d8d8d8'),
                    }}>
                      {val || '—'}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
