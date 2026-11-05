import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { seriesColor, INTER, KONE_FONT } from '../../kone/chartTheme'


export default function TeamChart({ data = [] }) {
  if (!data.length) return <Empty />
  const sorted = [...data].sort((a, b) => b.count - a.count)

  return (
    <ResponsiveContainer width="100%" height={Math.max(180, sorted.length * 36)}>
      <BarChart data={sorted} layout="vertical" margin={{ top: 0, right: 30, left: 110, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1ede3" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11, fill: '#6e6e6e', fontFamily: KONE_FONT}} allowDecimals={false} />
        <YAxis type="category" dataKey="team" tick={{ fontSize: 11, fill: '#6e6e6e', fontFamily: KONE_FONT}} width={105} />
        <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e8e2d6', fontSize: 12, fontFamily: INTER}} />
        <Bar dataKey="count" name="Tickets" radius={[0, 4, 4, 0]}>
          {sorted.map((_, i) => <Cell key={i} fill={seriesColor(i)} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function Empty() {
  return <div className="h-40 flex items-center justify-center text-gray-400 text-sm">No team data available</div>
}
