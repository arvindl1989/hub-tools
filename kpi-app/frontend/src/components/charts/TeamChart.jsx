import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'

const COLORS = ['#1450f5','#b87d00','#1e8a5e','#c0305a','#1450f5','#0077a8','#c0305a','#0aa08f','#e86427','#6b8f00','#0077a8','#f28ba0','#1e8a5e','#ffe141','#7296f9','#79c7e3','#e07694']

export default function TeamChart({ data = [] }) {
  if (!data.length) return <Empty />
  const sorted = [...data].sort((a, b) => b.count - a.count)

  return (
    <ResponsiveContainer width="100%" height={Math.max(180, sorted.length * 36)}>
      <BarChart data={sorted} layout="vertical" margin={{ top: 0, right: 30, left: 110, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#ece7dc" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11, fill: '#6e6e6e' }} allowDecimals={false} />
        <YAxis type="category" dataKey="team" tick={{ fontSize: 11, fill: '#6e6e6e' }} width={105} />
        <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e8e2d6', fontSize: 12 }} />
        <Bar dataKey="count" name="Tickets" radius={[0, 4, 4, 0]}>
          {sorted.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function Empty() {
  return <div className="h-40 flex items-center justify-center text-gray-400 text-sm">No team data available</div>
}
