import DateRangePicker from './DateRangePicker'
import MultiSelectFilter from './MultiSelectFilter'

// Only these specialists are offered as an Assignee filter option — everyone
// else (Pooja, Sameera, Suresh, etc.) still counts fully in all report data,
// they're just not individually selectable here.
const ALLOWED_ASSIGNEES = [
  'Arvind Lakshminarayanan',
  'Akshayaa Rajeswari AS',
  'Akshaya Praveen',
  'Nitish JK',
  'Ranjithkumar Ashokkumar',
  'Ajith A',
]

export default function DashboardFilters({ overview, filters, range, onFilter, onRange }) {
  const available = new Set(overview?.assigned_to_list ?? [])
  const assignees = ALLOWED_ASSIGNEES.filter((a) => available.has(a))
  const teams     = overview?.team_list         ?? []
  const areas     = overview?.area_list         ?? []
  const subCats   = overview?.sub_category_list ?? []

  const hasActive = Object.values(filters).some(Boolean) || range.from || range.to
  const activeCount = Object.values(filters).filter(Boolean).length + (range.from || range.to ? 1 : 0)

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
      {/* Label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 4 }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6e6e6e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
        </svg>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#6e6e6e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Filters</span>
        {activeCount > 0 && (
          <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: '#1450f5', borderRadius: 99, padding: '1px 6px' }}>
            {activeCount}
          </span>
        )}
      </div>

      <MultiSelectFilter label="Assignee"     value={filters.assigned_to}  onChange={(v) => onFilter('assigned_to', v)}  options={assignees} />
      <MultiSelectFilter label="Team"         value={filters.team}         onChange={(v) => onFilter('team', v)}         options={teams} />
      <MultiSelectFilter label="Area"         value={filters.area}         onChange={(v) => onFilter('area', v)}         options={areas} />
      <MultiSelectFilter label="Sub-Category" value={filters.sub_category} onChange={(v) => onFilter('sub_category', v)} options={subCats} />

      <DateRangePicker dateFrom={range.from} dateTo={range.to} onChange={(from, to) => onRange({ from, to })} />

      {hasActive && (
        <button
          onClick={() => { onFilter('__reset__'); onRange({ from: '', to: '' }) }}
          style={{
            fontSize: 12, fontWeight: 500, color: '#c0305a',
            background: '#fff0f3', border: '1px solid #ffcdd7',
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
