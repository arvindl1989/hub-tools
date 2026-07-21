import { useState, useRef, useEffect } from 'react'

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

// Explicit year-labeled Half/Quarter options — always unambiguous, unlike the
// relative ones above. Covers the current year and the two before it, so the
// set quietly rolls forward (e.g. 2025/2026/2027) without needing a code change.
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

const thisYear = new Date().getFullYear()
const YEARS = [thisYear - 2, thisYear - 1, thisYear]

// { [year]: { fullYear: {...}, halves: [...], quarters: [...] } }
const YEAR_PERIODS = Object.fromEntries(YEARS.map((y) => [
  y,
  {
    fullYear: { label: `${y} Full Year`, from: `${y}-01-01`, to: `${y}-12-31` },
    halves: [1, 2].map((h) => {
      const b = yearHalfBounds(y, h)
      return { label: h === 1 ? 'First Half' : 'Second Half', from: b.start, to: b.end }
    }),
    quarters: [1, 2, 3, 4].map((q) => {
      const b = yearQuarterBounds(y, q)
      return { label: `Q${q}`, from: b.start, to: b.end }
    }),
  },
]))

const ALL_YEAR_PERIODS = YEARS.flatMap((y) => [
  YEAR_PERIODS[y].fullYear,
  ...YEAR_PERIODS[y].halves.map((p) => ({ ...p, label: `${y} ${p.label}` })),
  ...YEAR_PERIODS[y].quarters.map((p) => ({ ...p, label: `${y} ${p.label}` })),
])

const BASE_BTN = {
  padding: '5px 10px', fontSize: 12, fontWeight: 500,
  border: '1px solid #e8e2d6', borderRadius: 7, cursor: 'pointer', whiteSpace: 'nowrap',
  fontFamily: 'Inter, sans-serif', transition: 'background 0.12s, color 0.12s, border-color 0.12s',
}

function PresetButton({ label, isActive, onClick, small = false }) {
  return (
    <button
      onClick={onClick}
      style={{
        ...BASE_BTN,
        ...(small ? { padding: '4px 9px', fontSize: 11.5 } : {}),
        background:  isActive ? '#1450f5' : '#fff',
        color:       isActive ? '#fff'    : '#6e6e6e',
        borderColor: isActive ? '#1450f5' : '#e8e2d6',
      }}
      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#f5f8fe' }}
      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = '#fff' }}
    >
      {label}
    </button>
  )
}

// Friendly label for any {from,to} pair — matches a named preset when
// possible (e.g. "2025 First Half"), otherwise formats the raw dates.
// Exported for reuse anywhere a period needs a human-readable name
// (e.g. period-comparison labels).
export function labelForRange(from, to) {
  if (!from && !to) return 'All time'
  const named = [...PRESETS, ...ALL_YEAR_PERIODS].find((p) => p.from === from && p.to === to)
  if (named) return named.label
  const fmt = (s) => {
    if (!s) return '…'
    const d = new Date(`${s}T00:00:00`)
    return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
  }
  return `${fmt(from)} – ${fmt(to)}`
}

export function PeriodPickerButton({ dateFrom, dateTo, onChange, placeholder = 'By Period' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const activeYearPeriod = ALL_YEAR_PERIODS.find((p) => p.from === dateFrom && p.to === dateTo)

  useEffect(() => {
    if (!open) return
    const onClickOutside = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  const pick = (p) => { onChange(p.from, p.to); setOpen(false) }

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          ...BASE_BTN,
          display: 'flex', alignItems: 'center', gap: 6,
          background:  activeYearPeriod ? '#1450f5' : '#fff',
          color:       activeYearPeriod ? '#fff'    : '#6e6e6e',
          borderColor: activeYearPeriod ? '#1450f5' : '#e8e2d6',
        }}
      >
        {activeYearPeriod ? activeYearPeriod.label : placeholder}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7, flexShrink: 0 }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 30,
          background: '#fff', border: '1px solid #e8e2d6', borderRadius: 10,
          boxShadow: '0 8px 20px rgba(20,20,20,0.12)',
          padding: 12, minWidth: 300, display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          {[...YEARS].reverse().map((y) => (
            <div key={y}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#141414' }}>{y}</span>
                <PresetButton label="Full Year"
                  isActive={YEAR_PERIODS[y].fullYear.from === dateFrom && YEAR_PERIODS[y].fullYear.to === dateTo}
                  onClick={() => pick(YEAR_PERIODS[y].fullYear)} small />
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 4 }}>
                {YEAR_PERIODS[y].halves.map((p) => (
                  <PresetButton key={p.label} label={p.label}
                    isActive={p.from === dateFrom && p.to === dateTo}
                    onClick={() => pick(p)} small />
                ))}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {YEAR_PERIODS[y].quarters.map((p) => (
                  <PresetButton key={p.label} label={p.label}
                    isActive={p.from === dateFrom && p.to === dateTo}
                    onClick={() => pick(p)} small />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function DateRangePicker({ dateFrom = '', dateTo = '', onChange }) {
  const active = PRESETS.find((p) => p.from === dateFrom && p.to === dateTo)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>

      {/* Preset pills — wraps to multiple rows, no clipping */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {PRESETS.map((p) => (
          <PresetButton key={p.label} label={p.label} isActive={active?.label === p.label} onClick={() => onChange(p.from, p.to)} />
        ))}
      </div>

      <PeriodPickerButton dateFrom={dateFrom} dateTo={dateTo} onChange={onChange} />

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
