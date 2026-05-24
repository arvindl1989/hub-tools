const CONFIG = {
  assigned_to:  { label: 'Assignee',     listKey: 'assigned_to_list' },
  team:         { label: 'Team',         listKey: 'team_list' },
  area:         { label: 'Area',         listKey: 'area_list' },
  sub_category: { label: 'Sub Category', listKey: 'sub_category_list' },
}

/**
 * Renders filter dropdowns for chart sections.
 * @param {string[]}  show     - which keys to show, e.g. ['team','area','sub_category']
 * @param {object}    overview - overview response (contains *_list arrays)
 * @param {object}    filters  - current filter values
 * @param {function}  onChange - called with updated filter object
 */
export default function ChartFilters({ show = [], overview, filters = {}, onChange }) {
  if (!show.length) return null

  return (
    <div className="flex flex-wrap gap-2">
      {show.map((key) => {
        const cfg = CONFIG[key]
        if (!cfg) return null
        const options = overview?.[cfg.listKey] ?? []
        return (
          <select
            key={key}
            value={filters[key] || ''}
            onChange={(e) => onChange({ ...filters, [key]: e.target.value })}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            <option value="">All {cfg.label}s</option>
            {options.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        )
      })}
      {Object.values(filters).some(Boolean) && (
        <button
          onClick={() => onChange(Object.fromEntries(show.map((k) => [k, ''])))}
          className="text-xs text-gray-400 hover:text-gray-600 px-1"
          title="Clear filters"
        >
          ✕ Clear
        </button>
      )}
    </div>
  )
}
