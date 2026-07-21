// Small pill showing the % change from `previous` to `current`.
// Green = increase, rose = decrease, neutral gray = ~flat/no data —
// direction-agnostic (doesn't judge whether "up" is good for this metric).
export default function DeltaBadge({ current, previous, size = 'md' }) {
  if (previous == null || current == null) return null
  const small = size === 'sm'

  if (previous === 0) {
    if (current === 0) return null
    return (
      <span style={badgeStyle('#0f5132', '#d3efe0', small)}>
        <UpArrow /> new
      </span>
    )
  }

  const pct = ((current - previous) / Math.abs(previous)) * 100
  const rounded = Math.round(pct * 10) / 10
  if (Math.abs(rounded) < 0.1) {
    return <span style={badgeStyle('#6e6e6e', '#f1ede3', small)}>flat</span>
  }
  const isUp = rounded > 0
  return (
    <span style={badgeStyle(isUp ? '#0f5132' : '#8c1a2e', isUp ? '#d3efe0' : '#ffdee5', small)}>
      {isUp ? <UpArrow /> : <DownArrow />}
      {isUp ? '+' : ''}{rounded}%
    </span>
  )
}

const badgeStyle = (color, bg, small) => ({
  display: 'inline-flex', alignItems: 'center', gap: 3,
  fontSize: small ? 10 : 11, fontWeight: 700, color, background: bg,
  borderRadius: 5, padding: small ? '1px 5px' : '2px 7px', whiteSpace: 'nowrap',
})

const UpArrow = () => (
  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>
  </svg>
)
const DownArrow = () => (
  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>
  </svg>
)
