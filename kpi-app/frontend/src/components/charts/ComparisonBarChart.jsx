import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

const COLOR_A = '#1450f5'
const COLOR_B = '#e86427'

// Grouped bar chart merging two period datasets (each [{ [labelKey]: name, count }])
// into one row per category, so A vs B is directly comparable per category.
export default function ComparisonBarChart({ dataA = [], dataB = [], labelKey, labelA, labelB, height = 300, topN = 12 }) {
  const merged = new Map()
  for (const r of dataA) merged.set(r[labelKey], { name: r[labelKey], a: r.count, b: 0 })
  for (const r of dataB) {
    const existing = merged.get(r[labelKey])
    if (existing) existing.b = r.count
    else merged.set(r[labelKey], { name: r[labelKey], a: 0, b: r.count })
  }
  const rows = [...merged.values()]
    .sort((x, y) => (y.a + y.b) - (x.a + x.b))
    .slice(0, topN)

  if (!rows.length) return <Empty />

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} margin={{ top: 8, right: 10, left: 0, bottom: 60 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0ece4" />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9c9c9c', fontFamily: 'Inter' }} angle={-35} textAnchor="end" interval={0} />
        <YAxis tick={{ fontSize: 11, fill: '#9c9c9c', fontFamily: 'Inter' }} allowDecimals={false} />
        <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e8e2d6', fontSize: 12 }} />
        <Legend verticalAlign="top" wrapperStyle={{ fontSize: 11, paddingBottom: 8, fontFamily: 'Inter' }} />
        <Bar dataKey="a" name={labelA} fill={COLOR_A} radius={[3, 3, 0, 0]} />
        <Bar dataKey="b" name={labelB} fill={COLOR_B} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

function Empty() {
  return <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9c9c9c', fontSize: 13 }}>No data</div>
}
