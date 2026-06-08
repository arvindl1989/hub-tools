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
      background: '#fff', border: '1px solid #e5e8ef', borderRadius: 10,
      boxShadow: '0 4px 16px rgba(0,0,0,0.1)', padding: '10px 14px',
      fontSize: 12, minWidth: 190,
    }}>
      <p style={{ fontWeight: 700, color: '#374151', marginBottom: 8, marginTop: 0 }}>{label}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <TRow color="#22c55e" label="Cumul. Completed" value={completed} />
        <TRow color="#94a3b8" label="Cumul. Rejected"  value={rejected}  />
        <TRow color="#f59e0b" label="Open Pipeline"    value={open}      bold />
        <div style={{ borderTop: '1px solid #f3f4f6', marginTop: 3, paddingTop: 5 }}>
          <TRow color="#6366f1" label="Cumul. Created" value={completed + rejected + open} bold />
        </div>
      </div>
    </div>
  )
}

function TRow({ color, label, value, bold }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
      <span style={{ color, fontWeight: bold ? 700 : 500 }}>{label}</span>
      <span style={{ fontWeight: bold ? 700 : 600, color: '#111827' }}>{value}</span>
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
    <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 13 }}>
      No data for this range
    </div>
  )

  const chartData = buildPipelineData(data)
  const maxY = Math.max(...chartData.map(d => d.completed + d.rejected + d.open), 1)

  return (
    <div style={{ marginTop: 20 }}>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 20, left: 0, bottom: 70 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: '#6b7280' }}
            angle={-40}
            textAnchor="end"
            interval={0}
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#6b7280' }}
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
            fill="#dcfce7" stroke="#22c55e" strokeWidth={2} fillOpacity={0.85} dot={false}
            activeDot={{ r: 4, fill: '#22c55e' }} />
          <Area type="monotone" dataKey="rejected"  name="rejected"  stackId="pl"
            fill="#f1f5f9" stroke="#94a3b8" strokeWidth={1.5} fillOpacity={0.75} dot={false}
            activeDot={{ r: 4, fill: '#94a3b8' }} />
          <Area type="monotone" dataKey="open"      name="open"      stackId="pl"
            fill="#fef3c7" stroke="#f59e0b" strokeWidth={2} fillOpacity={0.75} dot={false}
            activeDot={{ r: 4, fill: '#f59e0b' }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Table ─────────────────────────────────────────────────────────────────────

function _cellStyle(bg = '#fff') {
  return {
    padding: '7px 12px', textAlign: 'center',
    fontSize: 12, color: '#374151',
    borderRight: '1px solid #f0f3fa',
    background: bg,
  }
}

const HDR = {
  padding: '8px 12px', fontSize: 11, fontWeight: 700,
  background: '#1450f5', color: '#fff',
  borderRight: '1px solid #3b6fff',
  textAlign: 'center', whiteSpace: 'nowrap',
}

const STICKY = (left, bg) => ({ position: 'sticky', left, zIndex: 1, background: bg, whiteSpace: 'nowrap' })

const METRIC_W = 140

function pipelineColor(open, totalCreated) {
  if (!totalCreated) return {}
  const pct = open / totalCreated * 100
  if (pct > 60) return { background: '#fee2e2', color: '#991b1b' }
  if (pct > 30) return { background: '#fef9c3', color: '#854d0e' }
  return { background: '#dcfce7', color: '#15803d' }
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
    { key: 'inflow',           label: 'Created',         total: totalCreated,   color: '#1450f5', bg: '#f0f4ff' },
    { key: 'closed_completed', label: 'Closed Completed',total: totalCompleted, color: '#15803d', bg: '#dcfce7' },
    { key: 'closed_rejected',  label: 'Closed Rejected', total: totalRejected,  color: '#64748b', bg: '#f1f5f9' },
    { key: 'open_pipeline',    label: 'Open Pipeline',   total: finalOpen,      color: '#b45309', bg: '#fef3c7', derived: true },
  ]

  return (
    <div style={{ marginTop: 16, overflowX: 'auto', borderRadius: 8, border: '1px solid #e5e8ef' }}>
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
            const rowBg = mi % 2 === 0 ? '#fff' : '#f9fafb'
            return (
              <tr key={m.key}>
                <td style={{
                  ..._cellStyle(rowBg), ...STICKY(0, rowBg),
                  textAlign: 'left', fontWeight: 600,
                  color: m.derived ? m.color : '#374151',
                  borderRight: '2px solid #e5e8ef',
                  borderBottom: m.derived ? '2px solid #e5e8ef' : undefined,
                  borderTop:    m.derived ? '2px solid #e5e8ef' : undefined,
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
                      color: extra.color ?? (val ? m.color : '#d1d5db'),
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
