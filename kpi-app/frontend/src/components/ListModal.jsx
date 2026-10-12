import { useEffect } from 'react'
import { INTER, KONE_FONT, cardHeadingStyle } from './KoneUI'

// ── A list behind a number ────────────────────────────────────────────────────
// Every headline on this page is a count of something, and the question it
// invites is "which ones?". This is that answer: one dialog, given rows and
// columns by whoever opened it, so a card can show its working without each
// one growing a panel of its own.
const th = {
  textAlign: 'left', padding: '9px 14px', fontSize: 11, fontWeight: 600,
  color: '#6e6e6e', borderBottom: '2px solid #e8e2d6', background: '#faf8f3',
  whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.04em',
  position: 'sticky', top: 0, zIndex: 1,
}
const td = { padding: '9px 14px', borderBottom: '1px solid #f3eee6', fontSize: 13, color: '#141414' }

export default function ListModal({ title, subtitle, columns = [], rows = [], onClose, width = 640 }) {
  // Escape closes it: a dialog that can only be dismissed by hitting a small
  // target is one people learn not to open.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(20,20,20,0.45)', zIndex: 120,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 12, width: `min(${width}px, 100%)`,
          maxHeight: '82vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 12px 40px rgba(20,20,20,0.25)', overflow: 'hidden',
        }}
      >
        <div style={{
          padding: '18px 22px', borderBottom: '1px solid #e8e2d6',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
        }}>
          <div>
            <div style={cardHeadingStyle('#141414')}>{title}</div>
            {subtitle && (
              <div style={{ fontSize: 12, color: '#6e6e6e', marginTop: 6, fontFamily: INTER }}>
                {subtitle}
              </div>
            )}
          </div>
          <button onClick={onClose} aria-label="Close"
            style={{
              border: 'none', background: 'none', cursor: 'pointer', color: '#9c9c9c',
              fontSize: 22, lineHeight: 1, padding: 0,
            }}>×</button>
        </div>

        <div style={{ overflowY: 'auto' }}>
          {!rows.length ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#9c9c9c', fontSize: 13 }}>
              Nothing to show here.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {columns.map(c => (
                    <th key={c.key} style={{ ...th, textAlign: c.align || 'left' }}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.key ?? r.name ?? i} style={{ background: i % 2 ? '#faf8f3' : '#fff' }}>
                    {columns.map((c, j) => (
                      <td key={c.key} style={{
                        ...td, textAlign: c.align || 'left',
                        fontWeight: j === 0 ? 600 : 400,
                        fontFamily: c.mono ? KONE_FONT : undefined,
                        color: c.tone || td.color,
                      }}>
                        {c.render ? c.render(r) : (r[c.key] ?? '—')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
