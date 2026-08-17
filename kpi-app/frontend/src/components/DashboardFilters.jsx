import DateRangePicker, { ALL_TIME_ONLY } from './DateRangePicker'
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

  // Same bar as the Feedback and User Activity tabs: bare "FILTERS" eyebrow,
  // controls at a common height, plain red reset. No funnel icon there, so none here.
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: '#6e6e6e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Filters
      </span>
      {activeCount > 0 && (
        <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: '#1450f5', borderRadius: 99, padding: '1px 7px' }}>
          {activeCount}
        </span>
      )}

      <MultiSelectFilter label="Assignee"     value={filters.assigned_to}  onChange={(v) => onFilter('assigned_to', v)}  options={assignees} />
      <MultiSelectFilter label="Team"         value={filters.team}         onChange={(v) => onFilter('team', v)}         options={teams} />
      <MultiSelectFilter label="Area"         value={filters.area}         onChange={(v) => onFilter('area', v)}         options={areas} />
      <MultiSelectFilter label="Sub-Category" value={filters.sub_category} onChange={(v) => onFilter('sub_category', v)} options={subCats} />

      <DateRangePicker dateFrom={range.from} dateTo={range.to} onChange={(from, to) => onRange({ from, to })} presets={ALL_TIME_ONLY} />

      {hasActive && (
        <button
          onClick={() => { onFilter('__reset__'); onRange({ from: '', to: '' }) }}
          style={{
            border: 'none', background: 'none', color: '#c0305a',
            fontSize: 12, fontWeight: 600, cursor: 'pointer',
            fontFamily: 'Inter, sans-serif',
          }}
        >
          Reset all
        </button>
      )}
    </div>
  )
}
