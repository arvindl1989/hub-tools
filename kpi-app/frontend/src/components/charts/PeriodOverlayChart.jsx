import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

const COLOR_A = '#1450f5'
const COLOR_B = '#e86427'

function CustomTooltip({ active, payload, unitLabel, labelA, labelB }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  return (
    <div style={{ background: '#fff', border: '1px solid #e8e2d6', borderRadius: 8, boxShadow: '0 4px 14px rgba(20,20,20,0.12)', padding: '8px 11px', fontSize: 12 }}>
      <div style={{ fontWeight: 700, color: '#141414', marginBottom: 4 }}>{unitLabel} {d.idx + 1}</div>
      {d.aLabel != null && (
        <div style={{ color: COLOR_A }}>{labelA}: <b>{d.aValue ?? '—'}</b> <span style={{ color: '#9c9c9c' }}>({d.aLabel})</span></div>
      )}
      {d.bLabel != null && (
        <div style={{ color: COLOR_B }}>{labelB}: <b>{d.bValue ?? '—'}</b> <span style={{ color: '#9c9c9c' }}>({d.bLabel})</span></div>
      )}
    </div>
  )
}

// Overlays two time series on a shared x-axis aligned by relative position
// (week 1, week 2, ...) rather than calendar date, so two different-length
// periods (e.g. 2025 H1 vs 2026 H1) can be compared directly.
export default function PeriodOverlayChart({ seriesA = [], seriesB = [], labelA, labelB, unitLabel = 'Period', height = 260 }) {
  const len = Math.max(seriesA.length, seriesB.length)
  if (!len) return <Empty />

  const data = Array.from({ length: len }, (_, i) => ({
    idx: i,
    aValue: seriesA[i]?.value ?? null,
    aLabel: seriesA[i]?.label ?? null,
    bValue: seriesB[i]?.value ?? null,
    bLabel: seriesB[i]?.label ?? null,
  }))

  const tickEvery = Math.max(1, Math.ceil(len / 10))

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 14, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0ece4" />
        <XAxis
          dataKey="idx"
          tickFormatter={(i) => (i % tickEvery === 0 ? `${unitLabel[0]}${i + 1}` : '')}
          tick={{ fontSize: 11, fill: '#9c9c9c', fontFamily: 'Inter' }}
          interval={0}
        />
        <YAxis tick={{ fontSize: 11, fill: '#9c9c9c', fontFamily: 'Inter' }} allowDecimals={false} />
        <Tooltip content={<CustomTooltip unitLabel={unitLabel} labelA={labelA} labelB={labelB} />} />
        <Legend verticalAlign="top" wrapperStyle={{ fontSize: 11, paddingBottom: 8, fontFamily: 'Inter' }} />
        <Line type="monotone" dataKey="aValue" name={labelA} stroke={COLOR_A} strokeWidth={2.5} dot={false} connectNulls />
        <Line type="monotone" dataKey="bValue" name={labelB} stroke={COLOR_B} strokeWidth={2.5} dot={false} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  )
}

function Empty() {
  return <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9c9c9c', fontSize: 13 }}>No data</div>
}
