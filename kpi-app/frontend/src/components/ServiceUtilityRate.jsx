import { useEffect, useMemo, useState } from 'react'
import { INTER, cardHeadingStyle, selStyle, Card } from './KoneUI'

// Reach, not busyness: the denominator is every user in the current filter, so
// the rate answers how far a service has spread through the user base rather
// than how many requests it carries.
const TONE = {
  active:  { fg: '#1e8a5e', bg: '#edf8f2', border: '#aae1c8' },
  regular: { fg: '#b87d00', bg: '#fffae3', border: '#ffe141' },
  dormant: { fg: '#c0305a', bg: '#fff0f3', border: '#f28ba0' },
}

const th = {
  textAlign: 'left', padding: '9px 14px', fontSize: 11, fontWeight: 600,
  color: '#6e6e6e', borderBottom: '2px solid #e8e2d6', background: '#faf8f3',
  whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.04em',
}
const td = { padding: '10px 14px', borderBottom: '1px solid #f3eee6', fontSize: 13 }

function Count({ n, tone }) {
  return (
    <span style={{
      display: 'inline-block', minWidth: 30, textAlign: 'center',
      fontWeight: 700, fontSize: 12, color: tone.fg, background: tone.bg,
      border: `1px solid ${tone.border}`, borderRadius: 6, padding: '2px 8px',
    }}>{n}</span>
  )
}

export default function ServiceUtilityRate({ rows = [] }) {
  const [picked, setPicked] = useState('')
  const [open, setOpen] = useState(false)

  // Whichever service is chosen stays chosen while the filters change, unless
  // it stops existing — then fall back to the first rather than showing an
  // empty list with a stale name on it.
  useEffect(() => {
    if (!rows.length) return
    if (!rows.some(r => r.service === picked)) setPicked(rows[0].service)
  }, [rows, picked])

  const current = useMemo(
    () => rows.find(r => r.service === picked) || rows[0] || null,
    [rows, picked],
  )

  if (!rows.length) {
    return (
      <Card title="Service Utility Rate by Users">
        <div style={{ padding: 30, textAlign: 'center', color: '#9c9c9c', fontSize: 13 }}>
          No requests in this selection.
        </div>
      </Card>
    )
  }

  const notUsed = current?.not_used ?? []

  return (
    <Card
      title="Service Utility Rate by Users"
      subtitle="How much of the user base each service has reached, and how recently they used it"
    >
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Service</th>
              <th style={{ ...th, textAlign: 'right' }}>Total Users</th>
              <th style={{ ...th, textAlign: 'right' }}>Users Who Have Used It</th>
              <th style={{ ...th, width: 210 }}>Utility Rate</th>
              <th style={{ ...th, textAlign: 'center' }}>Active</th>
              <th style={{ ...th, textAlign: 'center' }}>Regular</th>
              <th style={{ ...th, textAlign: 'center' }}>Dormant</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.service} style={{ background: i % 2 ? '#faf8f3' : '#fff' }}>
                <td style={{ ...td, fontWeight: 600, color: '#141414', whiteSpace: 'nowrap' }}>
                  <span style={{
                    fontWeight: 700, color: '#1450f5', background: '#eef3fe',
                    borderRadius: 5, padding: '2px 7px', fontSize: 11, marginRight: 8,
                  }}>{r.short}</span>
                  {r.service}
                </td>
                <td style={{ ...td, textAlign: 'right', color: '#6e6e6e' }}>{r.total_users}</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: '#141414' }}>{r.users_used}</td>
                <td style={td}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1, height: 8, background: '#f3eee6', borderRadius: 4, overflow: 'hidden', minWidth: 90 }}>
                      <div style={{
                        width: `${r.utility_rate_pct ?? 0}%`, height: '100%',
                        background: '#1450f5', borderRadius: 4,
                      }} />
                    </div>
                    <span style={{ fontWeight: 700, fontSize: 13, color: '#1450f5', minWidth: 38, textAlign: 'right' }}>
                      {r.utility_rate_pct == null ? '—' : `${r.utility_rate_pct}%`}
                    </span>
                  </div>
                </td>
                <td style={{ ...td, textAlign: 'center' }}><Count n={r.active} tone={TONE.active} /></td>
                <td style={{ ...td, textAlign: 'center' }}><Count n={r.regular} tone={TONE.regular} /></td>
                <td style={{ ...td, textAlign: 'center' }}><Count n={r.dormant} tone={TONE.dormant} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ fontSize: 11, color: '#9c9c9c', margin: '12px 0 0', lineHeight: 1.7, fontFamily: INTER }}>
        Active, Regular and Dormant are measured on the user's last request <b>for that service</b>,
        not their activity overall — someone raising weekly content requests is not an active user
        of Graphic Design because they tried it once a year ago. The three add up to the users who
        have used it.
      </p>

      {/* ── Who has never asked for it ─────────────────────────────────────
           Folded away on load: it is a list to go and work through, not
           something to scroll past every time the page is opened. ──────── */}
      <div style={{ marginTop: 22, borderTop: '1px solid #e8e2d6', paddingTop: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button
            onClick={() => setOpen(o => !o)}
            aria-expanded={open}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, border: 'none',
              background: 'none', cursor: 'pointer', padding: 0, fontFamily: INTER,
            }}
          >
            <span style={{
              display: 'inline-block', transform: `rotate(${open ? 90 : 0}deg)`,
              transition: 'transform 0.15s', color: '#6e6e6e', fontSize: 11,
            }}>▶</span>
            <span style={cardHeadingStyle('#141414')}>Users who haven't used</span>
          </button>
          <select value={picked} onChange={e => setPicked(e.target.value)} style={selStyle}>
            {rows.map(r => <option key={r.service} value={r.service}>{r.short} — {r.service}</option>)}
          </select>
          <span style={{ fontSize: 12, color: '#9c9c9c' }}>
            {notUsed.length} of {current?.total_users ?? 0} users
          </span>
        </div>

        {open && (notUsed.length === 0 ? (
          <div style={{
            marginTop: 12,
            padding: '18px 14px', textAlign: 'center', fontSize: 13, color: '#1e8a5e',
            background: '#edf8f2', border: '1px solid #aae1c8', borderRadius: 8,
          }}>
            Every user in this selection has used {current?.short}.
          </div>
        ) : (
          <div style={{ marginTop: 12, maxHeight: 300, overflowY: 'auto', border: '1px solid #e8e2d6', borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...th, position: 'sticky', top: 0, zIndex: 1 }}>User</th>
                  <th style={{ ...th, position: 'sticky', top: 0, zIndex: 1 }}>Frontline</th>
                  <th style={{ ...th, position: 'sticky', top: 0, zIndex: 1 }}>Area</th>
                  <th style={{ ...th, position: 'sticky', top: 0, zIndex: 1, textAlign: 'right' }}>
                    Requests Elsewhere
                  </th>
                </tr>
              </thead>
              <tbody>
                {notUsed.map((u, i) => (
                  <tr key={u.user} style={{ background: i % 2 ? '#faf8f3' : '#fff' }}>
                    <td style={{ ...td, fontWeight: 600, color: '#141414' }}>{u.user}</td>
                    <td style={{ ...td, color: '#404040' }}>{u.frontline}</td>
                    <td style={{ ...td, color: '#404040' }}>{u.area}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: '#1450f5' }}>{u.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </Card>
  )
}
