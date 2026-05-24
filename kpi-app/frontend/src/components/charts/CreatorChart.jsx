import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'

const COLORS = ['#6366f1','#f59e0b','#10b981','#ef4444','#3b82f6','#8b5cf6','#ec4899','#14b8a6','#f97316','#84cc16']

export default function CreatorChart({ data = [], limit = 20 }) {
  if (!data.length) return <Empty />

  const sorted = [...data].sort((a, b) => b.count - a.count).slice(0, limit)

  return (
    <ResponsiveContainer width="100%" height={Math.max(200, sorted.length * 28)}>
      <BarChart data={sorted} layout="vertical" margin={{ top: 0, right: 30, left: 120, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11, fill: '#6b7280' }} allowDecimals={false} />
        <YAxis type="category" dataKey="creator" tick={{ fontSize: 11, fill: '#6b7280' }} width={115} />
        <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }} />
        <Bar dataKey="count" name="Tickets" radius={[0, 4, 4, 0]}>
          {sorted.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function Empty() {
  return <div className="h-64 flex items-center justify-center text-gray-400 text-sm">No data available</div>
}
