import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-xs space-y-1 min-w-[160px]">
      <p className="font-semibold text-gray-700 mb-2">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex justify-between gap-4">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-medium" style={{ color: p.color }}>
            {p.name === 'Net' && p.value > 0 ? '+' : ''}{p.value}
          </span>
        </div>
      ))}
    </div>
  )
}

export default function InflowOutflowChart({ data = [], noDateCols = false }) {
  if (!data.length) return <Empty noDateCols={noDateCols} />

  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 70 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: '#6b7280' }}
          angle={-40}
          textAnchor="end"
          interval={0}
        />
        <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#6b7280' }} allowDecimals={false} />
        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#9ca3af' }} allowDecimals={false} />
        <Tooltip content={<CustomTooltip />} />
        <Legend verticalAlign="top" wrapperStyle={{ fontSize: 12, paddingBottom: 8 }} />
        <ReferenceLine yAxisId="right" y={0} stroke="#d1d5db" strokeDasharray="4 4" />
        <Bar yAxisId="left" dataKey="inflow"  name="Inflow (Created)" fill="#6366f1" radius={[3,3,0,0]} />
        <Bar yAxisId="left" dataKey="outflow" name="Outflow (Closed)"  fill="#22c55e" radius={[3,3,0,0]} />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="net"
          name="Net"
          stroke="#f59e0b"
          strokeWidth={2}
          dot={{ r: 3, fill: '#f59e0b' }}
          activeDot={{ r: 5 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

function Empty({ noDateCols }) {
  return (
    <div style={{ height: 180, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      <span style={{ fontSize: 13, color: '#9ca3af' }}>No data for this range</span>
      {noDateCols && (
        <span style={{ fontSize: 11, color: '#c0305a', background: '#fff0f4', border: '1px solid #ffcdd7', borderRadius: 6, padding: '4px 10px' }}>
          No "Created" date column recognised — check your Google Sheet column names
        </span>
      )}
    </div>
  )
}
