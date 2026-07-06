import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'

const COLORS = ['#1450f5','#b87d00','#1e8a5e','#c0305a','#1450f5','#0077a8','#c0305a','#0aa08f','#e86427','#6b8f00']

export default function AreaChart({ data = [], view = 'bar' }) {
  if (!data.length) return <Empty />

  const sorted = [...data].sort((a, b) => b.count - a.count)

  return (
    <div>
      {view === 'bar' ? (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={sorted} layout="vertical" margin={{ top: 0, right: 30, left: 100, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ece7dc" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11, fill: '#6e6e6e' }} allowDecimals={false} />
            <YAxis type="category" dataKey="area" tick={{ fontSize: 11, fill: '#6e6e6e' }} width={95} />
            <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e8e2d6', fontSize: 12 }} />
            <Bar dataKey="count" name="Tickets" radius={[0, 4, 4, 0]}>
              {sorted.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie data={sorted} dataKey="count" nameKey="area" cx="50%" cy="50%" outerRadius={100}
              label={({ area, percent }) => `${area} ${(percent * 100).toFixed(0)}%`}
              labelLine={{ strokeWidth: 1 }}>
              {sorted.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e8e2d6', fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

function Empty() {
  return <div className="h-64 flex items-center justify-center text-gray-400 text-sm">No data available</div>
}
