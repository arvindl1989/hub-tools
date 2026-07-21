import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { PALETTE } from '../../utils/colors'

export default function MiniPieChart({ data = [], labelKey, height = 220 }) {
  if (!data.length) return <Empty />
  const sorted = [...data].sort((a, b) => b.count - a.count)
  const total = sorted.reduce((s, d) => s + d.count, 0)

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie data={sorted} dataKey="count" nameKey={labelKey} cx="50%" cy="50%" innerRadius={48} outerRadius={78} paddingAngle={2}>
            {sorted.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
          </Pie>
          <Tooltip
            contentStyle={{ borderRadius: 8, border: '1px solid #e8e2d6', fontSize: 12 }}
            formatter={(v, n) => [`${v} (${total ? Math.round(v / total * 100) : 0}%)`, n]}
          />
        </PieChart>
      </ResponsiveContainer>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', justifyContent: 'center', marginTop: 4, maxHeight: 60, overflowY: 'auto' }}>
        {sorted.map((d, i) => (
          <span key={d[labelKey]} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#404040', whiteSpace: 'nowrap' }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: PALETTE[i % PALETTE.length], flexShrink: 0 }} />
            {d[labelKey]} ({d.count})
          </span>
        ))}
      </div>
    </div>
  )
}

function Empty() {
  return (
    <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9c9c9c', fontSize: 13 }}>
      No data
    </div>
  )
}
