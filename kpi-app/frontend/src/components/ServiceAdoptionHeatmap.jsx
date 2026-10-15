import { useEffect, useMemo, useState } from 'react'
import { INTER, cardHeadingStyle, Card } from './KoneUI'

// ── Cell shade ────────────────────────────────────────────────────────────────
// One colour, six strengths, all of them blue — the palest for a service a
// frontline has never asked for, so the map reads as one field rather than
// being broken up by a colour that means something else.
//
// The five levels divide the distinct volumes on the map into five, worked out
// across the whole map rather than within a service row: a number means the
// same shade wherever it appears and bigger is always darker. Banding by the
// range instead left most cells in the palest step, because one frontline on
// several hundred flattens a map whose other cells are single digits.
//
// Text is white throughout, as asked. On the two palest steps white is thin
// against the background, so those carry a soft shadow to hold the number
// legible rather than being left to disappear.
const BAND = [
  { bg: '#e9effe', label: 'Not used', faint: true },
  { bg: '#d0dcfd', label: 'Lowest',   faint: true },
  { bg: '#a1b9fb', label: 'Low',      faint: true },
  { bg: '#7296f9', label: 'Medium' },
  { bg: '#4373f7', label: 'High' },
  { bg: '#1450f5', label: 'Highest' },
]
const INK = '#ffffff'
// Enough of a shadow to separate white from a pale blue, invisible on the dark
// steps where it is not needed.
const FAINT_SHADOW = '0 0 1px rgba(10,40,110,1), 0 0 3px rgba(10,40,110,0.85), 0 1px 2px rgba(10,40,110,0.7)'

const shade = (band) => BAND[band ?? 0] || BAND[0]

// Kept for the tooltip and the counts beside each row: the map no longer
// colours by state, but whether a frontline has stopped is still worth saying.
const STATE_LABEL = {
  top: 'Top users',
  // Not "Regular": that word means a 31-90 day lifecycle bucket on the cards
  // above, and the same label for two different ideas on one page is a trap.
  regular: 'Active (below top quartile)',
  dormant: 'Dormant',
  none: 'Not used',
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
const LABEL_W = 230
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
function Legend({ bands = [], effort = false, hourLabels = [] }) {
  const range = (b) => {
    if (effort) return `${BAND[b].label}: ${hourLabels[b - 1] ?? ''} estimated hours`
    const meta = bands.find(x => x.band === b)
    if (!meta) return BAND[b].label
    const span = meta.from === meta.to ? `${meta.from}` : `${meta.from}–${meta.to}`
    return `${BAND[b].label}: ${span} requests · ${meta.cells} cell${meta.cells === 1 ? '' : 's'}`
  }
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
      {BAND.map((step, b) => (
        <span key={b} title={b === 0 ? 'Never asked for this service' : range(b)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{
            width: 18, height: 14, background: step.bg, borderRadius: 3,
            border: '1px solid #e8e2d6',
          }} />
          <span style={{ fontSize: 10, color: '#6e6e6e', fontFamily: INTER }}>{step.label}</span>
        </span>
      ))}
    </div>
  )
}

// ── Who is behind a cell ──────────────────────────────────────────────────────
// The band is passed in rather than worked out here: which band a cell is in
// depends on the mode and the effort toggle, and both of those live in the
// component below. Reaching for them from here was a ReferenceError that took
// the whole page down the moment the dialog opened.
function CellUsers({ cell, band = 0, onClose }) {
  // Escape closes it, because a dialog that can only be dismissed by hitting a
  // small target is a dialog people learn to avoid opening.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const tone = shade(band)
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
              background: tone.bg, color: '#141414', border: '1px solid #e8e2d6',
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

export default function ServiceAdoptionHeatmap({ data, effort = false }) {
  // Totals answer "where is the volume"; per user answers "who leans on this".
  // A big frontline raising a lot and a small one depending on a service look
  // the same in the first view and quite different in the second.
  const [mode, setMode] = useState('total')
  const bandOf = (cell) => (effort
    ? (mode === 'total' ? cell?.band_hours : cell?.band_hours_per_user)
    : (mode === 'total' ? cell?.band : cell?.band_per_user)) ?? 0
  const valueOf = (cell) => {
    const v = effort
      ? (mode === 'total' ? cell?.est_hours : cell?.est_hours_per_user)
      : (mode === 'total' ? cell?.requests : cell?.requests_per_user)
    return v ? (effort ? Math.round(v).toLocaleString() : v) : 0
  }
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
          <Legend bands={data?.bands ?? []} effort={effort}
                  hourLabels={data?.hour_band_labels ?? []} />
          <div style={{ display: 'inline-flex', border: '1px solid #e8e2d6', borderRadius: 8, overflow: 'hidden' }}>
            {[['total', effort ? 'Est. hours' : 'Requests'], ['per_user', 'Per user']].map(([id, label]) => (
              <button key={id} onClick={() => setMode(id)}
                style={{
                  border: 'none', cursor: 'pointer', padding: '5px 11px', fontSize: 11,
                  fontFamily: INTER, fontWeight: mode === id ? 700 : 500,
                  background: mode === id ? '#1450f5' : '#fff',
                  color: mode === id ? '#fff' : '#6e6e6e',
                }}>{label}</button>
            ))}
          </div>
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
                    whiteSpace: 'normal', lineHeight: 1.35,
                  }} title={s.name}>
                    {s.name}
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
                    const tone = shade(bandOf(cell))
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
                            background: tone.bg, color: INK,
                            textShadow: tone.faint ? FAINT_SHADOW : undefined,
                            borderBottom: '1px solid #fff', borderRight: '1px solid #fff',
                            fontWeight: 700, fontSize: 12,
                            cursor: cell.requests ? 'pointer' : 'default',
                            overflow: 'hidden',
                          }}>
                        {valueOf(cell) || '·'}
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
        raised — <b>click a number to see which users</b>. The five shades divide the distinct
        volumes on the map into five, so each shade covers a band of request counts: the legend
        says which. The cut is across the whole map rather than within a service, so the same
        number is the same shade wherever it appears, and bigger is always darker. More cells will
        land in the palest shade than in the darkest, because most frontlines raise single digits
        and a few raise hundreds — that is the distribution, not the scale. The palest of all is a
        service that frontline has never asked for. The four columns on the left count the
        frontlines in each state for that service — <b>Dormant</b> is a last request over 90 days
        before the end of the range, and <b>Top users</b> are the busiest quarter of the
        frontlines still using it. Shade says how much; the state is on the cell's tooltip.
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
                    const tone = shade(effort
                      ? (mode === 'total' ? r.service_bands_hours?.[s.name]
                                          : r.service_bands_hours_per_user?.[s.name])
                      : (mode === 'total' ? r.service_bands?.[s.name]
                                          : r.service_bands_per_user?.[s.name]))
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
                            background: tone.bg, color: INK, border: '1px solid #e8e2d6',
                            textShadow: tone.faint ? FAINT_SHADOW : undefined,
                            fontWeight: 700, fontSize: 12,
                            cursor: n ? 'pointer' : 'default',
                          }}>{(effort ? Math.round(r.service_hours?.[s.name] ?? 0) : n) || '·'}</span>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openCell && <CellUsers cell={openCell} band={bandOf(openCell)}
                              onClose={() => setOpenCell(null)} />}
    </Card>
  )
}
