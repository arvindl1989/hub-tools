import { useEffect, useMemo, useState } from 'react'
import { getNpi, getNpiPerson } from '../api'
import {
  Card, MetricCard, SegmentCard, Empty, INTER, KONE_FONT,
  cardHeadingStyle, selStyle, activeFilterPillStyle, NPS_BUCKET_STYLES,
} from '../components/KoneUI'
import { SERIES, INK, RULE, SAND_SOFT } from '../kone/chartTheme'

// ── NPI 2026 ─────────────────────────────────────────────────────────────────
// A survey, not a feed: 85 people asked, 25 who answered. Two scales that are
// deliberately never averaged together —
//
//   Recommend   0–10, one question, read as promoter / passive / detractor
//   Parameters  1–5, five questions about the service itself
//
// — because a mean of the two has no unit and nobody could say what it meant.
//
// Everything on the page opens. A band, an area, a frontline and a name all
// lead to the same list of people, because "who is in this number" is the
// question every figure here invites, and answering it in one dialog rather
// than four keeps the page short.
//
// The five parameter scores are NOT columns on the main table. They were, and
// eleven columns of digits buried the two things somebody is looking for —
// the score and who to talk to. They live one click away instead.

const BLUE = '#1450f5'
const DIM = '#6e6e6e'
const FAINT = '#9c9c9c'
const AMBER = '#b87d00'
const GHOST = '#ddd8cf'

const n1 = (v) => (v == null ? '—' : Number(v).toFixed(1))
const n2 = (v) => (v == null ? '—' : Number(v).toFixed(2))

const th = {
  padding: '7px 10px', fontSize: 10, fontWeight: 600, color: DIM, textAlign: 'right',
  textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: INTER,
  whiteSpace: 'nowrap', borderBottom: `2px solid ${RULE}`,
}
const td = {
  padding: '8px 10px', fontSize: 12.5, textAlign: 'right', fontFamily: KONE_FONT,
  whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', color: INK.primary,
  borderBottom: '1px solid #f4f0e7',
}
const tdL = { ...td, textAlign: 'left', fontFamily: INTER }
const openable = { cursor: 'pointer' }

// One bar, one meaning: the share of its scale this average reaches.
function Bar({ value, max, tone = SERIES[0] }) {
  const pct = value == null ? 0 : Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <div style={{ height: 5, background: '#efeae0', borderRadius: 999, overflow: 'hidden',
                  minWidth: 56 }}>
      <div style={{ width: `${pct}%`, height: '100%', background: tone, borderRadius: 999 }} />
    </div>
  )
}

function Pill({ children, tone, title }) {
  return (
    <span title={title}
          style={{ display: 'inline-block', padding: '3px 9px', borderRadius: 999,
                   background: tone.bg, color: tone.fg, fontSize: 11, fontWeight: 700,
                   fontFamily: INTER, whiteSpace: 'nowrap' }}>{children}</span>
  )
}

const bucketTone = (b) => NPS_BUCKET_STYLES[b] ?? { fg: FAINT, bg: '#f3eee6' }
const BAND_LABEL = { promoter: 'Promoters', passive: 'Passives', detractor: 'Detractors' }

// Sorting. Blanks go last whichever way the column is pointing — a dash is the
// absence of a value, not a low one, and letting it win a descending sort puts
// the people with no answer at the top of a table about answers.
function sortRows(rows, key, dir) {
  if (!key) return rows
  const val = (r) => {
    if (key === 'owner') return r.owner?.name ?? null
    if (key === 'status') return r.completed ? 'Answered' : (r.outreach || 'No reply')
    return r[key] ?? null
  }
  return [...rows].sort((a, b) => {
    const av = val(a), bv = val(b)
    if (av == null && bv == null) return 0
    if (av == null) return 1
    if (bv == null) return -1
    const cmp = (typeof av === 'number' && typeof bv === 'number')
      ? av - bv
      : String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' })
    return cmp * dir
  })
}

function SortHead({ label, col, sort, setSort, align = 'right', title }) {
  const on = sort.key === col
  return (
    <th style={{ ...th, textAlign: align, ...openable }} title={title || `Sort by ${label}`}
        onClick={() => setSort(s => ({ key: col, dir: s.key === col ? -s.dir : 1 }))}>
      {label}
      <span style={{ color: on ? BLUE : GHOST, marginLeft: 4 }}>
        {on ? (sort.dir === 1 ? '↑' : '↓') : '↕'}
      </span>
    </th>
  )
}

export default function NpiPage({ sessionId }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [area, setArea] = useState('')
  const [frontline, setFrontline] = useState('')
  const [person, setPerson] = useState(null)
  const [detail, setDetail] = useState(null)
  const [list, setList] = useState(null)       // {title, subtitle, rows}
  const [showAll, setShowAll] = useState(false)
  const [sort, setSort] = useState({ key: 'recommend', dir: -1 })

  useEffect(() => {
    let live = true
    setData(null); setError(null)
    getNpi(sessionId, { area, frontline })
      .then(d => { if (live) setData(d) })
      .catch(e => { if (live) setError(e?.message || 'Could not read the survey.') })
    return () => { live = false }
  }, [sessionId, area, frontline])

  useEffect(() => {
    if (!person) { setDetail(null); return }
    let live = true
    setDetail(null)
    getNpiPerson(sessionId, person)
      .then(d => { if (live) setDetail(d) })
      .catch(() => { if (live) setDetail({ error: true }) })
    return () => { live = false }
  }, [sessionId, person])

  const rows = useMemo(() => {
    const base = (data?.responses ?? []).filter(r => showAll || r.completed)
    return sortRows(base, sort.key, sort.dir)
  }, [data, showAll, sort])

  if (error || !data) {
    return (
      <Card title="NPI 2026">
        <div style={{ padding: 22, fontSize: 13, fontFamily: INTER,
                      color: error ? '#c0305a' : DIM }}>
          {error || 'Reading the survey…'}
        </div>
      </Card>
    )
  }
  if (!data.invited) return <Card title="NPI 2026"><Empty text="No survey data" /></Card>

  const rec = data.recommend
  const m = data.matching
  const filters = [area, frontline].filter(Boolean)

  const openPeople = (title, subtitle, people) =>
    setList({ title, subtitle, rows: people })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
                    flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: INK.primary, margin: 0,
                       letterSpacing: '-0.02em', fontFamily: INTER }}>NPI 2026</h2>
          {filters.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              {filters.map(v => <span key={v} style={activeFilterPillStyle}>{v}</span>)}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={area} onChange={e => setArea(e.target.value)} style={selStyle}>
            <option value="">All areas</option>
            {(data.areas ?? []).map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={frontline} onChange={e => setFrontline(e.target.value)} style={selStyle}>
            <option value="">All frontlines</option>
            {(data.frontlines ?? []).map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          {filters.length > 0 && (
            <button onClick={() => { setArea(''); setFrontline('') }}
                    style={{ background: '#fff', border: `1px solid ${RULE}`, borderRadius: 7,
                             padding: '6px 12px', fontSize: 12, fontFamily: INTER,
                             cursor: 'pointer', color: INK.primary }}>Clear</button>
          )}
          <span style={{ fontSize: 12, fontWeight: 700, color: BLUE, background: '#eef3fe',
                         borderRadius: 8, padding: '6px 12px', fontFamily: INTER }}>
            {data.completed} OF {data.invited} · {data.response_rate_pct}%
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <MetricCard label="Recommend" value={n1(rec.average)} suffix={`/ ${rec.max}`}
                    sub="The one 0–10 question" />
        <MetricCard label="NPI score" value={rec.nps == null ? '—' : rec.nps}
                    sub="Promoters less detractors, per hundred" />
        <MetricCard label="Service average" value={n2(data.overall_average)}
                    suffix={`/ ${data.scale_max}`} sub="Across the five rated parameters" />
        <MetricCard label="Answered" value={data.completed}
                    sub={`of ${data.invited} asked`}
                    onClick={() => openPeople('Everyone who answered',
                      `${data.completed} of ${data.invited} asked`,
                      data.responses.filter(r => r.completed))} />
      </div>

      {/* The three bands. Each opens the people in it. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {[['promoter', rec.promoters, 'Scored 9 or 10'],
          ['passive', rec.passives, 'Scored 7 or 8'],
          ['detractor', rec.detractors, 'Scored 6 or below']].map(([band, count, sub]) => (
          <div key={band} onClick={() => openPeople(BAND_LABEL[band], sub,
                 data.responses.filter(r => r.bucket === band))}
               role="button" tabIndex={0}
               onKeyDown={e => { if (e.key === 'Enter') openPeople(BAND_LABEL[band], sub,
                 data.responses.filter(r => r.bucket === band)) }}
               title={`Who is in this band`}
               style={{ ...openable, borderRadius: 8 }}>
            <SegmentCard label={BAND_LABEL[band]} value={count}
                         tone={NPS_BUCKET_STYLES[band]} sub={sub} />
          </div>
        ))}
      </div>

      <Card title="By parameter"
            subtitle={`Rated 1 to ${data.scale_max}. The spread sits beside the average, because a 4.3 made of fives and twos is not a 4.3.`}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left' }}>Parameter</th>
              <th style={th}>Average</th>
              <th style={{ ...th, textAlign: 'left', width: '30%' }} />
              {[5, 4, 3, 2, 1].map(v => <th key={v} style={th}>{v}</th>)}
            </tr>
          </thead>
          <tbody>
            {data.parameters.map((p, i) => (
              <tr key={p.key} style={{ background: i % 2 ? SAND_SOFT : '#fff' }}>
                <td style={{ ...tdL, fontWeight: 600 }}>{p.label}</td>
                <td style={{ ...td, fontWeight: 700 }}>{n2(p.average)}</td>
                <td style={{ ...td, paddingRight: 18 }}>
                  <Bar value={p.average} max={data.scale_max} />
                </td>
                {[5, 4, 3, 2, 1].map(v => (
                  <td key={v} style={{ ...td, color: p.spread[v] ? INK.primary : GHOST }}>
                    {p.spread[v] || '–'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Area and frontline. Every row opens the people behind it. */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {[['By area', 'area', data.by_area],
          ['By frontline', 'frontline', data.by_frontline]].map(([title, field, groups]) => (
          <Card key={title} title={title}
                subtitle="Averages are over the people who answered. Click a row for who did and who did not.">
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...th, textAlign: 'left' }}>{field}</th>
                    <th style={th}>Answered</th>
                    <th style={th}>Rec.</th>
                    <th style={th}>Service</th>
                    <th style={{ ...th, textAlign: 'left', width: '22%' }} />
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g, i) => (
                    <tr key={g.name} onClick={() => openPeople(g.name,
                          `${g.completed} of ${g.invited} answered`,
                          data.responses.filter(r => r[field] === g.name))}
                        title={`Who was asked in ${g.name}`}
                        style={{ background: i % 2 ? SAND_SOFT : '#fff', ...openable }}>
                      <td style={{ ...tdL, fontWeight: 600, color: BLUE }}>{g.name}</td>
                      <td style={td} title={`${g.completed} of ${g.invited} asked`}>
                        {g.completed}<span style={{ color: FAINT }}> / {g.invited}</span>
                      </td>
                      <td style={td}>{n1(g.recommend)}</td>
                      <td style={{ ...td, fontWeight: 700 }}>{n2(g.average)}</td>
                      <td style={{ ...td, paddingRight: 18 }}>
                        <Bar value={g.average} max={data.scale_max} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ))}
      </div>

      {/* Everyone asked */}
      <Card title="Everyone asked"
            subtitle="Sort any column. Click a name for their requests and the specialists who worked them."
            controls={
              <button onClick={() => setShowAll(v => !v)}
                      style={{ background: showAll ? BLUE : '#fff', color: showAll ? '#fff' : DIM,
                               border: `1px solid ${showAll ? BLUE : RULE}`, borderRadius: 7,
                               padding: '6px 12px', fontSize: 12, fontWeight: 600,
                               fontFamily: INTER, cursor: 'pointer' }}>
                {showAll ? `All ${data.invited}` : `Answered only (${data.completed})`}
              </button>
            }>
        <div style={{ fontSize: 11, fontFamily: INTER, lineHeight: 1.6, marginBottom: 10,
                      color: m.matched ? DIM : AMBER }}
             title={m.unmatched.length ? `Not linked: ${m.unmatched.join(', ')}` : undefined}>
          {m.ticket_users_known === 0
            ? 'No ticket data in this session, so no requests or owners can be shown.'
            : <>{m.matched} of {m.of} linked to a requester
                {m.by_mapping > 0 && ` · ${m.by_mapping} by mapping`}
                {m.by_name > 0 && ` · ${m.by_name} by name`}
                {m.unmatched.length > 0 && <> · <b>{m.unmatched.length} unlinked</b> — fill the
                  “Ticket user” column on the NPI 2026 sheet in SN Master</>}</>}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <SortHead label="Name" col="name" sort={sort} setSort={setSort} align="left" />
                <SortHead label="Frontline" col="frontline" sort={sort} setSort={setSort}
                          align="left" />
                <SortHead label="Area" col="area" sort={sort} setSort={setSort} align="left" />
                <SortHead label="Recommend" col="recommend" sort={sort} setSort={setSort} />
                <SortHead label="Service" col="average" sort={sort} setSort={setSort} />
                <SortHead label="Requests" col="requests" sort={sort} setSort={setSort} />
                <SortHead label="Who should reach out" col="owner" sort={sort} setSort={setSort}
                          align="left"
                          title="The specialist who has handled most of this person's requests" />
                <SortHead label="Status" col="status" sort={sort} setSort={setSort}
                          align="left" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.name} style={{ background: i % 2 ? SAND_SOFT : '#fff' }}>
                  <td style={{ ...tdL, fontWeight: 600 }}>
                    <button onClick={() => setPerson(r.name)}
                            style={{ background: 'none', border: 'none', padding: 0,
                                     font: 'inherit', color: BLUE, cursor: 'pointer',
                                     textAlign: 'left' }}>{r.name}</button>
                    {r.follow_up && (
                      <span title="Asked for a follow-up"
                            style={{ color: AMBER, marginLeft: 6, fontSize: 10 }}>↩</span>
                    )}
                  </td>
                  <td style={tdL}>{r.frontline || '—'}</td>
                  <td style={tdL}>{r.area || '—'}</td>
                  <td style={{ ...td, padding: '6px 10px' }}>
                    {r.recommend == null ? <span style={{ color: GHOST }}>–</span>
                      : <Pill tone={bucketTone(r.bucket)}>{r.recommend}</Pill>}
                  </td>
                  <td style={{ ...td, fontWeight: 700,
                               color: r.average == null ? GHOST : INK.primary }}>
                    {r.average == null ? '–' : n1(r.average)}
                  </td>
                  <td style={{ ...td, color: r.requests == null ? GHOST : INK.primary }}
                      title={r.matched_as
                        ? `Matched to ${r.matched_as}${r.matched_by_mapping ? ' by the mapping' : ' by name'}`
                        : 'Not linked to a requester yet'}>
                    {r.requests ?? '–'}
                  </td>
                  {/* Whoever has handled most of their work. Not an assignment,
                      a starting point — and a tie says so rather than picking. */}
                  <td style={{ ...tdL, color: r.owner ? INK.primary : GHOST }}
                      title={r.owner
                        ? `${r.owner.requests} of ${r.requests} requests (${r.owner.share_pct}%)`
                          + (r.owner.tied_with?.length
                            ? `, level with ${r.owner.tied_with.join(', ')}` : '')
                        : undefined}>
                    {r.owner ? <>
                      {r.owner.name}
                      <span style={{ color: FAINT, fontSize: 11 }}> {r.owner.share_pct}%</span>
                      {r.owner.tied_with?.length > 0 && (
                        <span style={{ color: AMBER, fontSize: 10 }}> +{r.owner.tied_with.length}</span>
                      )}
                    </> : '–'}
                  </td>
                  <td style={{ ...tdL, fontSize: 11,
                               color: r.completed ? INK.primary : FAINT }}>
                    {r.completed ? 'Answered' : (r.outreach || 'No reply')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Comments, two to a row and clamped. The whole of one is a click away. */}
      <Card title="What they said"
            subtitle={`${data.comments.length} written answers. The score says how it went; this says why.`}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                      gap: 12 }}>
          {data.comments.map(c => (
            <div key={c.name} onClick={() => setPerson(c.name)} role="button" tabIndex={0}
                 onKeyDown={e => { if (e.key === 'Enter') setPerson(c.name) }}
                 title="Open their full answer and their requests"
                 style={{ border: `1px solid ${RULE}`, borderRadius: 10, padding: '12px 14px',
                          background: '#fff', ...openable, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                            marginBottom: 7 }}>
                <span style={{ fontSize: 13, fontWeight: 700, fontFamily: INTER, color: BLUE }}>
                  {c.name}
                </span>
                <span style={{ fontSize: 11, color: FAINT, fontFamily: INTER }}>
                  {c.frontline} · {c.area}
                </span>
                {c.recommend != null && <Pill tone={bucketTone(c.bucket)}>{c.recommend}</Pill>}
                {c.follow_up && <Pill tone={{ fg: AMBER, bg: '#fdf3dd' }}>follow up</Pill>}
              </div>
              {[['Works well', c.strengths, NPS_BUCKET_STYLES.promoter.fg],
                ['Could be better', c.improvements, AMBER]].map(([label, text, tone]) =>
                text ? (
                  <p key={label} style={{ margin: '0 0 6px', fontSize: 12.5, lineHeight: 1.6,
                                          fontFamily: INTER, color: INK.primary,
                                          display: '-webkit-box', WebkitLineClamp: 3,
                                          WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    <span style={{ ...cardHeadingStyle(tone), fontSize: 9.5, marginRight: 7 }}>
                      {label}
                    </span>
                    {text}
                  </p>
                ) : null)}
            </div>
          ))}
        </div>
      </Card>

      {list && (
        <PeopleDialog {...list} onPick={(n) => { setList(null); setPerson(n) }}
                      scaleMax={data.scale_max} onClose={() => setList(null)} />
      )}
      {person && (
        <PersonDialog name={person} detail={detail} onClose={() => setPerson(null)} />
      )}
    </div>
  )
}

// ── Who is in this number ────────────────────────────────────────────────────
// One dialog behind every count on the page — a band, an area, a frontline,
// the answered total. Whether somebody replied is the first column, because
// that is what the list is usually opened to find out.
function PeopleDialog({ title, subtitle, rows, onPick, onClose, scaleMax }) {
  const [sort, setSort] = useState({ key: 'recommend', dir: -1 })
  const sorted = useMemo(() => sortRows(rows, sort.key, sort.dir), [rows, sort])
  const answered = rows.filter(r => r.completed).length
  return (
    <Shell title={title}
           subtitle={`${subtitle} · ${answered} answered, ${rows.length - answered} did not`}
           onClose={onClose}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <SortHead label="Status" col="status" sort={sort} setSort={setSort} align="left" />
            <SortHead label="Name" col="name" sort={sort} setSort={setSort} align="left" />
            <SortHead label="Frontline" col="frontline" sort={sort} setSort={setSort}
                      align="left" />
            <SortHead label="Area" col="area" sort={sort} setSort={setSort} align="left" />
            <SortHead label="Recommend" col="recommend" sort={sort} setSort={setSort} />
            <SortHead label="Service" col="average" sort={sort} setSort={setSort} />
            <SortHead label="Requests" col="requests" sort={sort} setSort={setSort} />
            <SortHead label="Reach out" col="owner" sort={sort} setSort={setSort} align="left" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={r.name} style={{ background: i % 2 ? SAND_SOFT : '#fff' }}>
              <td style={{ ...tdL, fontSize: 11 }}>
                {r.completed
                  ? <Pill tone={NPS_BUCKET_STYLES.promoter}>Answered</Pill>
                  : <span style={{ color: FAINT }}>{r.outreach || 'No reply'}</span>}
              </td>
              <td style={{ ...tdL, fontWeight: 600 }}>
                <button onClick={() => onPick(r.name)}
                        style={{ background: 'none', border: 'none', padding: 0, font: 'inherit',
                                 color: BLUE, cursor: 'pointer' }}>{r.name}</button>
              </td>
              <td style={tdL}>{r.frontline || '—'}</td>
              <td style={tdL}>{r.area || '—'}</td>
              <td style={{ ...td, padding: '6px 10px' }}>
                {r.recommend == null ? <span style={{ color: GHOST }}>–</span>
                  : <Pill tone={bucketTone(r.bucket)}>{r.recommend}</Pill>}
              </td>
              <td style={{ ...td, color: r.average == null ? GHOST : INK.primary }}>
                {r.average == null ? '–' : `${n1(r.average)} / ${scaleMax}`}
              </td>
              <td style={{ ...td, color: r.requests == null ? GHOST : INK.primary }}>
                {r.requests ?? '–'}
              </td>
              <td style={{ ...tdL, color: r.owner ? INK.primary : GHOST }}>
                {r.owner?.name ?? '–'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && (
        <div style={{ padding: 20, color: DIM, fontSize: 12.5, fontFamily: INTER }}>
          Nobody in this group.
        </div>
      )}
    </Shell>
  )
}

function Shell({ title, subtitle, onClose, children }) {
  return (
    <div onClick={onClose}
         style={{ position: 'fixed', inset: 0, background: 'rgba(20,20,20,0.34)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  zIndex: 60, padding: 24 }}>
      <div onClick={e => e.stopPropagation()}
           style={{ background: '#fff', borderRadius: 14, width: 'min(1040px, 100%)',
                    maxHeight: '86vh', display: 'flex', flexDirection: 'column',
                    boxShadow: '0 18px 48px rgba(20,20,20,0.22)' }}>
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${RULE}`,
                      display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 700, fontFamily: INTER, color: INK.primary }}>
            {title}
          </div>
          <div style={{ fontSize: 11.5, color: DIM, fontFamily: INTER, flex: 1 }}>{subtitle}</div>
          <button onClick={onClose} aria-label="Close"
                  style={{ background: 'none', border: 'none', fontSize: 20, color: DIM,
                           cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ overflow: 'auto', padding: '8px 20px 18px' }}>{children}</div>
      </div>
    </div>
  )
}

// ── One respondent, and the work behind their score ──────────────────────────
function PersonDialog({ name, detail, onClose }) {
  const r = detail?.response
  const subtitle = [r && `${r.frontline} · ${r.area}`,
                    detail?.matched_as && `tickets as “${detail.matched_as}”`]
    .filter(Boolean).join(' · ') || 'Opening…'
  return (
    <Shell title={name} subtitle={subtitle} onClose={onClose}>
      {!detail ? (
        <div style={{ padding: 16, color: DIM, fontSize: 12.5, fontFamily: INTER }}>Opening…</div>
      ) : (<>
        {r?.completed && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '10px 0 14px' }}>
            {r.recommend != null && (
              <Pill tone={bucketTone(r.bucket)}>Recommend {r.recommend} / 10</Pill>
            )}
            <Pill tone={{ fg: BLUE, bg: '#eef3fe' }}>Service {n2(r.average)} / 5</Pill>
            {Object.entries(r.parameters).map(([k, v]) => (
              <Pill key={k} tone={{ fg: INK.secondary, bg: '#f6f1e8' }}>
                {k.replace('Q4_', '')} {v ?? '—'}
              </Pill>
            ))}
            {r.follow_up && <Pill tone={{ fg: AMBER, bg: '#fdf3dd' }}>wants a follow-up</Pill>}
          </div>
        )}
        {r?.strengths && (
          <p style={{ fontSize: 12.5, lineHeight: 1.65, fontFamily: INTER, margin: '0 0 8px',
                      color: INK.primary }}><b>Works well.</b> {r.strengths}</p>
        )}
        {r?.improvements && (
          <p style={{ fontSize: 12.5, lineHeight: 1.65, fontFamily: INTER, margin: '0 0 14px',
                      color: INK.primary }}><b>Could be better.</b> {r.improvements}</p>
        )}

        {!detail.matched_as ? (
          <div style={{ background: '#fdf3dd', border: '1px solid #f2e3bb', borderRadius: 10,
                        padding: '12px 14px', fontSize: 12.5, fontFamily: INTER,
                        color: '#6b5200', lineHeight: 1.65 }}>
            No requester in the ticket data is linked to this person yet. Open the
            {' '}<b>NPI 2026</b> sheet in SN Master and put their ServiceNow “Requested by”
            name in the <b>Ticket user</b> column — their requests and the specialists who
            worked them appear here as soon as you do.
          </div>
        ) : (<>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 12 }}>
            {[['Specialists who worked with them', detail.specialists],
              ['Services they asked for', detail.services]].map(([label, xs]) => (
              <div key={label} style={{ minWidth: 240 }}>
                <div style={{ ...cardHeadingStyle(DIM), fontSize: 9.5, marginBottom: 5 }}>
                  {label}
                </div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {(xs ?? []).length === 0
                    ? <span style={{ fontSize: 11.5, color: FAINT, fontFamily: INTER }}>
                        none recorded
                      </span>
                    : xs.map(x => (
                      <span key={x.name}
                            style={{ fontSize: 11.5, fontFamily: INTER, color: INK.primary,
                                     background: '#f2f5fe', border: '1px solid #e1e9fd',
                                     borderRadius: 999, padding: '3px 9px' }}>
                        {x.name} <b style={{ color: BLUE }}>{x.requests}</b>
                      </span>
                    ))}
                </div>
              </div>
            ))}
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Ticket', 'Summary', 'Service', 'Specialist', 'State', 'Raised'].map(h => (
                  <th key={h} style={{ ...th, textAlign: 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(detail.tickets ?? []).map((t, i) => (
                <tr key={`${t.number}-${i}`} style={{ background: i % 2 ? SAND_SOFT : '#fff' }}>
                  <td style={{ ...td, textAlign: 'left', whiteSpace: 'nowrap' }}>
                    {t.number || '—'}
                  </td>
                  <td style={{ ...tdL, maxWidth: 300, whiteSpace: 'normal' }}>
                    {t.summary || '—'}
                  </td>
                  <td style={{ ...tdL, color: DIM }}>{t.service || '—'}</td>
                  <td style={{ ...tdL, color: DIM }}>{t.specialist || '—'}</td>
                  <td style={{ ...tdL, color: DIM }}>{t.state || '—'}</td>
                  <td style={{ ...tdL, color: DIM, whiteSpace: 'nowrap' }}>{t.created || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!(detail.tickets ?? []).length && (
            <div style={{ padding: 16, color: DIM, fontSize: 12.5, fontFamily: INTER }}>
              Linked to “{detail.matched_as}”, but that requester has no tickets in the
              current data.
            </div>
          )}
        </>)}
      </>)}
    </Shell>
  )
}
