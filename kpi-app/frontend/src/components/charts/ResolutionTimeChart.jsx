import { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList,
} from 'recharts'

const COLORS = ['#6366f1','#f59e0b','#10b981','#ef4444','#3b82f6','#8b5cf6','#ec4899','#14b8a6','#f97316','#84cc16']

const VIEWS = [
  { id: 'by_sub_category', label: 'By Sub Category', key: 'sub_category' },
  { id: 'by_assignee',     label: 'By Assignee',     key: 'assigned_to'  },
  { id: 'by_team',         label: 'By Team',         key: 'team'         },
]

export default function ResolutionTimeChart({ data }) {
  const [view, setView] = useState('by_sub_category')
  if (!data) return <Empty />

  const cfg   = VIEWS.find((v) => v.id === view)
  const rows  = data[view] ?? []

  if (!rows.length) return (
    <div>
      <ViewToggle view={view} setView={setView} />
      <div className="h-48 flex items-center justify-center text-gray-400 text-sm mt-4">No resolved tickets for this filter</div>
    </div>
  )

  return (
    <div>
      <ViewToggle view={view} setView={setView} />
      <ResponsiveContainer width="100%" height={Math.max(180, rows.length * 40)} className="mt-4">
        <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 60, left: 130, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 11, fill: '#6b7280' }} allowDecimals={false}
            label={{ value: 'days', position: 'insideRight', offset: 10, fontSize: 11, fill: '#9ca3af' }} />
          <YAxis type="category" dataKey={cfg.key} tick={{ fontSize: 11, fill: '#374151' }} width={125} />
          <Tooltip
            formatter={(v, name) => [`${v} days`, name]}
            contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
          />
          <Bar dataKey="avg_days" name="Avg resolution" radius={[0, 4, 4, 0]}>
            {rows.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            <LabelList dataKey="avg_days" position="right" style={{ fontSize: 11, fill: '#6b7280' }}
              formatter={(v) => `${v}d`} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Median tooltip note */}
      <p className="text-xs text-gray-400 mt-3 text-right">
        Hover for median · count · based on closed tickets in selected range
      </p>
    </div>
  )
}

function ViewToggle({ view, setView }) {
  return (
    <div className="flex rounded-lg border border-gray-200 overflow-hidden w-fit">
      {VIEWS.map((v) => (
        <button
          key={v.id}
          onClick={() => setView(v.id)}
          className={`px-3 py-1 text-xs font-medium transition-colors ${
            view === v.id ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
          }`}
        >
          {v.label}
        </button>
      ))}
    </div>
  )
}

function Empty() {
  return <div className="h-48 flex items-center justify-center text-gray-400 text-sm">No data available</div>
}
