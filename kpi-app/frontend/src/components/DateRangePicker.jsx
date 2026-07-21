const pad = (n) => String(n).padStart(2, '0')
const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const today    = () => localDate(new Date())
const daysAgo  = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return localDate(d) }
const yearStart = (offset = 0) => `${new Date().getFullYear() + offset}-01-01`
const yearEnd   = (offset = 0) => `${new Date().getFullYear() + offset}-12-31`

// Quarter/half helpers — offset counts whole periods back from the current one
function quarterBounds(offset = 0) {
  const d = new Date()
  let q = Math.floor(d.getMonth() / 3) + offset
  let year = d.getFullYear()
  while (q < 0) { q += 4; year -= 1 }
  while (q > 3) { q -= 4; year += 1 }
  return {
    start: localDate(new Date(year, q * 3, 1)),
    end:   localDate(new Date(year, q * 3 + 3, 0)),
  }
}
function halfBounds(offset = 0) {
  const d = new Date()
  let h = Math.floor(d.getMonth() / 6) + offset
  let year = d.getFullYear()
  while (h < 0) { h += 2; year -= 1 }
  while (h > 1) { h -= 2; year += 1 }
  return {
    start: localDate(new Date(year, h * 6, 1)),
    end:   localDate(new Date(year, h * 6 + 6, 0)),
  }
}

const thisQuarter = quarterBounds(0)
const lastQuarter = quarterBounds(-1)
const thisHalf    = halfBounds(0)
const lastHalf     = halfBounds(-1)

const PRESETS = [
  { label: 'All time',     from: '',              to: ''               },
  { label: 'Last 7d',      from: daysAgo(7),      to: today()          },
  { label: 'Last 30d',     from: daysAgo(30),     to: today()          },
  { label: 'Last 90d',     from: daysAgo(90),     to: today()          },
  { label: 'This Half',    from: thisHalf.start,    to: today()        },
  { label: 'Last Half',    from: lastHalf.start,    to: lastHalf.end   },
  { label: 'This Quarter', from: thisQuarter.start, to: today()        },
  { label: 'Last Quarter', from: lastQuarter.start, to: lastQuarter.end },
  { label: 'This year',    from: yearStart(0),   to: today()          },
  { label: 'Last year',    from: yearStart(-1),  to: yearEnd(-1)      },
]

// Explicit year-labeled Half/Quarter buttons — always unambiguous, unlike the
// relative ones above. Covers the current year and the one before it, so the
// set quietly rolls forward (e.g. 2026/2027) without needing a code change.
function yearHalfBounds(year, half) {
  const startMonth = half === 1 ? 0 : 6
  return {
    start: localDate(new Date(year, startMonth, 1)),
    end:   localDate(new Date(year, startMonth + 6, 0)),
  }
}
function yearQuarterBounds(year, q) {
  const startMonth = (q - 1) * 3
  return {
    start: localDate(new Date(year, startMonth, 1)),
    end:   localDate(new Date(year, startMonth + 3, 0)),
  }
}

const YEARS = [new Date().getFullYear() - 1, new Date().getFullYear()]

const YEAR_HALF_PRESETS = YEARS.flatMap((y) => [1, 2].map((h) => {
  const b = yearHalfBounds(y, h)
  return { label: `${y} ${h === 1 ? 'First' : 'Second'} Half`, from: b.start, to: b.end }
}))

const YEAR_QUARTER_PRESETS = YEARS.flatMap((y) => [1, 2, 3, 4].map((q) => {
  const b = yearQuarterBounds(y, q)
  return { label: `${y} Q${q}`, from: b.start, to: b.end }
}))

const BASE_BTN = {
  padding: '5px 10px', fontSize: 12, fontWeight: 500,
  border: '1px solid #e8e2d6', borderRadius: 7, cursor: 'pointer', whiteSpace: 'nowrap',
  fontFamily: 'Inter, sans-serif', transition: 'background 0.12s, color 0.12s, border-color 0.12s',
}

function PresetRow({ presets, active, onChange }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {presets.map((p) => {
        const isActive = active?.label === p.label
        return (
          <button
            key={p.label}
            onClick={() => onChange(p.from, p.to)}
            style={{
              ...BASE_BTN,
              background:  isActive ? '#1450f5' : '#fff',
              color:       isActive ? '#fff'    : '#6e6e6e',
              borderColor: isActive ? '#1450f5' : '#e8e2d6',
            }}
            onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#f5f8fe' }}
            onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = '#fff' }}
          >
            {p.label}
          </button>
        )
      })}
    </div>
  )
}

export default function DateRangePicker({ dateFrom = '', dateTo = '', onChange }) {
  const ALL_PRESETS = [...PRESETS, ...YEAR_HALF_PRESETS, ...YEAR_QUARTER_PRESETS]
  const active = ALL_PRESETS.find((p) => p.from === dateFrom && p.to === dateTo)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <PresetRow presets={PRESETS} active={active} onChange={onChange} />

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

      {/* Explicit year-labeled Half/Quarter buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: '#9c9c9c', textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0 }}>
          By period:
        </span>
        <PresetRow presets={YEAR_HALF_PRESETS} active={active} onChange={onChange} />
        <PresetRow presets={YEAR_QUARTER_PRESETS} active={active} onChange={onChange} />
      </div>
    </div>
  )
}
