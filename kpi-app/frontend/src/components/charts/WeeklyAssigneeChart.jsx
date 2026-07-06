import { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

const COLORS = [
  '#1450f5','#b87d00','#1e8a5e','#0077a8','#c0305a',
  '#0077a8','#e86427','#0aa08f','#a63d5f','#6b8f00',
]

export default function WeeklyAssigneeChart({ data = [], assignees = [], limit = 16 }) {
  const [selected, setSelected] = useState([])

  if (!data.weeks?.length) return <Empty />

  const visible = data.weeks.slice(-limit)
  const people = selected.length ? selected : (assignees.length <= 8 ? assignees : assignees.slice(0, 8))

  const toggle = (name) =>
    setSelected((s) => s.includes(name) ? s.filter((x) => x !== name) : [...s, name])

  return (
    <div>
      {assignees.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {assignees.map((a, i) => (
            <button
              key={a}
              onClick={() => toggle(a)}
              className="text-xs px-2.5 py-1 rounded-full border transition-colors"
              style={people.includes(a)
                ? { backgroundColor: COLORS[i % COLORS.length], color: '#ffffff', borderColor: 'transparent' }
                : { backgroundColor: '#ffffff', color: '#6e6e6e', borderColor: '#e8e2d6' }
              }
            >
              {a}
            </button>
          ))}
          {selected.length > 0 && (
            <button onClick={() => setSelected([])} className="text-xs text-gray-400 hover:text-gray-600 px-2">
              Reset
            </button>
          )}
        </div>
      )}

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
          <Legend verticalAlign="top" wrapperStyle={{ fontSize: 11, paddingBottom: 8, fontFamily: 'Inter' }} />
          {people.map((a, i) => (
            <Bar key={a} dataKey={a} stackId="a" fill={COLORS[i % COLORS.length]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function Empty() {
  return <div className="h-64 flex items-center justify-center text-gray-400 text-sm">No data available</div>
}
