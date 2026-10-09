import { useEffect, useMemo, useState } from 'react'
import { INTER, cardHeadingStyle, Card } from './KoneUI'

// ── Cell shade ────────────────────────────────────────────────────────────────
// One colour, five strengths, all of them blue — the palest for a service a
// frontline has never asked for, so the map reads as one field rather than
// being broken up by a colour that means something else.
//
// A cell's shade is its band: which quarter of the used cells it falls in,
// worked out on the data by the API. Shading by share of the busiest cell
// instead left four fifths of the ramp unused, because one heavy frontline
// flattens everyone else; banding by rank puts about a quarter of the cells in
// each shade, which is what makes the gradient worth having.
const BAND = [
  { bg: '#d0dcfd', fg: '#5b6b8c', label: 'Not used' },     // 0 — never asked
  { bg: '#a1b9fb', fg: '#141414', label: 'Quietest quarter' },
  { bg: '#7296f9', fg: '#141414', label: 'Lower middle' },
  { bg: '#4373f7', fg: '#ffffff', label: 'Upper middle' },
  { bg: '#1450f5', fg: '#ffffff', label: 'Busiest quarter' },
]

const shade = (band) => BAND[band ?? 0] || BAND[0]

// Kept for the tooltip and the counts beside each row: the map no longer
// colours by state, but whether a frontline has stopped is still worth saying.
const STATE_LABEL = {
  top: 'Top users', regular: 'Regular', dormant: 'Dormant', none: 'Not used',
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

// The scale as one continuous strip, lightest to darkest, with what each step
// holds in requests — the thresholds are worked out on the data, so leaving the
// reader to infer them from the colour would be asking them to guess.
function Legend({ bands = [] }) {
  const range = (b) => {
    const meta = bands.find(x => x.band === b)
    if (!meta || !meta.cells) return BAND[b].label
    return meta.min === meta.max
      ? `${BAND[b].label}: ${meta.min} requests`
      : `${BAND[b].label}: ${meta.min}–${meta.max} requests`
  }
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
      <span style={{ fontSize: 10, color: '#9c9c9c', fontFamily: INTER }}>Not used</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', borderRadius: 3, overflow: 'hidden' }}>
        {BAND.map((step, b) => (
          <span key={b} title={b === 0 ? 'Never asked for this service' : range(b)} style={{
            width: 26, height: 14, background: step.bg,
            border: '1px solid #e8e2d6',
            borderLeftWidth: b === 0 ? 1 : 0,
          }} />
        ))}
      </span>
      <span style={{ fontSize: 10, color: '#9c9c9c', fontFamily: INTER }}>quietest → busiest</span>
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

  const tone = shade(cell.band)
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
              background: tone.bg, color: tone.fg, border: '1px solid #e8e2d6',
            }}>{STATE_LABEL[cell.state]}</span>
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

function SortArrow({ dir }) {
  if (!dir) return <span style={{ color: '#d8d8d8', fontSize: 10, marginLeft: 2 }}>↕</span>
  return <span style={{ color: '#1450f5', fontSize: 10, marginLeft: 2 }}>{dir === 'asc' ? '↑' : '↓'}</span>
}

export default function ServiceAdoptionHeatmap({ data }) {
  const [showTable, setShowTable] = useState(true)
  const [openCell, setOpenCell] = useState(null)
  // The table opens on the order the API sends — widest adoption first — and
  // sorts from there. Null is always last whichever way the column is pointed,
  // because a frontline with no date is not the oldest or the newest one.
  const [sort, setSort] = useState({ key: null, dir: 'desc' })

  const toggleSort = (key) => setSort(s => (
    s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }
  ))

  const services = data?.services ?? []
  const areas = data?.areas ?? []
  const grid = data?.grid ?? {}
  const totals = data?.totals ?? []
  const rows = data?.rows ?? []

  const sortedRows = useMemo(() => {
    if (!sort.key) return rows
    const value = (r) => (sort.key.startsWith('svc:')
      ? (r.service_breakdown?.[sort.key.slice(4)] ?? 0)
      : r[sort.key])
    const sign = sort.dir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const av = value(a), bv = value(b)
      if (av == null && bv == null) return 0
      if (av == null) return 1          // missing sinks, either direction
      if (bv == null) return -1
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * sign
      return String(av).localeCompare(String(bv)) * sign
    })
  }, [rows, sort])

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
          <Legend bands={data?.bands ?? []} />
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
                  <span style={{ fontSize: 9, color: '#6e6e6e' }}>{STATE_LABEL[k]}</span>
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
                    const tone = shade(cell.band)
                    const open = () => cell.requests && setOpenCell({
                      ...cell, frontline: fl, service: s.name, serviceShort: s.short,
                    })
                    return (
                      <td key={fl}
                          onClick={open}
                          title={`${s.short} · ${fl} — ${STATE_LABEL[cell.state]}` +
                                 (cell.requests
                                   ? `: ${cell.requests} request${cell.requests === 1 ? '' : 's'} from ${cell.users} user${cell.users === 1 ? '' : 's'}, ${cell.share_pct}% of the busiest cell, last ${cell.days_since_last}d ago. Click to see who.`
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
        raised — <b>click a number to see which users</b>. The shade is which quarter of the used
        cells it falls in, so each of the four blues carries about a quarter of them and the
        darkest is the busiest quarter of the map; the palest blue is a service that frontline has
        never asked for. The four columns on the left count the frontlines in each state for that
        service — <b>Dormant</b> is a last request over 90 days before the end of the range, and
        <b> Top users</b> are the busiest quarter of the frontlines still using it. Shade says how
        much; the state is on the cell's tooltip.
      </p>

      {/* ── The same thing as a table ─────────────────────────────────────── */}
      {showTable && (
        <div style={{ marginTop: 20, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {[['frontline', 'Frontline', 'left'],
                  ['area', 'Area', 'left'],
                  ['users', 'Users', 'right'],
                  ['requests', 'Requests', 'right'],
                  ['last_request_date', 'Last Request', 'left'],
                  ['days_since_last', 'Days Since', 'right'],
                  ['services_used', 'Services Used', 'center']].map(([key, label, align]) => (
                  <th key={key} onClick={() => toggleSort(key)}
                      style={{ ...th, textAlign: align, cursor: 'pointer', userSelect: 'none' }}>
                    {label} <SortArrow dir={sort.key === key ? sort.dir : null} />
                  </th>
                ))}
                {services.map(s => (
                  <th key={s.name} onClick={() => toggleSort(`svc:${s.name}`)}
                      style={{ ...th, textAlign: 'center', cursor: 'pointer', userSelect: 'none' }}
                      title={`${s.name} — click to sort`}>
                    {s.short} <SortArrow dir={sort.key === `svc:${s.name}` ? sort.dir : null} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((r, i) => (
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
                    const tone = shade(r.service_bands?.[s.name])
                    const cell = grid[`${s.name}||${r.frontline}`]
                    return (
                      <td key={s.name} style={{ ...td, textAlign: 'center' }}>
                        <span
                          onClick={() => n && cell && setOpenCell({
                            ...cell, frontline: r.frontline, service: s.name, serviceShort: s.short,
                          })}
                          title={n ? `${STATE_LABEL[state]} — ${r.service_shares?.[s.name] ?? 0}% of the busiest cell. Click to see who.`
                                   : STATE_LABEL[state]}
                          style={{
                            display: 'inline-block', minWidth: 28, borderRadius: 5, padding: '2px 7px',
                            background: tone.bg, color: tone.fg, border: '1px solid #e8e2d6',
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
