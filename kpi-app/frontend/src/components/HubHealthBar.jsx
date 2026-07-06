const stateColor = (state = '') => {
  const s = state.toLowerCase()
  if (s.includes('completed') || s.includes('resolved')) return '#1e8a5e'
  if (s.includes('rejected'))  return '#c0305a'
  if (s.includes('confirmation')) return '#aae1c8'
  if (s.includes('in progress') || s.includes('progress')) return '#1450f5'
  if (s.includes('assigned'))  return '#0077a8'
  if (s.includes('hold') || s.includes('pending')) return '#b87d00'
  if (s.includes('review'))    return '#0077a8'
  if (s.includes('open'))      return '#6e6e6e'
  return '#9c9c9c'
}

export default function HubHealthBar({ data }) {
  if (!data || !data.total) return null
  const { by_state = [], total, done_pct } = data

  return (
    <div className="space-y-4">
      {/* Bar */}
      <div style={{ display: 'flex', height: 40, borderRadius: 10, overflow: 'hidden', gap: 2, backgroundColor: '#f0ece4', position: 'relative' }}>
        {by_state.map((s) => {
          const pct = (s.count / total) * 100
          if (pct < 0.3) return null
          return (
            <div
              key={s.state}
              style={{
                width: `${pct}%`,
                backgroundColor: stateColor(s.state),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                fontSize: 11,
                fontWeight: 700,
                transition: 'width 0.4s ease',
                fontFamily: 'Inter',
              }}
              title={`${s.state}: ${s.count} (${pct.toFixed(1)}%)`}
            >
              {pct > 6 ? s.count : ''}
            </div>
          )
        })}
        <div style={{ marginLeft: 'auto', padding: '0 12px', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: '#141414', whiteSpace: 'nowrap', fontFamily: 'Inter' }}>
            {done_pct}% Done
          </span>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 20px' }}>
        {by_state.map((s) => {
          const pct = ((s.count / total) * 100).toFixed(1)
          return (
            <div key={s.state} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <div style={{ width: 10, height: 10, borderRadius: 3, flexShrink: 0, backgroundColor: stateColor(s.state) }} />
              <span style={{ color: '#6e6e6e' }}>{s.state}</span>
              <span style={{ fontWeight: 700, color: '#141414' }}>{s.count}</span>
              <span style={{ color: '#9c9c9c', fontSize: 11 }}>({pct}%)</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
