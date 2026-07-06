import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

export default function WeeklyChart({ data = [], limit = 26 }) {
  const visible = data.slice(-limit)
  if (!visible.length) return <Empty />

  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={visible} margin={{ top: 8, right: 10, left: 0, bottom: 80 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0ece4" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: '#9c9c9c', fontFamily: 'Inter' }}
          angle={-45}
          textAnchor="end"
          interval={0}
        />
        <YAxis tick={{ fontSize: 11, fill: '#9c9c9c', fontFamily: 'Inter' }} allowDecimals={false} />
        <Tooltip
          contentStyle={{ borderRadius: 10, border: '1px solid #e8e3da', fontSize: 12, fontFamily: 'Inter' }}
          cursor={{ fill: '#f5f3ef' }}
        />
        <Legend verticalAlign="top" wrapperStyle={{ fontSize: 12, paddingBottom: 8, fontFamily: 'Inter' }} />
        <Bar dataKey="created" name="Created" fill="#1450f5" radius={[3, 3, 0, 0]} />
        <Bar dataKey="closed" name="Closed" fill="#1e8a5e" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

function Empty() {
  return <div className="h-64 flex items-center justify-center text-gray-400 text-sm">No data available</div>
}
