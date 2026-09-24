import { useMemo, useState } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'

// Each series keeps the colour it has always had here, so switching views does
// not repaint the same quantity a different colour.
const SERIES = {
  inflow:  { key: 'inflow',  label: 'Inflow (Created)', colour: '#1450f5' },
  outflow: { key: 'outflow', label: 'Outflow (Closed)', colour: '#1e8a5e' },
  net:     { key: 'net',     label: 'Net',              colour: '#b87d00' },
}

const VIEWS = [
  ['all',     'All'],
  ['inflow',  'Inflow'],
  ['outflow', 'Outflow'],
  ['net',     'Net'],
]

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-xs space-y-1 min-w-[160px]">
      <p className="font-semibold text-gray-700 mb-2">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex justify-between gap-4">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-medium" style={{ color: p.color }}>
            {p.name === 'Net' && p.value > 0 ? '+' : ''}{p.value}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── The figures that belong to whichever view is open ─────────────────────────
// A single series on its own says little without its totals, so each view
// carries the few numbers that answer what it is being looked at for: volume
// and where the peak fell for inflow and outflow, and for net how many periods
// added to the backlog against how many cleared it.
function statsFor(view, data) {
  if (!data.length) return []
  const sum = (k) => data.reduce((a, d) => a + (Number(d[k]) || 0), 0)
  const peak = (k) => data.reduce((a, d) => ((Number(d[k]) || 0) > (Number(a[k]) || 0) ? d : a), data[0])
  const avg = (k) => Math.round((sum(k) / data.length) * 10) / 10
  const signed = (n) => `${n > 0 ? '+' : ''}${n}`

  if (view === 'inflow') {
    const p = peak('inflow')
    return [
      ['Total created', sum('inflow')],
      ['Average per period', avg('inflow')],
      ['Busiest period', `${p.label} · ${p.inflow}`],
    ]
  }
  if (view === 'outflow') {
    const p = peak('outflow')
    return [
      ['Total closed', sum('outflow')],
      ['Average per period', avg('outflow')],
      ['Best period', `${p.label} · ${p.outflow}`],
    ]
  }
  if (view === 'net') {
    const net = sum('net')
    const adding = data.filter(d => Number(d.net) > 0).length
    const clearing = data.filter(d => Number(d.net) < 0).length
    const worst = peak('net')
    const worstNet = Number(worst.net) || 0
    return [
      ['Net over the range', signed(net)],
      ['Periods adding backlog', `${adding} of ${data.length}`],
      ['Periods clearing it', `${clearing} of ${data.length}`],
      // A max over a range that only ever cleared would name the least-negative
      // period as the biggest build-up, which is the opposite of what happened.
      ['Largest build-up', worstNet > 0 ? `${worst.label} · ${signed(worstNet)}` : 'None — every period cleared'],
    ]
  }
  const inflow = sum('inflow')
  const outflow = sum('outflow')
  return [
    ['Total created', inflow],
    ['Total closed', outflow],
    ['Net', signed(inflow - outflow)],
    ['Closed against created', inflow ? `${Math.round((outflow / inflow) * 100)}%` : '—'],
  ]
}

export default function InflowOutflowChart({ data = [], noDateCols = false }) {
  const [view, setView] = useState('all')
  const stats = useMemo(() => statsFor(view, data), [view, data])

  if (!data.length) return <Empty noDateCols={noDateCols} />

  const showInflow = view === 'all' || view === 'inflow'
  const showOutflow = view === 'all' || view === 'outflow'
  const showNet = view === 'all' || view === 'net'
  // Net shares the chart with the bars on its own axis so a small net is not
  // flattened against a tall bar; on its own it has the chart to itself and
  // needs only one.
  const splitAxis = view === 'all'

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ display: 'inline-flex', border: '1px solid #e8e2d6', borderRadius: 8, overflow: 'hidden' }}>
          {VIEWS.map(([id, label]) => {
            const active = view === id
            const tone = SERIES[id]?.colour || '#1450f5'
            return (
              <button
                key={id}
                onClick={() => setView(id)}
                style={{
                  padding: '5px 14px', fontSize: 12, fontWeight: active ? 600 : 500,
                  border: 'none', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                  background: active ? tone : '#fff',
                  color: active ? '#fff' : '#6e6e6e',
                  borderRight: '1px solid #e8e2d6',
                }}
              >
                {label}
              </button>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          {stats.map(([label, value]) => (
            <div key={label}>
              <div style={{ fontSize: 10, color: '#9c9c9c', fontFamily: 'Inter, sans-serif' }}>{label}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#141414', fontFamily: 'Inter, sans-serif' }}>
                {value}
              </div>
            </div>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={data} margin={{ top: 5, right: splitAxis ? 20 : 8, left: 0, bottom: 70 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1ede3" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: '#6e6e6e' }}
            angle={-40}
            textAnchor="end"
            interval={0}
          />
          <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#6e6e6e' }} allowDecimals={false} />
          {splitAxis && (
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#9c9c9c' }} allowDecimals={false} />
          )}
          <Tooltip content={<CustomTooltip />} />
          <Legend verticalAlign="top" wrapperStyle={{ fontSize: 12, paddingBottom: 8 }} />
          {showNet && (
            <ReferenceLine yAxisId={splitAxis ? 'right' : 'left'} y={0} stroke="#d8d8d8" strokeDasharray="4 4" />
          )}
          {showInflow && (
            <Bar yAxisId="left" dataKey="inflow" name={SERIES.inflow.label}
                 fill={SERIES.inflow.colour} radius={[3, 3, 0, 0]} />
          )}
          {showOutflow && (
            <Bar yAxisId="left" dataKey="outflow" name={SERIES.outflow.label}
                 fill={SERIES.outflow.colour} radius={[3, 3, 0, 0]} />
          )}
          {showNet && (
            <Line
              yAxisId={splitAxis ? 'right' : 'left'}
              type="monotone"
              dataKey="net"
              name={SERIES.net.label}
              stroke={SERIES.net.colour}
              strokeWidth={2}
              dot={{ r: 3, fill: SERIES.net.colour }}
              activeDot={{ r: 5 }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

function Empty({ noDateCols }) {
  return (
    <div style={{ height: 180, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      <span style={{ fontSize: 13, color: '#9c9c9c' }}>No data for this range</span>
      {noDateCols && (
        <span style={{ fontSize: 11, color: '#c0305a', background: '#fff0f3', border: '1px solid #ffcdd7', borderRadius: 6, padding: '4px 10px' }}>
          No "Created" date column recognised — check your Google Sheet column names
        </span>
      )}
    </div>
  )
}
