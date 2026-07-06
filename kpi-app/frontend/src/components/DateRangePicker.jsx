const pad = (n) => String(n).padStart(2, '0')
const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const today    = () => localDate(new Date())
const daysAgo  = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return localDate(d) }
const yearStart = (offset = 0) => `${new Date().getFullYear() + offset}-01-01`
const yearEnd   = (offset = 0) => `${new Date().getFullYear() + offset}-12-31`

const PRESETS = [
  { label: 'All time',  from: '',            to: ''          },
  { label: 'Last 7d',   from: daysAgo(7),    to: today()     },
  { label: 'Last 30d',  from: daysAgo(30),   to: today()     },
  { label: 'Last 90d',  from: daysAgo(90),   to: today()     },
  { label: 'This year', from: yearStart(0),  to: today()     },
  { label: 'Last year', from: yearStart(-1), to: yearEnd(-1) },
]

const BASE_BTN = {
  padding: '5px 10px', fontSize: 12, fontWeight: 500,
  border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
  fontFamily: 'Inter, sans-serif', transition: 'background 0.12s, color 0.12s',
}

export default function DateRangePicker({ dateFrom = '', dateTo = '', onChange }) {
  const active = PRESETS.find((p) => p.from === dateFrom && p.to === dateTo)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>

      {/* Preset pills — horizontal button group */}
      <div style={{
        display: 'flex', borderRadius: 8, border: '1px solid #e8e2d6',
        overflow: 'hidden', background: '#fff', flexShrink: 0,
      }}>
        {PRESETS.map((p, i) => {
          const isActive = active?.label === p.label
          return (
            <button
              key={p.label}
              onClick={() => onChange(p.from, p.to)}
              style={{
                ...BASE_BTN,
                background: isActive ? '#1450f5' : '#fff',
                color:      isActive ? '#fff'    : '#6e6e6e',
                borderRight: i < PRESETS.length - 1 ? '1px solid #e8e2d6' : 'none',
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#f5f8fe' }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = '#fff' }}
            >
              {p.label}
            </button>
          )
        })}
      </div>

      {/* Custom date inputs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => onChange(e.target.value, dateTo)}
          style={{
            height: 30, padding: '0 8px', fontSize: 12, color: '#404040',
            border: '1px solid #e8e2d6', borderRadius: 7, outline: 'none',
            fontFamily: 'Inter, sans-serif', background: '#fff', cursor: 'pointer',
          }}
        />
        <span style={{ fontSize: 11, color: '#9c9c9c' }}>→</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => onChange(dateFrom, e.target.value)}
          style={{
            height: 30, padding: '0 8px', fontSize: 12, color: '#404040',
            border: '1px solid #e8e2d6', borderRadius: 7, outline: 'none',
            fontFamily: 'Inter, sans-serif', background: '#fff', cursor: 'pointer',
          }}
        />
        {(dateFrom || dateTo) && (
          <button
            onClick={() => onChange('', '')}
            style={{
              ...BASE_BTN, padding: '4px 8px', fontSize: 11,
              background: 'none', color: '#9c9c9c', border: '1px solid #e8e2d6', borderRadius: 6,
            }}
            title="Clear dates"
          >✕</button>
        )}
      </div>
    </div>
  )
}
