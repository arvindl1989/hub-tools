import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts'

const BUCKET_COLORS = {
  '0–7 days':   '#d2f5ff',
  '8–30 days':  '#ffe141',
  '31–90 days': '#ffcdd7',
  '91+ days':   '#c0305a',
}

function getBucketColor(label, fallback) {
  return BUCKET_COLORS[label] ?? fallback ?? '#e8e3da'
}

export default function BacklogAgeChart({ data = [] }) {
  if (!data.length || data.every((d) => d.count === 0))
    return <div className="h-40 flex items-center justify-center text-gray-400 text-sm">No active tickets</div>

  const total = data.reduce((s, d) => s + d.count, 0)

  return (
    <div className="space-y-3">
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 60, left: 10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0ece4" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 11, fill: '#9ca3af', fontFamily: 'Inter' }} allowDecimals={false} />
          <YAxis type="category" dataKey="label" tick={{ fontSize: 12, fill: '#374151', fontFamily: 'Inter' }} width={85} />
          <Tooltip
            formatter={(v) => [`${v} tickets (${total > 0 ? Math.round(v / total * 100) : 0}%)`, 'Count']}
            contentStyle={{ borderRadius: 10, border: '1px solid #e8e3da', fontSize: 12, fontFamily: 'Inter' }}
          />
          <Bar dataKey="count" radius={[0, 6, 6, 0]} maxBarSize={32}>
            {data.map((d) => <Cell key={d.label} fill={getBucketColor(d.label, d.color)} />)}
            <LabelList dataKey="count" position="right" style={{ fontSize: 12, fontWeight: 700, fill: '#374151', fontFamily: 'Inter' }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Percentage breakdown */}
      <div className="flex gap-3 flex-wrap">
        {data.map((d) => (
          <div key={d.label} className="flex items-center gap-1.5 text-xs">
            <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: getBucketColor(d.label, d.color) }} />
            <span className="text-gray-500">{d.label}</span>
            <span className="font-bold text-gray-700">
              {total > 0 ? `${Math.round(d.count / total * 100)}%` : '0%'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
