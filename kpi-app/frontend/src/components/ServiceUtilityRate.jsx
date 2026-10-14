import { Fragment, useMemo, useState } from 'react'
import { INTER, cardHeadingStyle, Card } from './KoneUI'
import ListModal from './ListModal'

// Reach across people and reach across frontlines are the same question asked
// of two populations. They were two tables, which meant looking up the same
// service twice to compare them; here each service is one row with both
// denominators side by side.
const TONE = {
  active:  { fg: '#1e8a5e', bg: '#edf8f2', border: '#aae1c8' },
  regular: { fg: '#b87d00', bg: '#fffae3', border: '#ffe141' },
  dormant: { fg: '#c0305a', bg: '#fff0f3', border: '#f28ba0' },
}

// Fifteen columns now, since the SLA record joined the two reach halves, so
// the padding is tighter than elsewhere to keep the whole row on one screen.
const th = {
  textAlign: 'left', padding: '8px 8px', fontSize: 11, fontWeight: 600,
  color: '#6e6e6e', borderBottom: '2px solid #e8e2d6', background: '#faf8f3',
  whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.04em',
}
const td = { padding: '10px 8px', borderBottom: '1px solid #f3eee6', fontSize: 13 }

function Count({ n, tone }) {
  return (
    <span style={{
      display: 'inline-block', minWidth: 28, textAlign: 'center',
      fontWeight: 700, fontSize: 12, color: tone.fg, background: tone.bg,
      border: `1px solid ${tone.border}`, borderRadius: 6, padding: '2px 7px',
    }}>{n}</span>
  )
}

function Rate({ pct }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 7, background: '#f3eee6', borderRadius: 4, overflow: 'hidden', minWidth: 54 }}>
        <div style={{ width: `${pct ?? 0}%`, height: '100%', background: '#1450f5', borderRadius: 4 }} />
      </div>
      <span style={{ fontWeight: 700, fontSize: 12, color: '#1450f5', minWidth: 34, textAlign: 'right' }}>
        {pct == null ? '—' : `${pct}%`}
      </span>
    </div>
  )
}

// How a service did against its own target. A rate over three closed tickets
// swings thirty points when one of them moves, so under the floor the raw
// count stands instead of a percentage.
function Sla({ sla, target }) {
  if (!sla || !sla.closed) {
    return <span style={{ color: '#b9b1a3', fontSize: 12 }}>—</span>
  }
  const late = sla.met_pct != null && sla.met_pct < 80
  return (
    <span
      style={{ fontWeight: 700, fontSize: 12, color: late ? '#c0305a' : '#1e8a5e' }}
      title={`${sla.met} of ${sla.closed} closed tickets were done within `
             + `${target ?? '—'} working days`}
    >
      {sla.show_pct === false
        ? <span style={{ color: '#b9b1a3' }}>{sla.met}/{sla.closed}</span>
        : `${sla.met_pct}%`}
    </span>
  )
}

export default function ServiceUtilityRate({ rows = [], ignoresServiceFilter = false }) {
  const [open, setOpen] = useState(null)   // the service whose non-users are shown
  // DEA is three services with targets of 30, 7 and 30 working days. A blended
  // figure for the parent would hide one missing its week behind two that have
  // a month, so the children open underneath on request.
  const [expanded, setExpanded] = useState({})

  const current = useMemo(
    () => rows.find(r => r.service === open) || null,
    [rows, open],
  )

  if (!rows.length) {
    return (
      <Card title="Service Utility Rate">
        <div style={{ padding: 30, textAlign: 'center', color: '#9c9c9c', fontSize: 13 }}>
          No requests in this selection.
        </div>
      </Card>
    )
  }

  // Both populations in one dialog: the people who have never asked for the
  // service, then the frontlines where nobody has.
  const modalRows = current ? [
    ...current.users.not_used.map(u => ({
      key: `u:${u.user}`, kind: 'User', name: u.user,
      where: `${u.frontline} · ${u.area}`, requests: u.count,
    })),
    ...current.frontlines.not_used.map(f => ({
      key: `f:${f.frontline}`, kind: 'Frontline', name: f.frontline,
      where: f.area, requests: f.total_requests,
    })),
  ] : []

  return (
    <Card
      title="Service Utility Rate"
      subtitle="How far each service has reached — across the people who raise requests, and across the frontlines they sit in"
    >
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...th, borderBottom: '1px solid #e8e2d6' }} />
              <th colSpan={5} style={{
                ...th, textAlign: 'center', color: '#1450f5', background: '#f5f8fe',
                borderBottom: '1px solid #e8e2d6', borderLeft: '2px solid #dbe6fd',
              }}>By users</th>
              <th colSpan={5} style={{
                ...th, textAlign: 'center', color: '#1450f5', background: '#f5f8fe',
                borderBottom: '1px solid #e8e2d6', borderLeft: '2px solid #dbe6fd',
              }}>By frontlines</th>
              <th colSpan={3} style={{
                ...th, textAlign: 'center', color: '#1450f5', background: '#f5f8fe',
                borderBottom: '1px solid #e8e2d6', borderLeft: '2px solid #dbe6fd',
              }}>Against the SLA</th>
              <th style={{ ...th, borderBottom: '1px solid #e8e2d6' }} />
            </tr>
            <tr>
              <th style={th}>Service</th>
              <th style={{ ...th, textAlign: 'right', borderLeft: '2px solid #dbe6fd' }}>Used / Total</th>
              <th style={{ ...th, minWidth: 130 }} title="Users of this service as a share of everyone in the filter">Reach</th>
              <th style={{ ...th, textAlign: 'center' }}>Active</th>
              <th style={{ ...th, textAlign: 'center' }}>Regular</th>
              <th style={{ ...th, textAlign: 'center' }}>Dormant</th>
              <th style={{ ...th, textAlign: 'right', borderLeft: '2px solid #dbe6fd' }}>Used / Total</th>
              <th style={{ ...th, minWidth: 130 }} title="Users of this service as a share of everyone in the filter">Reach</th>
              <th style={{ ...th, textAlign: 'center' }}>Active</th>
              <th style={{ ...th, textAlign: 'center' }}>Regular</th>
              <th style={{ ...th, textAlign: 'center' }}>Dormant</th>
              <th style={{ ...th, textAlign: 'center', borderLeft: '2px solid #dbe6fd' }}
                  title="Closed tickets done within their target working days, over the tickets closed in this window. Every ticket is judged against the target currently set in Rates & SLA — the panel keeps no history, so a target changed since is applied to older work too.">
                Met
              </th>
              <th style={{ ...th, textAlign: 'center' }}
                  title="Median working days from created to closed, weekends and public holidays excluded. The calendar figure is in the tooltip.">
                Median
              </th>
              <th style={{ ...th, textAlign: 'center' }}
                  title="Tickets still open at the end of the period that have already passed their target">
                Open &amp; late
              </th>
              <th style={{ ...th, textAlign: 'center' }}>Never used</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const never = r.users.not_used.length + r.frontlines.not_used.length
              const kids = r.sub_services || []
              const isOpen = !!expanded[r.service]
              return (
              <Fragment key={r.service}>
                <tr style={{ background: i % 2 ? '#faf8f3' : '#fff' }}>
                  <td style={{ ...td, fontWeight: 600, color: '#141414', whiteSpace: 'nowrap' }}>
                    <span style={{
                      fontWeight: 700, color: '#1450f5', background: '#eef3fe',
                      borderRadius: 5, padding: '2px 7px', fontSize: 11, marginRight: 8,
                    }}>{r.short}</span>
                    {r.service}
                    {kids.length > 0 && (
                      <button
                        onClick={() => setExpanded(p => ({ ...p, [r.service]: !p[r.service] }))}
                        style={{
                          marginLeft: 8, background: 'none', border: '1px solid #dbe6fd',
                          borderRadius: 5, color: '#1450f5', fontSize: 11, fontWeight: 600,
                          fontFamily: INTER, cursor: 'pointer', padding: '1px 6px',
                        }}
                        title="The three services inside this roll-up have different targets"
                      >
                        {isOpen ? '− hide' : `+ ${kids.length} sub-services`}
                      </button>
                    )}
                  </td>

                  <td style={{ ...td, textAlign: 'right', borderLeft: '2px solid #dbe6fd' }}>
                    <b>{r.users.used}</b>
                    <span style={{ color: '#9c9c9c' }}> / {r.users.total}</span>
                  </td>
                  <td style={td}><Rate pct={r.users.rate_pct} /></td>
                  <td style={{ ...td, textAlign: 'center' }}><Count n={r.users.active} tone={TONE.active} /></td>
                  <td style={{ ...td, textAlign: 'center' }}><Count n={r.users.regular} tone={TONE.regular} /></td>
                  <td style={{ ...td, textAlign: 'center' }}><Count n={r.users.dormant} tone={TONE.dormant} /></td>

                  <td style={{ ...td, textAlign: 'right', borderLeft: '2px solid #dbe6fd' }}>
                    <b>{r.frontlines.used}</b>
                    <span style={{ color: '#9c9c9c' }}> / {r.frontlines.total}</span>
                  </td>
                  <td style={td}><Rate pct={r.frontlines.rate_pct} /></td>
                  <td style={{ ...td, textAlign: 'center' }}><Count n={r.frontlines.active} tone={TONE.active} /></td>
                  <td style={{ ...td, textAlign: 'center' }}><Count n={r.frontlines.regular} tone={TONE.regular} /></td>
                  <td style={{ ...td, textAlign: 'center' }}><Count n={r.frontlines.dormant} tone={TONE.dormant} /></td>

                  <td style={{ ...td, textAlign: 'center', borderLeft: '2px solid #dbe6fd' }}>
                    <Sla sla={r.sla} target={r.sla_target_wd} />
                  </td>
                  <td style={{ ...td, textAlign: 'center', fontWeight: 700, fontSize: 12, color: '#141414' }}
                      title={r.sla?.median_calendar_days == null ? undefined
                        : `${r.sla.median_calendar_days} calendar days`}>
                    {r.sla?.median_working_days == null ? '—' : `${r.sla.median_working_days}d`}
                  </td>
                  {/* A ticket that blew its target three months ago and is
                      still open is the worst case the SLA has, so it is counted
                      here rather than waiting for a close date to appear. */}
                  <td style={{ ...td, textAlign: 'center', fontWeight: 700, fontSize: 12,
                               color: r.sla?.open_breached ? '#c0305a' : '#b9b1a3' }}
                      title={`${r.sla?.open_breached ?? 0} of ${r.sla?.open_total ?? 0} tickets `
                             + 'still open at the end of the period have passed their target'}>
                    {r.sla?.open_breached || '—'}
                  </td>

                  {/* The list is a thing to go and work through, so it opens
                      as a dialog rather than unfolding the page under it. */}
                  <td style={{ ...td, textAlign: 'center' }}>
                    <button
                      onClick={() => setOpen(r.service)}
                      disabled={!never}
                      style={{
                        background: never ? '#1450f5' : '#f3eee6',
                        color: never ? '#fff' : '#b9b1a3',
                        border: 'none', borderRadius: 6, padding: '5px 12px',
                        fontSize: 12, fontWeight: 700, fontFamily: INTER,
                        cursor: never ? 'pointer' : 'default', whiteSpace: 'nowrap',
                      }}
                    >
                      {never ? `${r.users.not_used.length} users · ${r.frontlines.not_used.length} FLs` : 'None'}
                    </button>
                  </td>
                </tr>

                {isOpen && kids.map(k => (
                  <tr key={k.service} style={{ background: '#f5f8fe' }}>
                    <td style={{ ...td, paddingLeft: 34, color: '#6e6e6e', whiteSpace: 'nowrap' }}>
                      {k.service}
                      <span style={{ color: '#9c9c9c', marginLeft: 8, fontSize: 11 }}>
                        {k.requests} requests · target {k.sla_target_wd ?? '—'} working days
                      </span>
                    </td>
                    <td colSpan={10} style={{ ...td, color: '#b9b1a3', fontSize: 11 }}>
                      Reach is measured on the roll-up above
                    </td>
                    <td style={{ ...td, textAlign: 'center', borderLeft: '2px solid #dbe6fd' }}>
                      <Sla sla={k.sla} target={k.sla_target_wd} />
                    </td>
                    <td style={{ ...td, textAlign: 'center', fontWeight: 700, fontSize: 12, color: '#141414' }}
                        title={k.sla?.median_calendar_days == null ? undefined
                          : `${k.sla.median_calendar_days} calendar days`}>
                      {k.sla?.median_working_days == null ? '—' : `${k.sla.median_working_days}d`}
                    </td>
                    <td style={{ ...td, textAlign: 'center', fontWeight: 700, fontSize: 12,
                                 color: k.sla?.open_breached ? '#c0305a' : '#b9b1a3' }}>
                      {k.sla?.open_breached || '—'}
                    </td>
                    <td style={td} />
                  </tr>
                ))}
              </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      <p style={{ fontSize: 11, color: '#9c9c9c', margin: '12px 0 0', lineHeight: 1.7, fontFamily: INTER }}>
        The denominator is everyone in the current filter, not the people who already use the
        service, so the rate measures reach rather than busyness.{ignoresServiceFilter && (
          <> <b>The Service filter is ignored here</b> — narrowing to one service would leave only
          its own users in the denominator and every rate would read 100%. Every other filter still
          applies.</>
        )} Active, Regular and Dormant are
        measured on the last request <b>for that service</b> — someone raising weekly content
        requests is not an active user of Graphic Design because they tried it once a year ago —
        and the three add up to the users, or frontlines, that have used it. The SLA columns are in
        working days with weekends and public holidays excluded, and judge every ticket against the
        target <b>currently</b> set in Rates &amp; SLA: the panel keeps no history, so a target
        changed last week is applied to work done last year. Under five closed tickets a service
        shows the raw count rather than a percentage.
      </p>

      {current && (
        <ListModal
          title={`Never used ${current.short}`}
          subtitle={`${current.users.not_used.length} of ${current.users.total} users and `
                    + `${current.frontlines.not_used.length} of ${current.frontlines.total} frontlines `
                    + `have never raised a ${current.service} request`}
          onClose={() => setOpen(null)}
          rows={modalRows}
          columns={[
            { key: 'name', label: 'Name' },
            { key: 'kind', label: 'Type' },
            { key: 'where', label: 'Where' },
            { key: 'requests', label: 'Requests elsewhere', align: 'right' },
          ]}
        />
      )}
    </Card>
  )
}
