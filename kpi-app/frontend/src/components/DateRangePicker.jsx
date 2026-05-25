// Use local dates — toISOString() returns UTC and can be off by ±1 day in non-UTC timezones
const pad = (n) => String(n).padStart(2, '0')
const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const today = () => localDate(new Date())
const daysAgo = (n) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return localDate(d)
}
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

export default function DateRangePicker({ dateFrom = '', dateTo = '', onChange }) {
  const activePreset = PRESETS.find((p) => p.from === dateFrom && p.to === dateTo)

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Preset pills */}
      <div className="flex rounded-lg border border-gray-200 overflow-hidden divide-x divide-gray-200">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => onChange(p.from, p.to)}
            className={`px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
              activePreset?.label === p.label
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-gray-500 hover:bg-gray-50'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Custom inputs */}
      <div className="flex items-center gap-1.5 text-xs text-gray-500">
        <span className="hidden sm:inline">or</span>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => onChange(e.target.value, dateTo)}
          className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <span>→</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => onChange(dateFrom, e.target.value)}
          className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        {(dateFrom || dateTo) && (
          <button
            onClick={() => onChange('', '')}
            className="text-gray-400 hover:text-gray-600 text-xs px-1"
            title="Clear"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  )
}
