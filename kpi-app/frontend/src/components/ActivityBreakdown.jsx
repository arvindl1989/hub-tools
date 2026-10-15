import { INTER, thStyle, Card, Empty } from './KoneUI'

// ── Four cuts of the same activity ───────────────────────────────────────────
// Built to read like the Feedback page's four tables, because they answer the
// same four questions of the same organisation and nobody should have to learn
// two layouts. Where Feedback shows its response rate and a rating per
// parameter, this shows the utility rate and the requests behind it, service
// by service.
const BAR = '#1450f5'

// A request count is a volume, not a score, so it is shaded by where it sits
// against the busiest cell in its own column rather than carrying a traffic
// light. The eye can then compare down a column, which is what the column is
// for.
function countBadge(n, max) {
  if (!n) return { bg: '#faf8f3', fg: '#d8d8d8', weight: 400 }
  const r = max ? n / max : 0
  if (r >= 0.66) return { bg: '#1450f5', fg: '#ffffff', weight: 700 }
  if (r >= 0.33) return { bg: '#a1b9fb', fg: '#141414', weight: 700 }
  return { bg: '#eef3fe', fg: '#1450f5', weight: 600 }
}

export default function ActivityBreakdown({
  title, subtitle, rows = [], keys = [], labels = {}, headerLabel = 'Name',
  ignoresServiceFilter = false, rateLabel = 'Utility rate', rateOfWholeBase = false,
  effort = false,
}) {
  if (!rows.length) {
    return <Card title={title} subtitle={subtitle}><Empty /></Card>
  }

  const maxVolume = Math.max(...rows.map(r => (effort ? (r.est_hours ?? 0) : r.requests)), 1)
  // One scale per column: services differ in size by an order of magnitude,
  // and a shared scale would leave the smaller ones permanently pale.
  const cellOf = (r, k) => (effort ? (r.breakdown_hours?.[k] ?? 0) : (r.breakdown?.[k] ?? 0))
  const columnMax = {}
  keys.forEach(k => {
    columnMax[k] = Math.max(...rows.map(r => cellOf(r, k)), 1)
  })

  return (
    <Card title={title} subtitle={subtitle}>
      {ignoresServiceFilter && (
        <p style={{ fontSize: 11, color: '#9c9c9c', margin: '0 0 10px', fontFamily: INTER }}>
          The Service filter is ignored in this table — it would leave only one service in the
          denominator and every row would read 100%. Every other filter still applies.
        </p>
      )}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e8e2d6' }}>
              <th style={thStyle}>{headerLabel}</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Users</th>
              <th style={{ ...thStyle, textAlign: 'right' }}
                  title={effort ? 'Standard per-ticket estimates from Rates & SLA, not logged time' : undefined}>
                {effort ? 'Est. hours' : 'Requests'}
              </th>
              <th style={{ ...thStyle, textAlign: 'right' }} title={rateOfWholeBase
                    ? 'Users of this service as a share of the whole user base'
                    : 'Average, across the services, of the share of this group\u2019s users who have used each one'}>
                {rateLabel}
              </th>
              <th style={{ ...thStyle, textAlign: 'right' }}
                  title={effort
                    ? 'Estimated hours divided by users in this group'
                    : 'Requests divided by users in this group'}>
                {effort ? 'Est. h / user' : 'Req / user'}
              </th>
              {keys.map(k => (
                <th key={k} style={{ ...thStyle, textAlign: 'center' }} title={k}>
                  {labels[k] ?? k}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              return (
              <tr key={r.name} style={{ borderBottom: '1px solid #f1ede3' }}>
                <td style={{ padding: '9px 6px', minWidth: 140 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3,
                                   background: BAR, flexShrink: 0 }} />
                    <span style={{ fontWeight: 600, color: '#141414',
                                   fontFamily: INTER, whiteSpace: 'nowrap' }}>
                      {r.name}
                    </span>
                  </div>
                  <div style={{ height: 6, background: '#f1ede3', borderRadius: 3, marginTop: 6, marginLeft: 18, overflow: 'hidden' }}>
                    <div style={{ width: `${((effort ? (r.est_hours ?? 0) : r.requests) / maxVolume) * 100}%`, height: '100%', background: BAR, borderRadius: 3 }} />
                  </div>
                </td>
                <td style={{ padding: '9px 6px', textAlign: 'right', color: '#6e6e6e', fontWeight: 600, fontFamily: INTER }}>
                  {r.users}
                </td>
                <td style={{ padding: '9px 6px', textAlign: 'right', color: '#6e6e6e', fontWeight: 600, fontFamily: INTER }}
                    title={effort ? `${r.requests} requests` : undefined}>
                  {effort ? Math.round(r.est_hours ?? 0).toLocaleString() : r.requests}
                </td>
                <td style={{ padding: '9px 6px', textAlign: 'right', color: '#1450f5', fontWeight: 700, fontFamily: INTER }}
                    title={`Across ${r.users} ${r.users === 1 ? 'user' : 'users'}`}>
                  {r.utility_pct == null ? '—' : `${r.utility_pct}%`}
                </td>
                <td style={{ padding: '9px 6px', textAlign: 'right', color: '#6e6e6e', fontWeight: 600, fontFamily: INTER }}>
                  {effort
                    ? (r.est_hours_per_user == null ? '—' : r.est_hours_per_user)
                    : (r.requests_per_user == null ? '—' : r.requests_per_user)}
                </td>
                {keys.map(k => {
                  const n = cellOf(r, k)
                  const t = countBadge(n, columnMax[k])
                  return (
                    <td key={k} style={{ padding: '9px 6px', textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-block', minWidth: 30, borderRadius: 6, padding: '3px 8px',
                        background: t.bg, color: t.fg, fontWeight: t.weight, fontSize: 12,
                        fontFamily: INTER,
                      }}>{n ? (effort ? Math.round(n).toLocaleString() : n) : '—'}</span>
                    </td>
                  )
                })}
              </tr>
            )})}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 11, color: '#9c9c9c', margin: '10px 0 0', lineHeight: 1.6, fontFamily: INTER }}>
        {effort ? 'Estimated hours' : 'Requests'} add up to the total; users do not. Someone whose tickets span two groups is
        counted in both rows, which is why no total is shown for that column.
      </p>
    </Card>
  )
}
