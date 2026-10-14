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
  ignoresServiceFilter = false, rateLabel = 'Service breadth', throughput = false,
  effort = false, hoursPerDay = 8,
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
      {throughput && (
        <p style={{ fontSize: 11, color: '#9c9c9c', margin: '0 0 10px', fontFamily: INTER }}>
          Capacity utilisation is estimated hours closed in this window over the working hours it
          held. Available hours assume full time with no leave — the export carries no absence or
          part-time data — so a person who took leave will read high. SLA met and the median are in
          working days, weekends and public holidays excluded, and judge every ticket against the
          target currently set in Rates &amp; SLA.
        </p>
      )}
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
              {throughput ? (
                <>
                  <th style={{ ...thStyle, textAlign: 'right' }}
                      title="Estimated hours of the tickets they closed in this window, over the working hours the window held. Assumes full time with no leave — there is no absence data in the export.">
                    Capacity utilisation
                  </th>
                  <th style={{ ...thStyle, textAlign: 'right' }}
                      title="Closed tickets that took no more than their target working days, over the tickets they closed. Every ticket is judged against the target currently set in Rates & SLA — the panel keeps no history, so a target changed since is applied to older work too.">
                    SLA met
                  </th>
                  <th style={{ ...thStyle, textAlign: 'right' }}
                      title="Median working days from created to closed, weekends and public holidays excluded, over the tickets they closed">
                    Median days
                  </th>
                  <th style={{ ...thStyle, textAlign: 'right' }}
                      title="Tickets assigned to them that were still open at the end of the period, whenever they were raised. The red figure is how many of those have already passed their SLA target.">
                    Open
                  </th>
                </>
              ) : (
                <>
                  <th style={{ ...thStyle, textAlign: 'right' }} title={rateLabel === 'Reach'
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
                </>
              )}
              {keys.map(k => (
                <th key={k} style={{ ...thStyle, textAlign: 'center' }} title={k}>
                  {labels[k] ?? k}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              // A hub function is shown but muted: its row is real work, and
              // reading it as a market's performance is the mistake to avoid.
              const muted = r.is_frontline === false
              return (
              <tr key={r.name} style={{ borderBottom: '1px solid #f1ede3', opacity: muted ? 0.55 : 1 }}>
                <td style={{ padding: '9px 6px', minWidth: 140 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3,
                                   background: muted ? '#b9b1a3' : BAR, flexShrink: 0 }} />
                    <span style={{ fontWeight: 600, color: muted ? '#6e6e6e' : '#141414',
                                   fontFamily: INTER, whiteSpace: 'nowrap' }}
                          title={muted ? 'A hub function, not a frontline — excluded from frontline totals' : undefined}>
                      {r.name}{muted ? ' ·' : ''}
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
                {throughput ? (
                  <>
                    {/* Never capped: over 100% is either a genuine overload or
                        estimates set too high for this person's mix, and
                        flattening it to 100 hides both. */}
                    <td style={{ padding: '9px 6px', textAlign: 'right', fontWeight: 700, fontFamily: INTER,
                                 color: (r.capacity_pct ?? 0) > 100 ? '#c0305a' : '#1450f5' }}
                        title={`${Math.round(r.delivered_hours ?? 0)} estimated hours closed of `
                               + `${Math.round(r.available_hours ?? 0)} available `
                               + `(${r.working_days ?? 0} working days x ${hoursPerDay} h), full time with no leave`}>
                      {r.capacity_pct == null ? '—' : `${r.capacity_pct}%`}
                    </td>
                    {/* Below five closed tickets one ticket moves the figure by
                        twenty points, so the count stands alone rather than
                        dressing up as a rate. */}
                    <td style={{ padding: '9px 6px', textAlign: 'right', fontWeight: 700, fontFamily: INTER,
                                 color: (r.sla_met_pct ?? 100) < 80 ? '#c0305a' : '#1450f5' }}
                        title={r.sla_closed
                          ? `${r.sla_met} of ${r.sla_closed} closed tickets met their target`
                          : 'Nothing closed in this window'}>
                      {r.sla_closed
                        ? (r.sla_show_pct === false
                            ? <span style={{ color: '#b9b1a3', fontWeight: 600 }}
                                    title={`Only ${r.sla_closed} closed tickets — too few for a percentage`}>
                                {r.sla_met}/{r.sla_closed}
                              </span>
                            : `${r.sla_met_pct}%`)
                        : '—'}
                    </td>
                    <td style={{ padding: '9px 6px', textAlign: 'right', color: '#141414', fontWeight: 700, fontFamily: INTER }}
                        title={r.sla_median_calendar_days == null ? undefined
                          : `${r.sla_median_calendar_days} calendar days`}>
                      {r.sla_median_working_days == null ? '—' : `${r.sla_median_working_days}d`}
                    </td>
                    {/* The backlog shown is everything still open at the end of
                        the period, not only what was raised inside it, because
                        that is the set the breach count is drawn from — two
                        populations in one cell would read as a contradiction
                        whenever an old ticket is late. */}
                    <td style={{ padding: '9px 6px', textAlign: 'right', color: r.sla_open_total ? '#b87d00' : '#6e6e6e', fontWeight: 600, fontFamily: INTER }}
                        title={`${r.sla_open_total ?? 0} open at the end of the period`
                               + `, of which ${r.open_backlog ?? 0} were raised inside it`}>
                      {r.sla_open_total == null ? '—' : r.sla_open_total}
                      {r.sla_open_breached ? (
                        <span style={{ color: '#c0305a', fontWeight: 700, marginLeft: 6 }}
                              title={`${r.sla_open_breached} of them are already past their SLA target`}>
                          {r.sla_open_breached} late
                        </span>
                      ) : null}
                    </td>
                  </>
                ) : (
                  <>
                    {/* A percentage over three people swings 33 points when one
                        of them moves, so below the floor the count stands alone. */}
                    <td style={{ padding: '9px 6px', textAlign: 'right', color: '#1450f5', fontWeight: 700, fontFamily: INTER }}>
                      {r.utility_pct == null ? '—'
                        : r.show_pct === false
                          ? <span style={{ color: '#b9b1a3', fontWeight: 600 }} title={`Only ${r.users} users — too few for a percentage`}>n={r.users}</span>
                          : `${r.utility_pct}%`}
                    </td>
                    <td style={{ padding: '9px 6px', textAlign: 'right', color: '#6e6e6e', fontWeight: 600, fontFamily: INTER }}>
                      {effort
                        ? (r.est_hours_per_user == null ? '—' : r.est_hours_per_user)
                        : (r.requests_per_user == null ? '—' : r.requests_per_user)}
                    </td>
                  </>
                )}
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
        {rows.some(r => r.is_frontline === false) && ' Greyed rows are hub functions rather than frontlines.'}
      </p>
    </Card>
  )
}
