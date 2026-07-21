import { useState, useRef, useEffect } from 'react'

const getSelectedValues = (val) => {
  if (!val) return []
  return val.split(',').map(v => v.trim()).filter(Boolean)
}
const joinValues = (values) => values.length ? values.join(',') : ''

export default function MultiSelectFilter({ label, value, onChange, options = [] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const selected = getSelectedValues(value)
  const allSelected = options.length > 0 && selected.length === options.length

  useEffect(() => {
    if (!open) return
    const onClickOutside = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  const btnLabel = selected.length === 0
    ? `All ${label}s`
    : selected.length === 1
    ? selected[0]
    : `${selected.length} ${label}s`

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          fontSize: 13, color: selected.length ? '#141414' : '#6e6e6e',
          border: selected.length ? '1px solid #1450f5' : '1px solid #e8e2d6',
          background: selected.length ? '#eef3fe' : '#fff',
          borderRadius: 8, padding: '6px 10px',
          fontFamily: 'Inter, sans-serif',
          cursor: 'pointer', outline: 'none',
          fontWeight: selected.length ? 500 : 400,
          display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
        }}
      >
        {btnLabel}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6, flexShrink: 0 }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 30,
          background: '#fff', border: '1px solid #e8e2d6', borderRadius: 9,
          boxShadow: '0 8px 20px rgba(20,20,20,0.12)',
          minWidth: 220, maxHeight: 320, display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ display: 'flex', gap: 6, padding: '8px 10px', borderBottom: '1px solid #f1ede3' }}>
            <button
              onClick={() => onChange(joinValues(options))}
              style={{
                flex: 1, fontSize: 11, fontWeight: 600, color: '#1450f5',
                background: '#eef3fe', border: '1px solid #c7d7fd', borderRadius: 6,
                padding: '4px 6px', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
              }}
            >
              Select all
            </button>
            <button
              onClick={() => onChange('')}
              style={{
                flex: 1, fontSize: 11, fontWeight: 600, color: '#c0305a',
                background: '#fff0f3', border: '1px solid #ffcdd7', borderRadius: 6,
                padding: '4px 6px', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
              }}
            >
              Clear all
            </button>
          </div>

          <div style={{ overflowY: 'auto', padding: 6 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, borderBottom: '1px solid #f1ede3', marginBottom: 4 }}>
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() => onChange(allSelected ? '' : joinValues(options))}
                style={{ cursor: 'pointer' }}
              />
              <span>All {label}s</span>
            </label>
            {options.map((o) => (
              <label key={o} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', cursor: 'pointer', fontSize: 12.5, color: '#404040' }}>
                <input
                  type="checkbox"
                  checked={selected.includes(o)}
                  onChange={(e) => {
                    onChange(e.target.checked
                      ? joinValues([...selected, o])
                      : joinValues(selected.filter(x => x !== o)))
                  }}
                  style={{ cursor: 'pointer' }}
                />
                <span>{o}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
