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

const SERVICES = {
  'Website Content Management': '#3b82f6',
  'Demand Engagement Activations': '#8b5cf6',
  'Content Production - Graphic Design': '#ec4899',
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

  // Filter by year if selected
  const filteredData = selectedYear
    ? combined.filter(p => p.period.startsWith(selectedYear))
    : combined

  // Calculate summary stats
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

  // Calculate service percentages
  const servicePercentages = {}
  if (data.by_service) {
    const totalInflow = Object.values(data.by_service).reduce((sum, m) =>
      sum + Math.round(m.projected_inflow.reduce((s, v) => s + v, 0) / Math.max(m.projected_inflow.length, 1)), 0)

    Object.entries(data.by_service).forEach(([service, metrics]) => {
      const serviceInflow = Math.round(metrics.projected_inflow.reduce((s, v) => s + v, 0) / Math.max(metrics.projected_inflow.length, 1))
      servicePercentages[service] = totalInflow > 0 ? Math.round((serviceInflow / totalInflow) * 100) : 0
    })
  }

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

        {/* Year buttons */}
        <div style={{ display: 'flex', gap: 8, marginLeft: 16 }}>
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

      {/* Enhanced Data Table with Service Columns */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e5e7eb', background: '#f9fafb' }}>
              <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#374151', minWidth: 120 }}>Period</th>
              <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: '#374151' }}>Inflow Total</th>
              <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: '#3b82f6' }}>Website CM</th>
              <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: '#8b5cf6' }}>Demand Engage</th>
              <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: '#ec4899' }}>Content Prod</th>
              <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: '#374151' }}>Outflow Total</th>
              <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: '#3b82f6' }}>Website CM</th>
              <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: '#8b5cf6' }}>Demand Engage</th>
              <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: '#ec4899' }}>Content Prod</th>
              <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: '#374151' }}>Net</th>
              <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, color: '#374151', minWidth: 80 }}>Type</th>
            </tr>
          </thead>
          <tbody>
            {filteredData.length === 0 ? (
              <tr>
                <td colSpan={11} style={{ padding: '12px', textAlign: 'center', color: '#9ca3af' }}>No data for {selectedYear}</td>
              </tr>
            ) : (
              <>
                {filteredData.map((period, idx) => {
                  const services = period.services || {}
                  const websiteCmInflow = services['Website Content Management']?.inflow || 0
                  const demandEngInflow = services['Demand Engagement Activations']?.inflow || 0
                  const contentProdInflow = services['Content Production – Graphic Design']?.inflow || 0
                  const websiteCmOutflow = services['Website Content Management']?.outflow || 0
                  const demandEngOutflow = services['Demand Engagement Activations']?.outflow || 0
                  const contentProdOutflow = services['Content Production – Graphic Design']?.outflow || 0

                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid #e5e7eb', background: period.is_projected ? '#fef3c7' : '#fff' }}>
                      <td style={{ padding: '8px 12px', color: '#374151', fontWeight: period.is_projected ? 600 : 400 }}>{period.label}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: '#0284c7', fontWeight: 600 }}>{period.inflow}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: '#3b82f6', fontWeight: 500 }}>{websiteCmInflow || '—'}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: '#8b5cf6', fontWeight: 500 }}>{demandEngInflow || '—'}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: '#ec4899', fontWeight: 500 }}>{contentProdInflow || '—'}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: '#be123c', fontWeight: 600 }}>{period.outflow}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: '#3b82f6', fontWeight: 500 }}>{websiteCmOutflow || '—'}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: '#8b5cf6', fontWeight: 500 }}>{demandEngOutflow || '—'}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: '#ec4899', fontWeight: 500 }}>{contentProdOutflow || '—'}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: period.net > 0 ? '#991b1b' : '#15803d' }}>{period.net}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center', color: '#9ca3af', fontSize: 10 }}>
                        {period.is_projected ? '📊' : 'Historical'}
                      </td>
                    </tr>
                  )
                })}

                {/* Totals Row */}
                {filteredData.length > 0 && (
                  <tr style={{ borderTop: '2px solid #e5e7eb', borderBottom: '2px solid #e5e7eb', background: '#f0f4f8', fontWeight: 700 }}>
                    <td style={{ padding: '10px 12px', color: '#111827' }}>TOTAL</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#0284c7', fontWeight: 700 }}>
                      {filteredData.reduce((sum, p) => sum + (p.inflow || 0), 0)}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#3b82f6', fontWeight: 700 }}>
                      {filteredData.reduce((sum, p) => sum + (p.services?.['Website Content Management']?.inflow || 0), 0) || '—'}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#8b5cf6', fontWeight: 700 }}>
                      {filteredData.reduce((sum, p) => sum + (p.services?.['Demand Engagement Activations']?.inflow || 0), 0) || '—'}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#ec4899', fontWeight: 700 }}>
                      {filteredData.reduce((sum, p) => sum + (p.services?.['Content Production – Graphic Design']?.inflow || 0), 0) || '—'}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#be123c', fontWeight: 700 }}>
                      {filteredData.reduce((sum, p) => sum + (p.outflow || 0), 0)}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#3b82f6', fontWeight: 700 }}>
                      {filteredData.reduce((sum, p) => sum + (p.services?.['Website Content Management']?.outflow || 0), 0) || '—'}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#8b5cf6', fontWeight: 700 }}>
                      {filteredData.reduce((sum, p) => sum + (p.services?.['Demand Engagement Activations']?.outflow || 0), 0) || '—'}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#ec4899', fontWeight: 700 }}>
                      {filteredData.reduce((sum, p) => sum + (p.services?.['Content Production – Graphic Design']?.outflow || 0), 0) || '—'}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#111827' }}>
                      {filteredData.reduce((sum, p) => sum + (p.net || 0), 0)}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600 }}>Total</td>
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* Service Distribution Cards */}
      {Object.keys(servicePercentages).length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginTop: 12 }}>
          {Object.entries(servicePercentages).map(([service, percentage]) => (
            <div key={service} style={{ background: '#fff', border: `2px solid ${SERVICES[service]}`, borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: SERVICES[service], textTransform: 'uppercase' }}>{service}</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: SERVICES[service], marginTop: 4 }}>{percentage}%</div>
              <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>of projected tickets</div>
            </div>
          ))}
        </div>
      )}

      {/* Enhanced Trend Chart */}
      <EnhancedTrendChart data={combined} groupBy={groupBy} />
    </div>
  )
}

// Enhanced trend chart with better visualization
function EnhancedTrendChart({ data, groupBy }) {
  if (!data || data.length === 0) return null

  const inflowValues = data.map(p => p.inflow || 0)
  const outflowValues = data.map(p => p.outflow || 0)
  const allValues = [...inflowValues, ...outflowValues]

  const maxValue = Math.max(...allValues)
  if (maxValue === 0) return null

  const width = 900
  const height = 320
  const padding = { top: 30, right: 40, bottom: 50, left: 60 }
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom

  const scaledMax = maxValue * 1.15
  const yScale = (value) => chartHeight - ((value - 0) / (scaledMax - 0)) * chartHeight
  const xScale = (index) => (index / Math.max(data.length - 1, 1)) * chartWidth

  // Generate smooth paths using quadratic curves
  const generatePath = (values) => {
    if (values.length === 0) return ''
    let path = `M ${xScale(0)},${yScale(values[0])}`
    for (let i = 1; i < values.length; i++) {
      const xMid = (xScale(i - 1) + xScale(i)) / 2
      const y1 = yScale(values[i - 1])
      const y2 = yScale(values[i])
      path += ` Q ${xMid},${y1} ${xScale(i)},${y2}`
    }
    return path
  }

  const inflowPath = generatePath(inflowValues)
  const outflowPath = generatePath(outflowValues)

  // Gradient definitions
  const inflowGradient = `<defs>
    <linearGradient id="inflowGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#3b82f6;stop-opacity:0.3" />
      <stop offset="100%" style="stop-color:#3b82f6;stop-opacity:0" />
    </linearGradient>
    <linearGradient id="outflowGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#ef4444;stop-opacity:0.3" />
      <stop offset="100%" style="stop-color:#ef4444;stop-opacity:0" />
    </linearGradient>
  </defs>`

  const historicalCount = data.filter(p => !p.is_projected).length
  const splitX = xScale(Math.max(0, historicalCount - 1))

  return (
    <div style={{ marginTop: 20, padding: 16, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, overflowX: 'auto' }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 12 }}>Projected Growth Trend</div>
      <svg width={width} height={height} style={{ minWidth: width }}>
        <defs>
          <linearGradient id="inflowGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.2} />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="outflowGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ef4444" stopOpacity={0.2} />
            <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
          </linearGradient>
        </defs>

        <g transform={`translate(${padding.left},${padding.top})`}>
          {/* Grid */}
          {Array.from({ length: 5 }, (_, i) => {
            const y = (i / 4) * chartHeight
            return (
              <line key={`grid-${i}`} x1={0} y1={y} x2={chartWidth} y2={y} stroke="#e5e7eb" strokeWidth={1} />
            )
          })}

          {/* Axes */}
          <line x1={0} y1={chartHeight} x2={chartWidth} y2={chartHeight} stroke="#1f2937" strokeWidth={2} />
          <line x1={0} y1={0} x2={0} y2={chartHeight} stroke="#1f2937" strokeWidth={2} />

          {/* Historical/Projected divider */}
          <line x1={splitX} y1={-10} x2={splitX} y2={chartHeight} stroke="#d1d5db" strokeWidth={2} strokeDasharray="5,5" opacity={0.5} />

          {/* Filled areas under curves */}
          <path d={`${inflowPath} L ${xScale(data.length - 1)},${chartHeight} L 0,${chartHeight} Z`} fill="url(#inflowGrad)" />
          <path d={`${outflowPath} L ${xScale(data.length - 1)},${chartHeight} L 0,${chartHeight} Z`} fill="url(#outflowGrad)" />

          {/* Inflow line */}
          <path d={inflowPath} fill="none" stroke="#3b82f6" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />

          {/* Outflow line */}
          <path d={outflowPath} fill="none" stroke="#ef4444" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />

          {/* Y-axis labels */}
          {Array.from({ length: 5 }, (_, i) => {
            const value = Math.round((scaledMax * (4 - i)) / 4)
            const y = (i / 4) * chartHeight
            return (
              <text key={`y-label-${i}`} x={-15} y={y + 5} textAnchor="end" fontSize={11} fill="#6b7280" fontWeight={500}>
                {value}
              </text>
            )
          })}

          {/* X-axis labels */}
          {data.map((period, i) => {
            if (i % Math.ceil(data.length / 8) === 0 || i === data.length - 1) {
              return (
                <text
                  key={`x-label-${i}`}
                  x={xScale(i)}
                  y={chartHeight + 25}
                  textAnchor="middle"
                  fontSize={10}
                  fill="#6b7280"
                  fontWeight={400}
                >
                  {period.label}
                </text>
              )
            }
            return null
          })}

          {/* Region labels */}
          {historicalCount > 0 && (
            <text x={splitX / 2} y={-10} textAnchor="middle" fontSize={11} fontWeight={600} fill="#6b7280">
              Historical
            </text>
          )}
          {data.length > historicalCount && (
            <text x={splitX + (chartWidth - splitX) / 2} y={-10} textAnchor="middle" fontSize={11} fontWeight={600} fill="#92400e">
              Projected
            </text>
          )}
        </g>

        {/* Legend */}
        <g transform={`translate(${padding.left + 15},15)`}>
          <rect x={0} y={0} width={200} height={60} fill="#fff" stroke="#e5e7eb" strokeWidth={1} rx={6} />
          <line x1={10} y1={15} x2={30} y2={15} stroke="#3b82f6" strokeWidth={3} />
          <text x={40} y={20} fontSize={12} fill="#374151" fontWeight={500}>Projected Inflow</text>
          <line x1={10} y1={40} x2={30} y2={40} stroke="#ef4444" strokeWidth={3} />
          <text x={40} y={45} fontSize={12} fill="#374151" fontWeight={500}>Projected Outflow</text>
        </g>
      </svg>
    </div>
  )
}
