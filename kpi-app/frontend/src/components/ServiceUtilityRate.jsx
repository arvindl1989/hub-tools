import { useMemo, useState } from 'react'
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

const th = {
  textAlign: 'left', padding: '8px 12px', fontSize: 11, fontWeight: 600,
  color: '#6e6e6e', borderBottom: '2px solid #e8e2d6', background: '#faf8f3',
  whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.04em',
}
const td = { padding: '10px 12px', borderBottom: '1px solid #f3eee6', fontSize: 13 }

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

export default function ServiceUtilityRate({ rows = [], ignoresServiceFilter = false }) {
  const [open, setOpen] = useState(null)   // the service whose non-users are shown

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
              <th style={{ ...th, textAlign: 'center' }}>Never used</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const never = r.users.not_used.length + r.frontlines.not_used.length
              return (
                <tr key={r.service} style={{ background: i % 2 ? '#faf8f3' : '#fff' }}>
                  <td style={{ ...td, fontWeight: 600, color: '#141414', whiteSpace: 'nowrap' }}>
                    <span style={{
                      fontWeight: 700, color: '#1450f5', background: '#eef3fe',
                      borderRadius: 5, padding: '2px 7px', fontSize: 11, marginRight: 8,
                    }}>{r.short}</span>
                    {r.service}
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
        and the three add up to the users, or frontlines, that have used it.
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
