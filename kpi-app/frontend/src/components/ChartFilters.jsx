const CONFIG = {
  assigned_to:  { label: 'Assignee',     listKey: 'assigned_to_list' },
  team:         { label: 'Team',         listKey: 'team_list' },
  area:         { label: 'Area',         listKey: 'area_list' },
  sub_category: { label: 'Sub Category', listKey: 'sub_category_list' },
}

const SELECT_STYLE = {
  height: 30, padding: '0 8px', fontSize: 12, color: '#374151',
  border: '1px solid #e5e7eb', borderRadius: 7, outline: 'none',
  background: '#fff', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
}

export default function ChartFilters({ show = [], overview, filters = {}, onChange }) {
  if (!show.length) return null
  const hasActive = Object.values(filters).some(Boolean)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      {show.map((key) => {
        const cfg = CONFIG[key]
        if (!cfg) return null
        const options = overview?.[cfg.listKey] ?? []
        return (
          <select
            key={key}
            value={filters[key] || ''}
            onChange={(e) => onChange({ ...filters, [key]: e.target.value })}
            style={{
              ...SELECT_STYLE,
              color: filters[key] ? '#111827' : '#9ca3af',
              borderColor: filters[key] ? '#a5b4fc' : '#e5e7eb',
            }}
          >
            <option value="">All {cfg.label}s</option>
            {options.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        )
      })}

      {hasActive && (
        <button
          onClick={() => onChange(Object.fromEntries(show.map((k) => [k, ''])))}
          style={{
            height: 30, padding: '0 10px', fontSize: 12, cursor: 'pointer',
            background: 'none', color: '#6b7280', fontFamily: 'Inter, sans-serif',
            border: '1px solid #e5e7eb', borderRadius: 7, whiteSpace: 'nowrap',
          }}
        >
          Clear
        </button>
      )}
    </div>
  )
}
