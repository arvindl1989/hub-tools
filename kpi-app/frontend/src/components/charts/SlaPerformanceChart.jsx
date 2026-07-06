import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  const total = payload.reduce((s, p) => s + (p.value || 0), 0)
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-xs space-y-1 min-w-[200px]">
      <p className="font-semibold text-gray-700 mb-2 leading-tight">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex justify-between gap-4">
          <span style={{ color: p.fill }}>{p.name}</span>
          <span className="font-medium">{p.value}</span>
        </div>
      ))}
      <div className="border-t border-gray-100 pt-1 flex justify-between font-semibold">
        <span className="text-gray-500">Total</span><span>{total}</span>
      </div>
    </div>
  )
}

export default function SlaPerformanceChart({ data = [] }) {
  if (!data.length) return <Empty />

  // Shorten long sub-category names for the axis
  const display = data.map((d) => ({
    ...d,
    label: d.sub_category.replace('Content Production – ', '').replace('Demand Creation – ', 'DC – '),
  }))

  return (
    <div className="space-y-4">
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={display} margin={{ top: 5, right: 10, left: 0, bottom: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#ece7dc" />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6e6e6e' }} />
          <YAxis tick={{ fontSize: 11, fill: '#6e6e6e' }} allowDecimals={false} />
          <Tooltip content={<CustomTooltip />} />
          <Legend verticalAlign="top" wrapperStyle={{ fontSize: 12, paddingBottom: 8 }} />
          <Bar dataKey="closed_on_time"  name="Closed On Time"   fill="#1e8a5e" stackId="a" radius={[0,0,0,0]} />
          <Bar dataKey="closed_late"     name="Closed Late"      fill="#c0305a" stackId="a" radius={[0,0,0,0]} />
          <Bar dataKey="active_on_track" name="Active – On Track" fill="#1450f5" stackId="b" radius={[0,0,0,0]} />
          <Bar dataKey="active_breached" name="Active – Breached" fill="#e86427" stackId="b" radius={[3,3,0,0]} />
        </BarChart>
      </ResponsiveContainer>

      {/* Summary table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              {['Sub Category', 'Closed On Time', 'Closed Late', '% On Time', 'Active OK', 'Active Breached'].map((h) => (
                <th key={h} className="text-left px-3 py-2 font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {data.map((r) => {
              const pct = r.total_closed > 0 ? Math.round((r.closed_on_time / r.total_closed) * 100) : null
              return (
                <tr key={r.sub_category} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium text-gray-700">{r.sub_category}</td>
                  <td className="px-3 py-2 text-green-600 font-medium">{r.closed_on_time}</td>
                  <td className="px-3 py-2 text-red-500 font-medium">{r.closed_late}</td>
                  <td className="px-3 py-2">
                    {pct !== null ? (
                      <span className={`font-semibold ${pct >= 80 ? 'text-green-600' : pct >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
                        {pct}%
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-2 text-indigo-600">{r.active_on_track}</td>
                  <td className="px-3 py-2 text-orange-500 font-medium">{r.active_breached || '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Empty() {
  return <div className="h-64 flex items-center justify-center text-gray-400 text-sm">No SLA data available</div>
}
