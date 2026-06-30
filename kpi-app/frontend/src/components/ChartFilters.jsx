import React, { useState } from 'react'

const CONFIG = {
  assigned_to:  { label: 'Assignee',     listKey: 'assigned_to_list', multiSelect: false },
  team:         { label: 'Team',         listKey: 'team_list', multiSelect: false },
  area:         { label: 'Area',         listKey: 'area_list', multiSelect: false },
  sub_category: { label: 'Sub Category', listKey: 'sub_category_list', multiSelect: true },
}

const SELECT_STYLE = {
  height: 30, padding: '0 8px', fontSize: 12, color: '#374151',
  border: '1px solid #e5e7eb', borderRadius: 7, outline: 'none',
  background: '#fff', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
}

const getSelectedValues = (val) => {
  if (!val) return []
  return val.split(',').map(v => v.trim()).filter(Boolean)
}

const setSelectedValues = (values) => {
  return values.length ? values.join(',') : ''
}

export default function ChartFilters({ show = [], overview, filters = {}, onChange }) {
  if (!show.length) return null
  const hasActive = Object.values(filters).some(Boolean)
  const [expandedDropdown, setExpandedDropdown] = useState(null)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      {show.map((key) => {
        const cfg = CONFIG[key]
        if (!cfg) return null
        const options = overview?.[cfg.listKey] ?? []
        const isMulti = cfg.multiSelect
        const isExpanded = expandedDropdown === key

        if (isMulti) {
          const selectedValues = getSelectedValues(filters[key])
          const selectedCount = selectedValues.length
          const btnLabel = selectedCount === 0
            ? `All ${cfg.label}s`
            : selectedCount === 1
            ? selectedValues[0]
            : `${selectedCount} selected`

          return (
            <div key={key} style={{ position: 'relative', display: 'inline-block' }}>
              <button
                onClick={() => setExpandedDropdown(isExpanded ? null : key)}
                style={{
                  ...SELECT_STYLE,
                  color: selectedCount > 0 ? '#111827' : '#9ca3af',
                  borderColor: selectedCount > 0 ? '#a5b4fc' : '#e5e7eb',
                }}
              >
                {btnLabel}
              </button>
              {isExpanded && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, marginTop: 4,
                  background: '#fff', border: '1px solid #e5e7eb', borderRadius: 7,
                  boxShadow: '0 4px 6px rgba(0,0,0,0.1)', zIndex: 10,
                  minWidth: 200, maxHeight: 300, overflowY: 'auto',
                }}>
                  <div style={{ padding: 8 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', cursor: 'pointer', fontSize: 12 }}>
                      <input
                        type="checkbox"
                        checked={selectedCount === options.length && options.length > 0}
                        onChange={() => {
                          if (selectedCount === options.length) {
                            onChange({ ...filters, [key]: '' })
                          } else {
                            onChange({ ...filters, [key]: setSelectedValues(options) })
                          }
                        }}
                        style={{ cursor: 'pointer' }}
                      />
                      <span>All {cfg.label}s</span>
                    </label>
                    <div style={{ borderTop: '1px solid #e5e7eb', margin: '6px 0' }} />
                    {options.map((v) => (
                      <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', cursor: 'pointer', fontSize: 12 }}>
                        <input
                          type="checkbox"
                          checked={selectedValues.includes(v)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              onChange({ ...filters, [key]: setSelectedValues([...selectedValues, v]) })
                            } else {
                              onChange({ ...filters, [key]: setSelectedValues(selectedValues.filter(x => x !== v)) })
                            }
                          }}
                          style={{ cursor: 'pointer' }}
                        />
                        <span>{v}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        }

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
          onClick={() => { onChange(Object.fromEntries(show.map((k) => [k, '']))); setExpandedDropdown(null) }}
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
