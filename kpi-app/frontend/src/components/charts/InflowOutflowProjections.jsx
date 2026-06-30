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

      {/* Service Breakdown */}
      {data.by_service && Object.keys(data.by_service).length > 0 && (
        <div style={{ marginTop: 12, padding: 12, background: '#f9fafb', borderRadius: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 12 }}>Projections by Service</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
            {Object.entries(data.by_service).map(([service, metrics]) => (
              <div key={service} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, padding: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#1f2937', marginBottom: 8 }}>{service}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 11 }}>
                  <div>
                    <div style={{ color: '#9ca3af' }}>Historical Avg Inflow</div>
                    <div style={{ fontWeight: 600, color: '#0284c7' }}>
                      {Math.round(metrics.historical_inflow.reduce((s, v) => s + v, 0) / Math.max(metrics.historical_inflow.length, 1))}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: '#9ca3af' }}>Projected Avg Inflow</div>
                    <div style={{ fontWeight: 600, color: '#92400e' }}>
                      {Math.round(metrics.projected_inflow.reduce((s, v) => s + v, 0) / Math.max(metrics.projected_inflow.length, 1))}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: '#9ca3af' }}>Historical Avg Outflow</div>
                    <div style={{ fontWeight: 600, color: '#be123c' }}>
                      {Math.round(metrics.historical_outflow.reduce((s, v) => s + v, 0) / Math.max(metrics.historical_outflow.length, 1))}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: '#9ca3af' }}>Projected Avg Outflow</div>
                    <div style={{ fontWeight: 600, color: '#15803d' }}>
                      {Math.round(metrics.projected_outflow.reduce((s, v) => s + v, 0) / Math.max(metrics.projected_outflow.length, 1))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
