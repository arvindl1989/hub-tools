import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'

export default function MonthlyChart({ data = [] }) {
  if (!data.length) return <Empty />

  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data} margin={{ top: 8, right: 10, left: 0, bottom: 80 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0ece4" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: '#9c9c9c', fontFamily: 'Inter' }}
          angle={-40}
          textAnchor="end"
          interval={0}
        />
        <YAxis tick={{ fontSize: 11, fill: '#9c9c9c', fontFamily: 'Inter' }} allowDecimals={false} />
        <Tooltip
          contentStyle={{ borderRadius: 10, border: '1px solid #e8e3da', fontSize: 12, fontFamily: 'Inter' }}
          cursor={{ fill: '#f5f3ef' }}
        />
        <Bar dataKey="count" name="Tickets Created" radius={[4, 4, 0, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill="#1450f5" />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function Empty() {
  return <div className="h-64 flex items-center justify-center text-gray-400 text-sm">No data available</div>
}
