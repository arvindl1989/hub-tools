import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { seriesColor, INTER, KONE_FONT } from '../../kone/chartTheme'


export default function CreatorChart({ data = [], limit = 20 }) {
  if (!data.length) return <Empty />

  const sorted = [...data].sort((a, b) => b.count - a.count).slice(0, limit)

  return (
    <ResponsiveContainer width="100%" height={Math.max(200, sorted.length * 28)}>
      <BarChart data={sorted} layout="vertical" margin={{ top: 0, right: 30, left: 120, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1ede3" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11, fill: '#6e6e6e', fontFamily: KONE_FONT}} allowDecimals={false} />
        <YAxis type="category" dataKey="creator" tick={{ fontSize: 11, fill: '#6e6e6e', fontFamily: KONE_FONT}} width={115} />
        <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e8e2d6', fontSize: 12, fontFamily: INTER}} />
        <Bar dataKey="count" name="Tickets" radius={[0, 4, 4, 0]}>
          {sorted.map((_, i) => <Cell key={i} fill={seriesColor(i)} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function Empty() {
  return <div className="h-64 flex items-center justify-center text-gray-400 text-sm">No data available</div>
}
