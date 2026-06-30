import React, { useState } from 'react'

const FORECAST_OPTIONS = {
  week: [
    { label: '12 weeks (3 months)', value: 12 },
    { label: '26 weeks (6 months)', value: 26 },
    { label: '52 weeks (1 year)', value: 52 },
  ],
  month: [
    { label: '3 months', value: 3 },
    { label: '6 months', value: 6 },
    { label: '12 months (1 year)', value: 12 },
  ],
}

export default function InflowOutflowProjections({ data, groupBy = 'week', onForecastChange }) {
  const [selectedForecast, setSelectedForecast] = useState(
    groupBy === 'week' ? 12 : 6
  )
  const [selectedYear, setSelectedYear] = useState(null)

  if (!data?.projections?.length) {
    return (
      <div style={{ padding: 20, textAlign: 'center', color: '#9ca3af' }}>
        Insufficient historical data for projections
      </div>
    )
  }

  const options = FORECAST_OPTIONS[groupBy]
  const handleForecastChange = (val) => {
    setSelectedForecast(val)
    onForecastChange?.(val)
  }

  // Combine historical and projected data
  const historical = data.historical || []
  const projections = (data.projections || []).slice(0, selectedForecast)
  const combined = [...historical, ...projections]

  // Calculate summary stats
  const lastHistorical = historical[historical.length - 1]
  const avgHistoricalInflow = historical.length > 0
    ? Math.round(historical.reduce((s, p) => s + (p.inflow || 0), 0) / historical.length)
    : 0
  const avgHistoricalOutflow = historical.length > 0
    ? Math.round(historical.reduce((s, p) => s + (p.outflow || 0), 0) / historical.length)
    : 0
  const projectedAvgInflow = Math.round(projections.reduce((s, p) => s + (p.inflow || 0), 0) / Math.max(projections.length, 1))
  const projectedAvgOutflow = Math.round(projections.reduce((s, p) => s + (p.outflow || 0), 0) / Math.max(projections.length, 1))

  const growthInflow = avgHistoricalInflow > 0
    ? (((projectedAvgInflow - avgHistoricalInflow) / avgHistoricalInflow) * 100).toFixed(1)
    : 0
  const growthOutflow = avgHistoricalOutflow > 0
    ? (((projectedAvgOutflow - avgHistoricalOutflow) / avgHistoricalOutflow) * 100).toFixed(1)
    : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Forecast:</span>
        <select
          value={selectedForecast}
          onChange={(e) => handleForecastChange(parseInt(e.target.value))}
          style={{
            height: 30, padding: '0 8px', fontSize: 12, color: '#374151',
            border: '1px solid #e5e7eb', borderRadius: 7, outline: 'none',
            background: '#fff', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
          }}
        >
          {options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <div style={{ background: '#f0f9ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#0284c7', textTransform: 'uppercase' }}>Avg Inflow (Historical)</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#0c4a6e', marginTop: 4 }}>{avgHistoricalInflow}</div>
          <div style={{ fontSize: 11, color: '#075985', marginTop: 2 }}>Last {historical.length} {groupBy}s</div>
        </div>

        <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#92400e', textTransform: 'uppercase' }}>Projected Inflow</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#78350f', marginTop: 4 }}>{projectedAvgInflow}</div>
          <div style={{ fontSize: 11, color: growthInflow > 0 ? '#15803d' : '#991b1b', marginTop: 2 }}>
            {growthInflow > 0 ? '+' : ''}{growthInflow}% growth
          </div>
        </div>

        <div style={{ background: '#fecdd3', border: '1px solid #fca5a5', borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#be123c', textTransform: 'uppercase' }}>Avg Outflow (Historical)</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#831843', marginTop: 4 }}>{avgHistoricalOutflow}</div>
          <div style={{ fontSize: 11, color: '#ad1457', marginTop: 2 }}>Last {historical.length} {groupBy}s</div>
        </div>

        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#15803d', textTransform: 'uppercase' }}>Projected Outflow</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#145a32', marginTop: 4 }}>{projectedAvgOutflow}</div>
          <div style={{ fontSize: 11, color: growthOutflow > 0 ? '#15803d' : '#991b1b', marginTop: 2 }}>
            {growthOutflow > 0 ? '+' : ''}{growthOutflow}% growth
          </div>
        </div>
      </div>

      {/* Data Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e5e7eb', background: '#f9fafb' }}>
              <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Period</th>
              <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: '#374151' }}>Inflow</th>
              <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: '#374151' }}>Outflow</th>
              <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: '#374151' }}>Net</th>
              <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, color: '#374151' }}>Type</th>
            </tr>
          </thead>
          <tbody>
            {combined.slice(-20).map((period, idx) => (
              <tr key={idx} style={{ borderBottom: '1px solid #e5e7eb', background: period.is_projected ? '#fef3c7' : '#fff' }}>
                <td style={{ padding: '8px 12px', color: '#374151', fontWeight: period.is_projected ? 600 : 400 }}>{period.label}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right', color: '#0284c7', fontWeight: 600 }}>{period.inflow}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right', color: '#be123c', fontWeight: 600 }}>{period.outflow}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: period.net > 0 ? '#991b1b' : '#15803d' }}>
                  {period.net}
                </td>
                <td style={{ padding: '8px 12px', textAlign: 'center', color: '#9ca3af', fontSize: 11 }}>
                  {period.is_projected ? '📊 Projected' : 'Historical'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Service Breakdown Table and Graph */}
      {data.by_service && Object.keys(data.by_service).length > 0 && (
        <div style={{ marginTop: 16, padding: 16, background: '#f9fafb', borderRadius: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Projected Growth by Service</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {[2025, 2026, 2027].map((year) => (
                <button
                  key={year}
                  onClick={() => setSelectedYear(selectedYear === year ? null : year)}
                  style={{
                    padding: '6px 14px',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: '1px solid #e5e7eb',
                    borderRadius: 6,
                    background: selectedYear === year ? '#1450f5' : '#fff',
                    color: selectedYear === year ? '#fff' : '#374151',
                    transition: 'all 0.2s',
                    fontFamily: 'Inter, sans-serif',
                  }}
                >
                  {year}
                </button>
              ))}
            </div>
          </div>

          {/* Service Breakdown Table */}
          <div style={{ overflowX: 'auto', marginBottom: 20 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb', background: '#f0f4f8' }}>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#374151', minWidth: 200 }}>Service</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: '#374151', minWidth: 80 }}>Inflow</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: '#374151', minWidth: 80 }}>Outflow</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: '#374151', minWidth: 70 }}>Net</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(data.by_service).map(([service, metrics]) => {
                  const projInflow = Math.round(metrics.projected_inflow.reduce((s, v) => s + v, 0) / Math.max(metrics.projected_inflow.length, 1))
                  const projOutflow = Math.round(metrics.projected_outflow.reduce((s, v) => s + v, 0) / Math.max(metrics.projected_outflow.length, 1))
                  const net = projInflow - projOutflow
                  return (
                    <tr key={service} style={{ borderBottom: '1px solid #e5e7eb', background: '#fff', _hover: { background: '#f9fafb' } }}>
                      <td style={{ padding: '10px 12px', color: '#374151', fontWeight: 500 }}>{service}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: '#0284c7', fontWeight: 600 }}>{projInflow}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: '#be123c', fontWeight: 600 }}>{projOutflow}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: net > 0 ? '#991b1b' : '#15803d' }}>{net}</td>
                    </tr>
                  )
                })}
                {/* Totals row */}
                <tr style={{ borderTop: '2px solid #e5e7eb', background: '#f0f4f8', fontWeight: 600 }}>
                  <td style={{ padding: '10px 12px', color: '#374151', fontWeight: 600 }}>Total</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#0284c7', fontWeight: 700 }}>
                    {Object.values(data.by_service).reduce((sum, m) => sum + Math.round(m.projected_inflow.reduce((s, v) => s + v, 0) / Math.max(m.projected_inflow.length, 1)), 0)}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#be123c', fontWeight: 700 }}>
                    {Object.values(data.by_service).reduce((sum, m) => sum + Math.round(m.projected_outflow.reduce((s, v) => s + v, 0) / Math.max(m.projected_outflow.length, 1)), 0)}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#374151' }}>
                    {Object.values(data.by_service).reduce((sum, m) => {
                      const inflow = Math.round(m.projected_inflow.reduce((s, v) => s + v, 0) / Math.max(m.projected_inflow.length, 1))
                      const outflow = Math.round(m.projected_outflow.reduce((s, v) => s + v, 0) / Math.max(m.projected_outflow.length, 1))
                      return sum + (inflow - outflow)
                    }, 0)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Projected Growth Line Graph */}
          <ProjectionLineGraph data={data} projections={projections} groupBy={groupBy} />
        </div>
      )}
    </div>
  )
}

// Line graph component for projected growth visualization
function ProjectionLineGraph({ data, projections, groupBy }) {
  if (!projections || projections.length === 0) return null

  const width = 800
  const height = 300
  const padding = { top: 20, right: 30, bottom: 40, left: 50 }
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom

  // Get inflow and outflow values from projections
  const inflowValues = projections.map(p => p.inflow || 0)
  const outflowValues = projections.map(p => p.outflow || 0)

  if (inflowValues.length === 0 || outflowValues.length === 0) return null

  const maxValue = Math.max(...inflowValues, ...outflowValues)
  if (maxValue === 0) return null

  const scaledMax = maxValue * 1.1
  const minValue = 0

  // Calculate scale
  const yScale = (value) => chartHeight - ((value - minValue) / (scaledMax - minValue)) * chartHeight
  const xScale = (index) => (index / Math.max(projections.length - 1, 1)) * chartWidth

  // Generate path strings for lines
  const inflowPath = inflowValues
    .map((v, i) => `${xScale(i)},${yScale(v)}`)
    .join('L')
  const outflowPath = outflowValues
    .map((v, i) => `${xScale(i)},${yScale(v)}`)
    .join('L')

  // Generate grid lines
  const gridLines = []
  const gridCount = 5
  for (let i = 0; i <= gridCount; i++) {
    const y = (i / gridCount) * chartHeight
    gridLines.push(
      <line
        key={`grid-${i}`}
        x1={0}
        y1={y}
        x2={chartWidth}
        y2={y}
        stroke="#e5e7eb"
        strokeWidth={1}
        strokeDasharray="2,2"
      />
    )
  }

  return (
    <div style={{ marginTop: 20, padding: 12, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, overflowX: 'auto' }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 12 }}>Projected Growth Trend</div>
      <svg width={width} height={height} style={{ minWidth: width }}>
        <g transform={`translate(${padding.left},${padding.top})`}>
          {/* Grid lines */}
          {gridLines}

          {/* Axes */}
          <line x1={0} y1={chartHeight} x2={chartWidth} y2={chartHeight} stroke="#374151" strokeWidth={2} />
          <line x1={0} y1={0} x2={0} y2={chartHeight} stroke="#374151" strokeWidth={2} />

          {/* Y-axis labels */}
          {Array.from({ length: gridCount + 1 }, (_, i) => {
            const value = Math.round((scaledMax * (gridCount - i)) / gridCount)
            const y = (i / gridCount) * chartHeight
            return (
              <g key={`y-label-${i}`}>
                <text
                  x={-10}
                  y={y + 4}
                  textAnchor="end"
                  fontSize={10}
                  fill="#9ca3af"
                >
                  {value}
                </text>
              </g>
            )
          })}

          {/* X-axis labels */}
          {projections.map((period, i) => {
            if (i % Math.ceil(projections.length / 6) === 0 || i === projections.length - 1) {
              return (
                <g key={`x-label-${i}`}>
                  <text
                    x={xScale(i)}
                    y={chartHeight + 20}
                    textAnchor="middle"
                    fontSize={10}
                    fill="#9ca3af"
                  >
                    {period.label}
                  </text>
                </g>
              )
            }
            return null
          })}

          {/* Inflow line */}
          <polyline
            points={inflowPath}
            fill="none"
            stroke="#0284c7"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Outflow line */}
          <polyline
            points={outflowPath}
            fill="none"
            stroke="#be123c"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Data points for inflow */}
          {inflowValues.map((v, i) => (
            <circle
              key={`inflow-point-${i}`}
              cx={xScale(i)}
              cy={yScale(v)}
              r={3}
              fill="#0284c7"
              opacity={0.7}
            />
          ))}

          {/* Data points for outflow */}
          {outflowValues.map((v, i) => (
            <circle
              key={`outflow-point-${i}`}
              cx={xScale(i)}
              cy={yScale(v)}
              r={3}
              fill="#be123c"
              opacity={0.7}
            />
          ))}
        </g>

        {/* Legend */}
        <g transform={`translate(${padding.left + 10},10)`}>
          <rect x={0} y={0} width={180} height={50} fill="#fff" stroke="#e5e7eb" strokeWidth={1} rx={4} />
          <line x1={10} y1={15} x2={30} y2={15} stroke="#0284c7" strokeWidth={2} />
          <text x={40} y={19} fontSize={11} fill="#374151">Projected Inflow</text>
          <line x1={10} y1={35} x2={30} y2={35} stroke="#be123c" strokeWidth={2} />
          <text x={40} y={39} fontSize={11} fill="#374151">Projected Outflow</text>
        </g>
      </svg>
    </div>
  )
}
