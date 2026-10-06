import { useState } from 'react'
import { INTER, Card } from './KoneUI'

// ── Cell states ───────────────────────────────────────────────────────────────
// Two blues for a service a frontline is still using, pink for one it has
// stopped, sand for one it never started. Depth carries how much, which is what
// makes it readable as a map; hue changes only where the meaning changes.
const STATE = {
  top:     { label: 'Top users', bg: '#1450f5', fg: '#ffffff', border: '#1450f5' },
  regular: { label: 'Regular',   bg: '#c3d4fd', fg: '#143a9c', border: '#a1b9fb' },
  dormant: { label: 'Dormant',   bg: '#ffcdd7', fg: '#8c1a2e', border: '#f28ba0' },
  none:    { label: 'Not used',  bg: '#f7f4ee', fg: '#c4bdb0', border: '#ece6db' },
}
const ORDER = ['top', 'regular', 'dormant', 'none']

const fmtDate = (s) => {
  if (!s) return '—'
  const iso = String(s).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '—'
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
}

const headCell = {
  padding: '6px 8px', fontSize: 10, fontWeight: 600, color: '#6e6e6e',
  letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap',
  borderBottom: '1px solid #e8e2d6', background: '#faf8f3',
}
const th = {
  textAlign: 'left', padding: '9px 14px', fontSize: 11, fontWeight: 600,
  color: '#6e6e6e', borderBottom: '2px solid #e8e2d6', background: '#faf8f3',
  whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.04em',
}
const td = { padding: '9px 14px', borderBottom: '1px solid #f3eee6', fontSize: 13 }

function Legend() {
  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
      {ORDER.map(k => (
        <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#6e6e6e', fontFamily: INTER }}>
          <span style={{
            width: 14, height: 14, borderRadius: 3,
            background: STATE[k].bg, border: `1px solid ${STATE[k].border}`,
          }} />
          {STATE[k].label}
        </span>
      ))}
    </div>
  )
}

export default function ServiceAdoptionHeatmap({ data }) {
  const [showTable, setShowTable] = useState(true)
  const services = data?.services ?? []
  const areas = data?.areas ?? []
  const grid = data?.grid ?? {}
  const totals = data?.totals ?? []
  const rows = data?.rows ?? []

  if (!services.length || !areas.length) {
    return (
      <Card title="Service Adoption by Frontline">
        <div style={{ padding: 30, textAlign: 'center', color: '#9c9c9c', fontSize: 13 }}>
          No frontline requests in this selection.
        </div>
      </Card>
    )
  }

  const flatFrontlines = areas.flatMap(a => a.frontlines)
  const totalFor = (service) => totals.find(t => t.service === service) || {}

  return (
    <Card
      title="Service Adoption by Frontline"
      subtitle="Which frontline uses which service, and which has stopped"
      controls={
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <Legend />
          <button
            onClick={() => setShowTable(t => !t)}
            style={{
              border: '1px solid #e8e2d6', background: '#fff', color: '#6e6e6e',
              borderRadius: 8, padding: '6px 12px', fontSize: 12, cursor: 'pointer',
              fontFamily: INTER,
            }}
          >
            {showTable ? 'Hide table' : 'Show table'}
          </button>
        </div>
      }
    >
      {/* ── The map ───────────────────────────────────────────────────────── */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 0, fontSize: 11 }}>
          <thead>
            <tr>
              <th style={{ ...headCell, position: 'sticky', left: 0, zIndex: 2, minWidth: 150, textAlign: 'left' }} />
              {ORDER.map(k => (
                <th key={k} style={{ ...headCell, textAlign: 'center', minWidth: 54 }}>
                  <span style={{
                    display: 'inline-block', padding: '1px 6px', borderRadius: 4,
                    background: STATE[k].bg, color: STATE[k].fg,
                    border: `1px solid ${STATE[k].border}`,
                  }}>{STATE[k].label}</span>
                </th>
              ))}
              <th style={{ ...headCell, width: 14, background: '#fff', borderBottom: 'none' }} />
              {areas.map(a => (
                <th key={a.area} colSpan={a.frontlines.length}
                    style={{ ...headCell, textAlign: 'center', color: '#141414', fontWeight: 700 }}>
                  {a.area}
                </th>
              ))}
            </tr>
            <tr>
              <th style={{ ...headCell, position: 'sticky', left: 0, zIndex: 2, textAlign: 'left' }}>Service</th>
              {ORDER.map(k => <th key={k} style={{ ...headCell, textAlign: 'center' }} />)}
              <th style={{ ...headCell, background: '#fff', borderBottom: 'none' }} />
              {flatFrontlines.map(fl => (
                <th key={fl} style={{ ...headCell, textAlign: 'center', minWidth: 56 }}>{fl}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {services.map(s => {
              const t = totalFor(s.name)
              return (
                <tr key={s.name}>
                  <td style={{
                    ...headCell, position: 'sticky', left: 0, zIndex: 1, textAlign: 'left',
                    color: '#141414', fontWeight: 700, textTransform: 'none', fontSize: 12,
                    background: '#fff', borderBottom: '1px solid #f3eee6',
                  }} title={s.name}>
                    {s.short}
                  </td>
                  {ORDER.map(k => (
                    <td key={k} style={{
                      padding: '6px 8px', textAlign: 'center', fontWeight: 700, fontSize: 12,
                      color: t[k] ? '#141414' : '#d8d8d8', borderBottom: '1px solid #f3eee6',
                    }}>
                      {t[k] ?? 0}
                    </td>
                  ))}
                  <td style={{ borderBottom: 'none' }} />
                  {flatFrontlines.map(fl => {
                    const cell = grid[`${s.name}||${fl}`] || { state: 'none', requests: 0 }
                    const tone = STATE[cell.state]
                    return (
                      <td key={fl}
                          title={`${s.short} · ${fl} — ${tone.label}` +
                                 (cell.requests
                                   ? `: ${cell.requests} request${cell.requests === 1 ? '' : 's'} from ${cell.users} user${cell.users === 1 ? '' : 's'}, last ${cell.days_since_last}d ago`
                                   : ': no requests')}
                          style={{
                            padding: '7px 6px', textAlign: 'center', minWidth: 56,
                            background: tone.bg, color: tone.fg,
                            borderBottom: '1px solid #fff', borderRight: '1px solid #fff',
                            fontWeight: cell.requests ? 700 : 400, fontSize: 12,
                          }}>
                        {cell.requests || '·'}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p style={{ fontSize: 11, color: '#9c9c9c', margin: '12px 0 0', lineHeight: 1.7, fontFamily: INTER }}>
        A cell is one frontline's use of one service, and the number in it is the requests they
        raised. <b>Not used</b> means they never have; <b>Dormant</b> means their last request was
        over 90 days before the end of the range; <b>Top users</b> are the busiest quarter of the
        frontlines still using it, and the rest are <b>Regular</b>. The four columns on the left
        count the frontlines in each state for that service.
      </p>

      {/* ── The same thing as a table ─────────────────────────────────────── */}
      {showTable && (
        <div style={{ marginTop: 20, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Frontline</th>
                <th style={th}>Area</th>
                <th style={{ ...th, textAlign: 'right' }}>Users</th>
                <th style={{ ...th, textAlign: 'right' }}>Requests</th>
                <th style={th}>Last Request</th>
                <th style={{ ...th, textAlign: 'right' }}>Days Since</th>
                <th style={{ ...th, textAlign: 'center' }}>Services Used</th>
                {services.map(s => (
                  <th key={s.name} style={{ ...th, textAlign: 'center' }} title={s.name}>{s.short}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.frontline} style={{ background: i % 2 ? '#faf8f3' : '#fff' }}>
                  <td style={{ ...td, fontWeight: 600, color: '#141414' }}>{r.frontline}</td>
                  <td style={{ ...td, color: '#404040' }}>{r.area}</td>
                  <td style={{ ...td, textAlign: 'right', color: '#404040' }}>{r.users}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: '#1450f5' }}>{r.requests}</td>
                  <td style={{ ...td, color: '#404040', whiteSpace: 'nowrap' }}>{fmtDate(r.last_request_date)}</td>
                  <td style={{
                    ...td, textAlign: 'right', fontWeight: 700,
                    color: r.days_since_last > 90 ? '#c0305a' : r.days_since_last > 30 ? '#b87d00' : '#1e8a5e',
                  }}>{r.days_since_last}d</td>
                  <td style={{ ...td, textAlign: 'center', color: '#404040' }}>
                    {r.services_used} of {r.services_offered}
                    <span style={{ color: '#9c9c9c', marginLeft: 6 }}>
                      {r.adoption_pct == null ? '' : `(${r.adoption_pct}%)`}
                    </span>
                  </td>
                  {services.map(s => {
                    const n = r.service_breakdown?.[s.name] ?? 0
                    const tone = STATE[r.service_states?.[s.name] || 'none']
                    return (
                      <td key={s.name} style={{ ...td, textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-block', minWidth: 28, borderRadius: 5, padding: '2px 7px',
                          background: tone.bg, color: tone.fg, border: `1px solid ${tone.border}`,
                          fontWeight: n ? 700 : 400, fontSize: 12,
                        }}>{n || '·'}</span>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
