import { useEffect, useState } from 'react'
import { INTER, cardHeadingStyle, Card } from './KoneUI'

// ── Cell states ───────────────────────────────────────────────────────────────
// KONE blue for the frontlines carrying a service, green for the ones using it
// steadily, pink for the ones that have stopped, sand for the ones that never
// started. Four colours for four readings, so the map is legible without
// counting: the sand is where the offer has not landed at all.
const STATE = {
  top:     { label: 'Top users', bg: '#1450f5', fg: '#ffffff', border: '#1450f5' },
  regular: { label: 'Regular',   bg: '#aae1c8', fg: '#0f5137', border: '#8ed3b4' },
  dormant: { label: 'Dormant',   bg: '#ffcdd7', fg: '#8c1a2e', border: '#f6b4c2' },
  none:    { label: 'Not used',  bg: '#f3eee6', fg: '#b9b1a3', border: '#e8e2d6' },
}
const ORDER = ['top', 'regular', 'dormant', 'none']

// Every cell is the same box whatever is in it, so a row reads as a row rather
// than as a ragged line that happens to carry numbers. The four count columns
// on the left are their own, wider size: they carry a word, not a number.
//
// A grid cell has no fixed width: the frontline columns are the only unsized
// ones, so a fixed table layout divides what is left of the card between them
// equally. That keeps every box the same as every other while the map reaches
// the edge of the card instead of stopping short of it. CELL_W survives as the
// floor — past about twenty frontlines the table outgrows the card and the
// strip scrolls sideways rather than squeezing the numbers out of their boxes.
const CELL_W = 56
const TALLY_W = 72
const LABEL_W = 150
const GAP_W = 14

// Long frontline names blow the column width out on their own. The map needs a
// label that fits a box; the full name stays on the cell's tooltip and in the
// table underneath, where there is room for it.
const FL_SHORT = { 'Customer Marketing': 'CM' }

function shortFrontline(name) {
  if (FL_SHORT[name]) return FL_SHORT[name]
  if (name.length <= 8) return name
  const words = name.split(/[\s\-/&]+/).filter(Boolean)
  if (words.length > 1) return words.map(w => w[0]).join('').toUpperCase().slice(0, 4)
  return `${name.slice(0, 7)}…`
}

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
const fixed = { boxSizing: 'border-box', overflow: 'hidden' }
const tally = { width: TALLY_W, minWidth: TALLY_W, maxWidth: TALLY_W, boxSizing: 'border-box' }
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

// ── Who is behind a cell ──────────────────────────────────────────────────────
function CellUsers({ cell, onClose }) {
  // Escape closes it, because a dialog that can only be dismissed by hitting a
  // small target is a dialog people learn to avoid opening.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const tone = STATE[cell.state]
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(20,20,20,0.45)', zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 12, width: 'min(560px, 100%)',
          maxHeight: '80vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 12px 40px rgba(20,20,20,0.25)', overflow: 'hidden',
        }}
      >
        <div style={{ padding: '18px 22px', borderBottom: '1px solid #e8e2d6' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={cardHeadingStyle('#141414')}>{cell.frontline} · {cell.serviceShort}</div>
              <div style={{ fontSize: 12, color: '#6e6e6e', marginTop: 6, fontFamily: INTER }}>
                {cell.service}
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              style={{
                border: 'none', background: 'none', cursor: 'pointer', color: '#9c9c9c',
                fontSize: 22, lineHeight: 1, padding: 0,
              }}
            >×</button>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12, alignItems: 'center' }}>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
              background: tone.bg, color: tone.fg, border: `1px solid ${tone.border}`,
            }}>{tone.label}</span>
            <span style={{ fontSize: 12, color: '#6e6e6e', fontFamily: INTER }}>
              {cell.requests} request{cell.requests === 1 ? '' : 's'} from {cell.users} user
              {cell.users === 1 ? '' : 's'} · last {cell.days_since_last}d ago
            </span>
          </div>
        </div>

        <div style={{ overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...th, position: 'sticky', top: 0, zIndex: 1 }}>User</th>
                <th style={{ ...th, position: 'sticky', top: 0, zIndex: 1, textAlign: 'right' }}>Requests</th>
                <th style={{ ...th, position: 'sticky', top: 0, zIndex: 1, textAlign: 'right' }}>Last Raised</th>
              </tr>
            </thead>
            <tbody>
              {(cell.user_list ?? []).map((u, i) => (
                <tr key={u.user} style={{ background: i % 2 ? '#faf8f3' : '#fff' }}>
                  <td style={{ ...td, fontWeight: 600, color: '#141414' }}>{u.user}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: '#1450f5' }}>{u.count}</td>
                  <td style={{
                    ...td, textAlign: 'right', fontWeight: 600,
                    color: u.days_since_last > 90 ? '#c0305a' : u.days_since_last > 30 ? '#b87d00' : '#1e8a5e',
                  }}>{u.days_since_last}d ago</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default function ServiceAdoptionHeatmap({ data }) {
  const [showTable, setShowTable] = useState(true)
  const [openCell, setOpenCell] = useState(null)

  const services = data?.services ?? []
  const areas = data?.areas ?? []
  const grid = data?.grid ?? {}
  const totals = data?.totals ?? []
  const rows = data?.rows ?? []

  // A cell kept open while the filters change would be showing users who are no
  // longer in scope, so it closes with the data it came from.
  useEffect(() => { setOpenCell(null) }, [data])

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
        <table style={{
          borderCollapse: 'separate', borderSpacing: 0, fontSize: 11, tableLayout: 'fixed',
          width: '100%',
          minWidth: LABEL_W + ORDER.length * TALLY_W + GAP_W + flatFrontlines.length * CELL_W,
        }}>
          <colgroup>
            <col style={{ width: LABEL_W }} />
            {ORDER.map(k => <col key={k} style={{ width: TALLY_W }} />)}
            <col style={{ width: GAP_W }} />
            {flatFrontlines.map(fl => <col key={fl} />)}
          </colgroup>
          <thead>
            <tr>
              <th style={{ ...headCell, position: 'sticky', left: 0, zIndex: 2, textAlign: 'left' }} />
              {ORDER.map(k => (
                <th key={k} style={{ ...headCell, ...tally, textAlign: 'center', padding: '6px 2px' }}>
                  <span style={{
                    display: 'inline-block', padding: '1px 5px', borderRadius: 4, fontSize: 9,
                    background: STATE[k].bg, color: STATE[k].fg,
                    border: `1px solid ${STATE[k].border}`,
                  }}>{STATE[k].label}</span>
                </th>
              ))}
              <th style={{ ...headCell, background: '#fff', borderBottom: 'none' }} />
              {areas.map(a => (
                <th key={a.area} colSpan={a.frontlines.length}
                    style={{ ...headCell, textAlign: 'center', color: '#141414', fontWeight: 700 }}>
                  {a.area}
                </th>
              ))}
            </tr>
            <tr>
              <th style={{ ...headCell, position: 'sticky', left: 0, zIndex: 2, textAlign: 'left' }}>Service</th>
              {ORDER.map(k => <th key={k} style={{ ...headCell, ...tally }} />)}
              <th style={{ ...headCell, background: '#fff', borderBottom: 'none' }} />
              {flatFrontlines.map(fl => (
                <th key={fl} title={fl}
                    style={{ ...headCell, ...fixed, textAlign: 'center', padding: '6px 2px',
                             fontSize: 9, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {shortFrontline(fl)}
                </th>
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
                      ...tally, padding: '6px 2px', textAlign: 'center', fontWeight: 700, fontSize: 12,
                      color: t[k] ? '#141414' : '#d8d8d8', borderBottom: '1px solid #f3eee6',
                    }}>
                      {t[k] ?? 0}
                    </td>
                  ))}
                  <td style={{ borderBottom: 'none' }} />
                  {flatFrontlines.map(fl => {
                    const cell = grid[`${s.name}||${fl}`] || { state: 'none', requests: 0, users: 0 }
                    const tone = STATE[cell.state]
                    const open = () => cell.requests && setOpenCell({
                      ...cell, frontline: fl, service: s.name, serviceShort: s.short,
                    })
                    return (
                      <td key={fl}
                          onClick={open}
                          title={`${s.short} · ${fl} — ${tone.label}` +
                                 (cell.requests
                                   ? `: ${cell.requests} request${cell.requests === 1 ? '' : 's'} from ${cell.users} user${cell.users === 1 ? '' : 's'}, last ${cell.days_since_last}d ago. Click to see who.`
                                   : ': no requests')}
                          style={{
                            ...fixed, padding: '7px 2px', textAlign: 'center',
                            background: tone.bg, color: tone.fg,
                            borderBottom: '1px solid #fff', borderRight: '1px solid #fff',
                            fontWeight: cell.requests ? 700 : 400, fontSize: 12,
                            cursor: cell.requests ? 'pointer' : 'default',
                            overflow: 'hidden',
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
        raised — <b>click a number to see which users</b>. <b>Not used</b> means they never have;
        <b> Dormant</b> means their last request was over 90 days before the end of the range;
        <b> Top users</b> are the busiest quarter of the frontlines still using it, and the rest are
        <b> Regular</b>. The four columns on the left count the frontlines in each state for that
        service.
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
                    const state = r.service_states?.[s.name] || 'none'
                    const tone = STATE[state]
                    const cell = grid[`${s.name}||${r.frontline}`]
                    return (
                      <td key={s.name} style={{ ...td, textAlign: 'center' }}>
                        <span
                          onClick={() => n && cell && setOpenCell({
                            ...cell, frontline: r.frontline, service: s.name, serviceShort: s.short,
                          })}
                          title={n ? `${tone.label} — click to see who` : tone.label}
                          style={{
                            display: 'inline-block', minWidth: 28, borderRadius: 5, padding: '2px 7px',
                            background: tone.bg, color: tone.fg, border: `1px solid ${tone.border}`,
                            fontWeight: n ? 700 : 400, fontSize: 12,
                            cursor: n ? 'pointer' : 'default',
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

      {openCell && <CellUsers cell={openCell} onClose={() => setOpenCell(null)} />}
    </Card>
  )
}
