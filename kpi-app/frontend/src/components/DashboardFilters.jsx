import DateRangePicker from './DateRangePicker'

const EXCLUDED = new Set(['Dheera Sameera', 'Pooja V', 'Suresh Karthik'])

export default function DashboardFilters({ overview, filters, range, onFilter, onRange }) {
  const assignees = (overview?.assigned_to_list ?? []).filter((a) => !EXCLUDED.has(a))
  const teams     = overview?.team_list         ?? []
  const areas     = overview?.area_list         ?? []
  const subCats   = overview?.sub_category_list ?? []

  const set = (key) => (e) => onFilter(key, e.target.value)
  const hasActive = Object.values(filters).some(Boolean) || range.from || range.to
  const activeCount = Object.values(filters).filter(Boolean).length + (range.from || range.to ? 1 : 0)

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
      {/* Label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 4 }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
        </svg>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Filters</span>
        {activeCount > 0 && (
          <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: '#1450f5', borderRadius: 99, padding: '1px 6px' }}>
            {activeCount}
          </span>
        )}
      </div>

      <FilterSelect label="Assignee"     value={filters.assigned_to}  onChange={set('assigned_to')}  opts={assignees} />
      <FilterSelect label="Team"         value={filters.team}         onChange={set('team')}          opts={teams} />
      <FilterSelect label="Area"         value={filters.area}         onChange={set('area')}          opts={areas} />
      <FilterSelect label="Sub-Category" value={filters.sub_category} onChange={set('sub_category')} opts={subCats} />

      <DateRangePicker dateFrom={range.from} dateTo={range.to} onChange={(from, to) => onRange({ from, to })} />

      {hasActive && (
        <button
          onClick={() => { onFilter('__reset__'); onRange({ from: '', to: '' }) }}
          style={{
            fontSize: 12, fontWeight: 500, color: '#c0305a',
            background: '#fff0f4', border: '1px solid #ffcdd7',
            borderRadius: 8, padding: '5px 10px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 4,
            fontFamily: 'Inter, sans-serif',
          }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
          Clear all
        </button>
      )}
    </div>
  )
}

function FilterSelect({ label, value, onChange, opts }) {
  return (
    <select
      value={value}
      onChange={onChange}
      style={{
        fontSize: 13, color: value ? '#111827' : '#6b7280',
        border: value ? '1px solid #1450f5' : '1px solid #e5e7eb',
        background: value ? '#eff4ff' : '#fff',
        borderRadius: 8, padding: '6px 10px',
        fontFamily: 'Inter, sans-serif',
        cursor: 'pointer', outline: 'none',
        fontWeight: value ? 500 : 400,
        transition: 'all 0.15s',
      }}
    >
      <option value="">All {label}s</option>
      {opts.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}
