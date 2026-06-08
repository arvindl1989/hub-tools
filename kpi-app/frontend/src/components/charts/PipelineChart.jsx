import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

function PipelineTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const created  = payload.find(p => p.dataKey === 'closed')?.value ?? 0
  const pipeline = payload.find(p => p.dataKey === 'pipeline')?.value ?? 0
  const total    = created + pipeline
  return (
    <div style={{
      background: '#fff', border: '1px solid #e5e8ef', borderRadius: 10,
      boxShadow: '0 4px 16px rgba(0,0,0,0.1)', padding: '10px 14px',
      fontSize: 12, minWidth: 180,
    }}>
      <p style={{ fontWeight: 700, color: '#374151', marginBottom: 8 }}>{label}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <Row color="#22c55e" label="Cumulative Closed" value={created} />
        <Row color="#f59e0b" label="Open Pipeline"     value={pipeline} />
        <div style={{ borderTop: '1px solid #f3f4f6', marginTop: 4, paddingTop: 4 }}>
          <Row color="#6366f1" label="Cumulative Created" value={total} bold />
        </div>
      </div>
    </div>
  )
}

function Row({ color, label, value, bold }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
      <span style={{ color, fontWeight: bold ? 700 : 500 }}>{label}</span>
      <span style={{ fontWeight: bold ? 700 : 600, color: '#111827' }}>{value}</span>
    </div>
  )
}

export default function PipelineChart({ data = [] }) {
  if (!data.length) return (
    <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 13 }}>
      No data for this range
    </div>
  )

  let cumCreated = 0
  let cumClosed  = 0
  const chartData = data.map(r => {
    cumCreated += r.inflow  || 0
    cumClosed  += r.outflow || 0
    return {
      label:    r.label,
      closed:   cumClosed,
      pipeline: Math.max(0, cumCreated - cumClosed),
    }
  })

  const maxY = Math.max(...chartData.map(d => d.closed + d.pipeline), 1)

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: 'linear-gradient(to right, #dcfce7, #22c55e)' }} />
        Cumulative closed (bottom) +
        <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: '#fef3c7', border: '1px solid #f59e0b', marginLeft: 4 }} />
        open pipeline (top) = total created
      </div>
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
            formatter={(value) =>
              value === 'closed'   ? 'Cumulative Closed' :
              value === 'pipeline' ? 'Open Pipeline'     : value
            }
          />
          {/* Stacked: closed (bottom green) + pipeline (top amber) = cumulative created */}
          <Area
            type="monotone"
            dataKey="closed"
            name="closed"
            stackId="pipeline"
            fill="#dcfce7"
            stroke="#22c55e"
            strokeWidth={2}
            fillOpacity={0.85}
            dot={false}
            activeDot={{ r: 4, fill: '#22c55e' }}
          />
          <Area
            type="monotone"
            dataKey="pipeline"
            name="pipeline"
            stackId="pipeline"
            fill="#fef3c7"
            stroke="#f59e0b"
            strokeWidth={2}
            fillOpacity={0.75}
            dot={false}
            activeDot={{ r: 4, fill: '#f59e0b' }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
