// ── Inflow / Outflow table ─────────────────────────────────────────────────────

function _rateStyle(rate) {
  if (rate === null || rate === undefined) return {}
  if (rate < 50)   return { background: '#ffdee5', color: '#8c1a2e' }
  if (rate < 80)   return { background: '#ffd4dd', color: '#c0305a' }
  if (rate < 100)  return { background: '#fff6c4', color: '#7a5400' }
  if (rate <= 150) return { background: '#d3efe0', color: '#147a50' }
  return { background: '#aae1c8', color: '#0f5132' }
}

// Values may be comma-separated (multi-select) — summarize as "N selected"
// once there's more than one, otherwise show the single value as-is.
function _fmtMulti(val, prefix = '') {
  const vals = val.split(',').map(v => v.trim()).filter(Boolean)
  if (vals.length <= 1) return `${prefix}${vals[0] ?? ''}`
  return `${prefix}${vals.length} selected`
}

function _filterName(filters) {
  if (!filters) return 'All'
  if (filters.assigned_to) return _fmtMulti(filters.assigned_to)
  if (filters.team)        return _fmtMulti(filters.team, 'Team: ')
  if (filters.area)        return _fmtMulti(filters.area, 'Area: ')
  if (filters.sub_category) return _fmtMulti(filters.sub_category)
  return 'All'
}

function _pipelineStyle(val, prev) {
  if (val == null) return {}
  if (prev != null && val < prev)  return { background: '#d3efe0', color: '#147a50' }  // shrinking — good
  if (prev != null && val > prev)  return { background: '#ffdee5', color: '#8c1a2e' }  // growing — bad
  return { background: '#fff6c4', color: '#7a5400' }                                  // no change / first period
}

export default function InflowOutflowTable({ data = [], filters = {} }) {
  if (!data.length) return null

  const name     = _filterName(filters)
  const totalIn  = data.reduce((s, r) => s + r.inflow,  0)
  const totalOut = data.reduce((s, r) => s + r.outflow, 0)
  const totalRate = (totalIn > 0 || totalOut > 0) ? Math.round(totalOut / Math.max(totalIn, 1) * 1000) / 10 : null

  // Pipeline snapshot comes from backend (created_date <= period_end AND no closed_date yet)
  const pipelines = data.map(r => r.open_pipeline ?? null)

  // Union of pipeline stages across all periods, sorted by latest-period count
  // (descending). "Resolved Later" always sinks to the bottom.
  const latestStages = data[data.length - 1]?.pipeline_stages ?? {}
  const stageNames = [...new Set(data.flatMap(r => Object.keys(r.pipeline_stages ?? {})))]
    .sort((a, b) => {
      if (a === 'Resolved Later') return 1
      if (b === 'Resolved Later') return -1
      return (latestStages[b] ?? 0) - (latestStages[a] ?? 0)
    })

  const NAME_W   = 150
  const METRIC_W = 140

  const stickyBase = (left, bg) => ({
    position: 'sticky', left, zIndex: 1,
    background: bg, whiteSpace: 'nowrap',
  })

  const hdrCell = (extra = {}) => ({
    padding: '8px 12px', fontSize: 11, fontWeight: 700,
    background: '#1450f5', color: '#fff',
    borderRight: '1px solid #3b70f7',
    textAlign: 'center', whiteSpace: 'nowrap',
    ...extra,
  })

  const numCell = (bg = '#fff') => ({
    padding: '7px 12px', textAlign: 'center',
    fontSize: 12, color: '#404040',
    borderRight: '1px solid #f3eee6',
    background: bg,
  })

  return (
    <div style={{ marginTop: 16, overflowX: 'auto', borderRadius: 8, border: '1px solid #e8e2d6' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: '100%' }}>
        <thead>
          <tr>
            <th style={{ ...hdrCell({ textAlign: 'left', minWidth: NAME_W }), ...stickyBase(0, '#1450f5') }}>
              Name
            </th>
            <th style={{ ...hdrCell({ textAlign: 'left', minWidth: METRIC_W }), ...stickyBase(NAME_W, '#1450f5') }}>
              Metric
            </th>
            <th style={hdrCell({ minWidth: 72 })}>Total</th>
            {data.map(r => (
              <th key={r.period} style={hdrCell({ minWidth: 110 })}>{r.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>

          {/* ── Assigned ── */}
          <tr>
            <td style={{ ...numCell(), ...stickyBase(0, '#fff'), padding: '8px 12px', fontWeight: 700, color: '#141414', borderRight: '1px solid #e8e2d6' }}>
              {name}
            </td>
            <td style={{ ...numCell(), ...stickyBase(NAME_W, '#fff'), padding: '8px 12px', fontWeight: 600, color: '#404040', borderRight: '2px solid #e8e2d6' }}>
              Assigned
            </td>
            <td style={{ ...numCell('#eef3fe'), fontWeight: 700, color: '#1450f5' }}>
              {totalIn.toLocaleString()}
            </td>
            {data.map(r => (
              <td key={r.period} style={numCell()}>{r.inflow || '—'}</td>
            ))}
          </tr>

          {/* ── Resolved ── */}
          <tr>
            <td style={{ ...numCell('#faf8f3'), ...stickyBase(0, '#faf8f3'), padding: '8px 12px', borderRight: '1px solid #e8e2d6' }} />
            <td style={{ ...numCell('#faf8f3'), ...stickyBase(NAME_W, '#faf8f3'), padding: '8px 12px', fontWeight: 600, color: '#404040', borderRight: '2px solid #e8e2d6' }}>
              Resolved
            </td>
            <td style={{ ...numCell('#eef3fe'), fontWeight: 700, color: '#1450f5' }}>
              {totalOut.toLocaleString()}
            </td>
            {data.map(r => (
              <td key={r.period} style={numCell('#faf8f3')}>{r.outflow || '—'}</td>
            ))}
          </tr>

          {/* ── Resolution Rate ── */}
          <tr>
            <td style={{ ...numCell(), ...stickyBase(0, '#fff'), padding: '8px 12px', borderRight: '1px solid #e8e2d6' }} />
            <td style={{ ...numCell(), ...stickyBase(NAME_W, '#fff'), padding: '8px 12px', fontWeight: 600, color: '#404040', borderRight: '2px solid #e8e2d6' }}>
              Resolution Rate
            </td>
            <td style={{ ...numCell(), ..._rateStyle(totalRate), fontWeight: 700, textAlign: 'center' }}>
              {totalRate != null ? `${totalRate}%` : '—'}
            </td>
            {data.map(r => {
              const rate = (r.inflow > 0 || r.outflow > 0) ? Math.round(r.outflow / Math.max(r.inflow, 1) * 1000) / 10 : null
              return (
                <td key={r.period} style={{ ...numCell(), ..._rateStyle(rate), fontWeight: rate != null ? 600 : 400 }}>
                  {rate != null ? `${rate}%` : '—'}
                </td>
              )
            })}
          </tr>

          {/* ── Open Pipeline ── */}
          <tr style={{ borderTop: '2px solid #e8e2d6' }}>
            <td style={{ ...numCell('#fffae3'), ...stickyBase(0, '#fffae3'), padding: '8px 12px', borderRight: '1px solid #e8e2d6' }} />
            <td style={{ ...numCell('#fffae3'), ...stickyBase(NAME_W, '#fffae3'), padding: '8px 12px', fontWeight: 700, color: '#8a5f00', borderRight: '2px solid #e8e2d6' }}>
              Open Pipeline
            </td>
            <td style={{ ...numCell('#fffae3'), fontSize: 11, color: '#9c9c9c', fontStyle: 'italic' }}>
              latest →
            </td>
            {pipelines.map((pl, i) => {
              const prev = i > 0 ? pipelines[i - 1] : null
              return (
                <td key={data[i].period} style={{ ...numCell(), ..._pipelineStyle(pl, prev), fontWeight: 700 }}>
                  {pl ?? '—'}
                </td>
              )
            })}
          </tr>

          {/* ── Pipeline stages (breakdown of the open pipeline snapshot) ── */}
          {stageNames.map(stage => {
            const muted = stage === 'Resolved Later'
            return (
              <tr key={stage}>
                <td style={{ ...numCell('#fffdf5'), ...stickyBase(0, '#fffdf5'), padding: '6px 12px', borderRight: '1px solid #e8e2d6' }} />
                <td style={{ ...numCell('#fffdf5'), ...stickyBase(NAME_W, '#fffdf5'), padding: '6px 12px 6px 24px', fontSize: 11, fontWeight: 500, color: muted ? '#9c9c9c' : '#7a5400', fontStyle: muted ? 'italic' : 'normal', borderRight: '2px solid #e8e2d6' }}>
                  {stage}
                </td>
                <td style={{ ...numCell('#fffae3'), fontSize: 11, fontWeight: 700, color: muted ? '#9c9c9c' : '#8a5f00' }}>
                  {latestStages[stage] ?? '—'}
                </td>
                {data.map(r => {
                  const v = r.pipeline_stages?.[stage] ?? 0
                  return (
                    <td key={r.period} style={{ ...numCell('#fffdf5'), fontSize: 11, color: muted ? '#9c9c9c' : '#5c4200', fontWeight: v ? 600 : 400 }}>
                      {v || '—'}
                    </td>
                  )
                })}
              </tr>
            )
          })}

          {/* ── Closed Break Up (by closed date) ── */}
          <tr style={{ borderTop: '2px solid #e8e2d6' }}>
            <td style={{ ...numCell('#edf8f2'), ...stickyBase(0, '#edf8f2'), padding: '8px 12px', borderRight: '1px solid #e8e2d6' }} />
            <td style={{ ...numCell('#edf8f2'), ...stickyBase(NAME_W, '#edf8f2'), padding: '8px 12px', fontWeight: 700, color: '#147a50', borderRight: '2px solid #e8e2d6' }}>
              Closed Break Up
            </td>
            <td style={{ ...numCell('#edf8f2') }} />
            {data.map(r => (
              <td key={r.period} style={numCell('#edf8f2')} />
            ))}
          </tr>
          {[
            { key: 'closed_completed', label: 'Closed Completed', color: '#147a50' },
            { key: 'closed_rejected',  label: 'Closed Rejected',  color: '#8c1a2e' },
          ].map(({ key, label, color }) => (
            <tr key={key}>
              <td style={{ ...numCell('#fbfefc'), ...stickyBase(0, '#fbfefc'), padding: '6px 12px', borderRight: '1px solid #e8e2d6' }} />
              <td style={{ ...numCell('#fbfefc'), ...stickyBase(NAME_W, '#fbfefc'), padding: '6px 12px 6px 24px', fontSize: 11, fontWeight: 500, color, borderRight: '2px solid #e8e2d6' }}>
                {label}
              </td>
              <td style={{ ...numCell('#edf8f2'), fontSize: 11, fontWeight: 700, color }}>
                {data.reduce((s, r) => s + (r[key] || 0), 0).toLocaleString()}
              </td>
              {data.map(r => {
                const v = r[key] ?? 0
                return (
                  <td key={r.period} style={{ ...numCell('#fbfefc'), fontSize: 11, color, fontWeight: v ? 600 : 400 }}>
                    {v || '—'}
                  </td>
                )
              })}
            </tr>
          ))}

        </tbody>
      </table>
    </div>
  )
}
