import { useEffect, useMemo, useState } from 'react'
import { getFeedback, getKpi3d, getOverview, getUserMetrics } from '../api'
import KoneWorld from '../components/KoneWorld'
import VolumeField from '../components/VolumeField'
import {
  INTER, KONE, KONE_INFO, LOW_SAMPLE, TARGETS, statusOf,
} from '../kone/worldConfig'

// ── The board, in the brand's own drawing ────────────────────────────────────
// White page, black line, one blue. Two views of the same upload: the World
// puts the hub in a KONE city, the Volume field lays the year flat. Nothing
// here is a second source of truth — only a second way of looking.
//
// The rule the whole page is built on: the drawing shows shape, relative size
// and flow; every exact number sits on a flat surface next to it. A storey's
// width and a car's height are comparisons, not readings.

const HERO = 'Moving requests, creating lasting impact'

const MONTH_CHOICES = [6, 12, 18]
const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString())
const signed = (n) => (n == null ? '—' : `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmt(Math.abs(n))}`)

// ── Flat KONE surfaces ───────────────────────────────────────────────────────
function Card({ children, style }) {
  return (
    <div style={{
      background: KONE.white, border: `1px solid ${KONE.hairline}`, borderRadius: 8,
      ...style,
    }}>{children}</div>
  )
}

function Label({ children, style }) {
  return (
    <div style={{
      fontFamily: KONE_INFO, fontSize: 11, letterSpacing: '0.06em',
      textTransform: 'uppercase', color: KONE.black60, ...style,
    }}>{children}</div>
  )
}

function Figure({ label, value, note, delta, deltaGood }) {
  const tone = (delta == null || delta === 0 || deltaGood == null) ? KONE.black60
    : (deltaGood ? KONE.green : KONE.red)
  return (
    <Card style={{ flex: 1, minWidth: 150, padding: '14px 18px' }}>
      <Label>{label}</Label>
      <div style={{
        fontFamily: KONE_INFO, fontSize: 38, color: KONE.black, lineHeight: 1.15,
        marginTop: 6,
      }}>{value}</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginTop: 4 }}>
        {delta != null && (
          <span style={{ fontFamily: INTER, fontSize: 12, color: tone }}>
            {signed(delta)} vs previous
          </span>
        )}
        {note && (
          <span style={{ fontFamily: INTER, fontSize: 12, color: KONE.black60 }}>{note}</span>
        )}
      </div>
    </Card>
  )
}

// ── The three zone labels ────────────────────────────────────────────────────
// Flat, in Inter, sentence case, beside the drawing rather than on it. Each
// keeps its own unit and its own target: converting a score out of five into a
// percentage so that three KPIs could share one scale was the most misleading
// thing about the first build.
function ZoneCard({ kpi, selected, onPick }) {
  const st = statusOf(kpi.value, kpi.target, kpi.max)
  const low = kpi.value != null && kpi.sample != null && kpi.sample < LOW_SAMPLE
  return (
    <Card style={{
      flex: 1, minWidth: 190, padding: '14px 16px',
      outline: selected ? `2px solid ${KONE.blue}` : 'none', cursor: 'pointer',
    }}>
      <div
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        onClick={() => onPick(selected ? null : { kind: 'kpi', ...kpi })}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onPick(selected ? null : { kind: 'kpi', ...kpi })
          }
        }}
        style={{ outline: 'none' }}
      >
        <div style={{ fontFamily: INTER, fontSize: 15, color: KONE.black }}>
          {kpi.label}
        </div>
        <div style={{ fontFamily: INTER, fontSize: 12, color: KONE.black60, marginTop: 3 }}>
          {kpi.descriptor}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 10 }}>
          <span style={{ fontFamily: KONE_INFO, fontSize: 30, color: KONE.black }}>
            {kpi.reading}
          </span>
          {kpi.target != null && (
            <span style={{ fontFamily: INTER, fontSize: 12, color: KONE.black60 }}>
              target {kpi.targetLabel}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 8 }}>
          {low ? (
            <span style={{
              fontFamily: INTER, fontSize: 12, color: KONE.black60,
              border: `1px solid ${KONE.hairline}`, borderRadius: 20, padding: '2px 9px',
            }}>Low sample</span>
          ) : st.key !== 'none' && (
            <>
              <span style={{ width: 8, height: 8, borderRadius: 8, background: st.color }} />
              <span style={{ fontFamily: INTER, fontSize: 12, color: KONE.black60 }}>
                {st.label}
              </span>
            </>
          )}
          <span style={{ fontFamily: INTER, fontSize: 12, color: KONE.black40,
                         marginLeft: 'auto' }}>
            n = {fmt(kpi.sample)}
          </span>
        </div>
      </div>
    </Card>
  )
}

// ── Raised against closed ────────────────────────────────────────────────────
function TrendStrip({ trend = [] }) {
  const peak = Math.max(1, ...trend.map(t => Math.max(t.raised, t.closed)))
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 78 }}>
      {trend.map(t => (
        <div key={t.key} style={{ flex: 1, minWidth: 0, textAlign: 'center' }}
             title={`${t.label}: ${t.raised} raised, ${t.closed} closed`}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                        gap: 3, height: 52 }}>
            <div style={{ width: '42%', maxWidth: 15, background: KONE.blue,
                          height: `${(t.raised / peak) * 100}%`,
                          minHeight: t.raised ? 2 : 0 }} />
            <div style={{ width: '42%', maxWidth: 15, background: KONE.sand,
                          border: `1px solid ${KONE.hairline}`, boxSizing: 'border-box',
                          height: `${(t.closed / peak) * 100}%`,
                          minHeight: t.closed ? 2 : 0 }} />
          </div>
          <Label style={{ marginTop: 6, fontSize: 10 }}>{t.label}</Label>
        </div>
      ))}
    </div>
  )
}

// ── What the drawing cannot say exactly ──────────────────────────────────────
function Panel({ selection, world, data }) {
  const Row = ({ k, v, sub, tone }) => (
    <div style={{
      display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline',
      padding: '9px 0', borderBottom: `1px solid ${KONE.hairline}`,
    }}>
      <span style={{ fontFamily: INTER, fontSize: 12, color: KONE.black60 }}>{k}</span>
      <span style={{ textAlign: 'right' }}>
        <span style={{ fontFamily: KONE_INFO, fontSize: 14, color: tone || KONE.black }}>
          {v}
        </span>
        {sub && (
          <span style={{ fontFamily: INTER, fontSize: 11, color: KONE.black40,
                         display: 'block' }}>{sub}</span>
        )}
      </span>
    </div>
  )

  const prev = data?.previous
  const hist = prev?.has_history
  const deltaOf = (now, before) => (hist && before != null ? signed(now - before) : null)

  let title = 'The hub'
  let sub = 'Select a storey or a zone'
  let rows = []

  if (selection?.kind === 'floor') {
    const row = (data?.by_area ?? []).find(a => a.area === selection.key)
    title = selection.name
    sub = 'An area of the business, one storey of the tower'
    rows = [
      ['Requests raised', fmt(selection.requests),
        row && hist ? `${signed(row.delta)} vs previous period` : null],
      ['People who raised them', fmt(selection.users)],
      ['Utility rate', selection.utility == null ? '—' : `${selection.utility}%`],
      ['Requests per person', selection.perUser ?? '—'],
      ['Feedback score', selection.score == null ? 'No responses'
        : `${selection.score.toFixed(2)} / ${world.scaleMax}`,
      selection.responses ? `${fmt(selection.responses)} responses` : null],
      ['Open over 30 days', fmt(selection.stale ?? 0),
        selection.oldestDays ? `oldest ${selection.oldestDays} days` : null],
    ]
  } else if (selection?.kind === 'kpi') {
    title = selection.label
    sub = selection.where
    rows = [
      ['Reading', selection.reading],
      ['Target', selection.targetLabel ?? '—'],
      ...(selection.detail ?? []).map(([k, v]) => [k, v]),
    ]
  } else {
    const net = (world.summary?.closed ?? 0) - (world.summary?.requests ?? 0)
    const driver = (data?.by_area ?? [])[0]
    rows = [
      ['Requests in the window', fmt(world.summary?.requests),
        deltaOf(world.summary?.requests ?? 0, prev?.requests) &&
        `${deltaOf(world.summary?.requests ?? 0, prev?.requests)} vs previous`],
      ['Closed', fmt(world.summary?.closed),
        deltaOf(world.summary?.closed ?? 0, prev?.closed) &&
        `${deltaOf(world.summary?.closed ?? 0, prev?.closed)} vs previous`],
      ['Backlog', net >= 0 ? `drained ${fmt(net)}` : `grew ${fmt(-net)}`,
        'closed less raised', net >= 0 ? KONE.green : KONE.red],
      ['Driving the change', driver && hist
        ? `${driver.area} ${signed(driver.delta)}`
        : '—', 'largest move vs previous period'],
      ['Open over 30 days', fmt((data?.oldest_open ?? [])
        .reduce((s, r) => s + r.count, 0))],
      ['Areas in the building', (world.floors ?? []).length],
    ]
  }

  return (
    <Card style={{ width: 300, flexShrink: 0, padding: '18px 20px', overflowY: 'auto' }}>
      <div aria-live="polite">
        <div style={{ fontFamily: INTER, fontSize: 20, color: KONE.black }}>{title}</div>
        <div style={{ fontFamily: INTER, fontSize: 12, color: KONE.black60, marginTop: 4,
                      marginBottom: 10, lineHeight: 1.5 }}>{sub}</div>
        {rows.map(([k, v, s2, tone]) => <Row key={k} k={k} v={v} sub={s2} tone={tone} />)}
        {selection?.note && (
          <div style={{ fontFamily: INTER, fontSize: 11, color: KONE.black60, marginTop: 12,
                        lineHeight: 1.6 }}>{selection.note}</div>
        )}
      </div>
    </Card>
  )
}

export default function ThreeDDashboardPage({ sessionId, onSessionExpired }) {
  const [view, setView] = useState('world')
  const [data, setData] = useState(null)
  const [extra, setExtra] = useState(null)
  const [error, setError] = useState(null)
  const [months, setMonths] = useState(12)
  const [tour, setTour] = useState(false)
  const [selection, setSelection] = useState(null)

  useEffect(() => {
    if (!sessionId) return
    let live = true
    setData(null)
    setError(null)
    getKpi3d(sessionId, months)
      .then(d => { if (live) setData(d) })
      .catch(e => {
        if (e?.sessionExpired) return onSessionExpired?.()
        if (live) setError(e?.message || 'Could not load the figures.')
      })
    return () => { live = false }
  }, [sessionId, months, onSessionExpired])

  // Three tabs' worth of figures, fetched in parallel, each allowed to fail on
  // its own: no feedback sheet means a zone that says so, not an empty screen.
  useEffect(() => {
    if (!sessionId) return
    let live = true
    Promise.allSettled([
      getOverview(sessionId),
      getUserMetrics(sessionId),
      getFeedback({ sid: sessionId }),
    ]).then(([o, u, f]) => {
      if (!live) return
      setExtra({
        overview: o.status === 'fulfilled' ? o.value : null,
        activity: u.status === 'fulfilled' ? u.value : null,
        feedback: f.status === 'fulfilled' ? f.value : null,
      })
    })
    return () => { live = false }
  }, [sessionId])

  const h = data?.headline ?? {}
  const prev = data?.previous
  const span = useMemo(() => {
    const first = data?.months?.[0]
    const last = data?.months?.[(data?.months?.length ?? 1) - 1]
    if (!first || !last) return ''
    return `${first.label} ${first.year} – ${last.label} ${last.year}`.toUpperCase()
  }, [data])

  const world = useMemo(() => {
    const ov = extra?.overview
    const ua = extra?.activity
    const fb = extra?.feedback
    const scoreOf = {}, countOf = {}
    for (const r of fb?.by_area ?? []) { scoreOf[r.area] = r.avg_score; countOf[r.area] = r.count }
    const staleOf = {}
    for (const r of data?.oldest_open ?? []) staleOf[r.area] = r

    const floors = [...(ua?.activity_groups?.by_area ?? [])]
      // Busiest on the ground floor: a building carries its weight low down.
      .sort((a, b) => b.requests - a.requests)
      .map(a => ({
        key: a.name, name: a.name, requests: a.requests, users: a.users,
        utility: a.utility_pct, perUser: a.requests_per_user,
        score: scoreOf[a.name] ?? null, responses: countOf[a.name] ?? 0,
        stale: staleOf[a.name]?.count ?? 0, oldestDays: staleOf[a.name]?.oldest_days ?? null,
      }))

    const openNow = ov?.total_active ?? 0
    const onTime = openNow ? ((openNow - (ov?.overdue_sla ?? 0)) / openNow) * 100 : null
    const scaleMax = fb?.scale_max ?? TARGETS.score.max

    const kpis = [
      {
        key: 'ontime', short: 'ON TIME', label: 'On time',
        descriptor: 'Active requests within SLA',
        value: onTime, max: 100, unit: '%',
        reading: onTime == null ? 'No open work' : `${Math.round(onTime)}%`,
        target: TARGETS.ontime.value, targetLabel: `${TARGETS.ontime.value}%`,
        sample: openNow, where: 'From the Dashboard',
        detail: [
          ['Open right now', fmt(ov?.total_active)],
          ['Already overdue', fmt(ov?.overdue_sla)],
          ['Due within five days', fmt(ov?.due_within_5)],
        ],
        note: 'The share of what is open today that has not passed its SLA date. '
            + 'It says nothing about work already closed.',
      },
      {
        key: 'engaged', short: 'ENGAGED', label: 'Engaged requesters',
        descriptor: 'Requested in the last 90 days',
        value: ua?.rates?.engagement_pct ?? null, max: 100, unit: '%',
        reading: ua?.rates?.engagement_pct == null ? '—'
          : `${Math.round(ua.rates.engagement_pct)}%`,
        target: TARGETS.engaged.value, targetLabel: `${TARGETS.engaged.value}%`,
        sample: ua?.total_users ?? 0, where: 'From User Activity',
        detail: [
          ['Active users', fmt(ua?.lifecycle?.active?.length)],
          ['Regular users', fmt(ua?.lifecycle?.regular?.length)],
          ['Dormant users', fmt(ua?.lifecycle?.dormant?.length)],
        ],
        note: 'Active plus Regular over every user — everyone whose last request was '
            + 'inside the dormancy window.',
      },
      {
        key: 'score', short: 'SCORE', label: 'Requester score',
        descriptor: 'Average survey score',
        // Its own unit on its own scale. Never converted to a percentage so it
        // can sit beside the other two: they are not commensurable.
        value: fb?.avg_score ?? null, max: scaleMax, unit: '',
        reading: fb?.avg_score == null ? 'No feedback data'
          : `${fb.avg_score.toFixed(1)} / ${scaleMax}`,
        target: fb ? TARGETS.score.value : null,
        targetLabel: `${TARGETS.score.value} / ${scaleMax}`,
        sample: fb?.rated ?? 0, where: 'From Feedback',
        detail: [
          ['Responses', fmt(fb?.rated)],
          ['Response rate', fb?.feedback_rate == null ? '—' : `${fb.feedback_rate}%`],
          ['Top marks', fb?.five_star_pct == null ? '—' : `${fb.five_star_pct}%`],
        ],
        note: fb
          ? `Under ${LOW_SAMPLE} responses the car is drawn hollow and the figure is `
            + 'marked low sample: a mean over a handful of answers is not a reading.'
          : 'No feedback sheet is connected, so this zone has nothing to read.',
      },
    ]

    const trend = data?.trend ?? []
    const avg = (k) => (trend.length
      ? trend.reduce((s, t) => s + (t[k] ?? 0), 0) / trend.length : 0)
    const inAvg = avg('raised'), outAvg = avg('closed')
    const top = Math.max(inAvg, outAvg, 1)

    return {
      floors, kpis, scaleMax,
      flow: {
        inSpeed: 0.1 + (inAvg / top) * 0.4,
        outSpeed: 0.1 + (outAvg / top) * 0.4,
        inAvg: Math.round(inAvg),
        outAvg: Math.round(outAvg),
      },
      summary: {
        requests: h.requests, users: h.users, closed: h.closed,
        open: ov?.total_active, avgAge: ov?.avg_age, responses: fb?.rated,
      },
    }
  }, [extra, data, h])

  const worldReady = !!extra
  const net = (h.closed ?? 0) - (h.requests ?? 0)
  const netPerMonth = world.flow.outAvg - world.flow.inAvg

  const button = (active, label, onClick, key) => (
    <button
      key={key ?? label}
      onClick={onClick}
      style={{
        background: active ? KONE.blue : KONE.white,
        color: active ? KONE.white : KONE.black,
        border: `1px solid ${active ? KONE.blue : KONE.hairline}`,
        borderRadius: 7, padding: '7px 15px', fontSize: 12, fontFamily: INTER,
        cursor: 'pointer', transition: 'background 140ms ease, color 140ms ease',
      }}
    >{label}</button>
  )

  return (
    <div style={{ background: KONE.white, borderRadius: 8, border: `1px solid ${KONE.hairline}`,
                  display: 'flex', flexDirection: 'column' }}>
      {/* Hero */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: 24, padding: '24px 26px 0', flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {button(view === 'world', 'World', () => { setView('world'); setSelection(null) })}
          {button(view === 'field', 'Volume field', () => { setView('field'); setSelection(null) })}
          <span style={{ width: 10 }} />
          {view === 'field' && MONTH_CHOICES.map(m =>
            button(m === months, `${m} months`, () => setMonths(m), m))}
          {view === 'world' && button(tour, tour ? 'Touring' : 'Tour', () => setTour(t => !t))}
        </div>
        <div style={{ textAlign: 'right', maxWidth: 420 }}>
          {/* Inter, sentence case, black — never blue, never all caps. */}
          <div style={{ fontFamily: INTER, fontSize: 28, lineHeight: 1.2, color: KONE.black }}>
            {HERO}
          </div>
          <Label style={{ marginTop: 8 }}>{span}</Label>
        </div>
      </div>

      {/* The figures */}
      <div style={{ display: 'flex', gap: 12, padding: '18px 26px 0', flexWrap: 'wrap' }}>
        <Figure label="Requests raised" value={fmt(h.requests)}
                delta={prev?.has_history ? (h.requests ?? 0) - (prev.requests ?? 0) : null}
                note={`${fmt(h.users)} people`} />
        <Figure label="Closed" value={fmt(h.closed)}
                delta={prev?.has_history ? (h.closed ?? 0) - (prev.closed ?? 0) : null}
                deltaGood />
        <Figure label={net >= 0 ? 'Backlog drained by' : 'Backlog grew by'}
                value={fmt(Math.abs(net))} note="closed less raised" />
        <Figure label="Open now" value={fmt(h.open)}
                note={h.median_open_age != null
                  ? `median age ${fmt(h.median_open_age)} days` : 'nothing open'} />
      </div>

      {/* The three zones, flat and beside the drawing */}
      {view === 'world' && worldReady && (
        <div style={{ display: 'flex', gap: 12, padding: '12px 26px 0', flexWrap: 'wrap' }}>
          {world.kpis.map(k => (
            <ZoneCard key={k.key} kpi={k}
                      selected={selection?.kind === 'kpi' && selection.key === k.key}
                      onPick={setSelection} />
          ))}
        </div>
      )}

      {/* The drawing */}
      <div style={{ display: 'flex', gap: 12, padding: '14px 16px 0',
                    height: 'clamp(420px, 56vh, 680px)' }}>
        <div style={{ flex: 1, minWidth: 0, position: 'relative',
                      border: `1px solid ${KONE.hairline}`, borderRadius: 8,
                      overflow: 'hidden' }}>
          {error && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex',
                          alignItems: 'center', justifyContent: 'center', color: KONE.red,
                          fontFamily: INTER, fontSize: 14 }}>{error}</div>
          )}
          {!error && view === 'field' && !data && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex',
                          alignItems: 'center', justifyContent: 'center',
                          color: KONE.black60, fontFamily: INTER, fontSize: 14 }}>
              Drawing the field…
            </div>
          )}
          {!error && view === 'field' && data && <VolumeField data={data} paused={!tour} />}
          {!error && view === 'world' && !worldReady && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex',
                          alignItems: 'center', justifyContent: 'center',
                          color: KONE.black60, fontFamily: INTER, fontSize: 14 }}>
              Putting up the building…
            </div>
          )}
          {!error && view === 'world' && worldReady && (
            <KoneWorld world={world} selected={selection} onPick={setSelection} tour={tour} />
          )}

          {/* The ribbon's reading. Motion is the hook; this is the number. */}
          {view === 'world' && worldReady && (
            <div style={{ position: 'absolute', left: 14, bottom: 14, display: 'flex',
                          gap: 8, flexWrap: 'wrap' }}>
              <Card style={{ padding: '7px 11px' }}>
                <span style={{ display: 'inline-block', width: 9, height: 9,
                               background: KONE.blue, marginRight: 7 }} />
                <span style={{ fontFamily: INTER, fontSize: 12, color: KONE.black }}>
                  Raised <b style={{ fontFamily: KONE_INFO }}>{world.flow.inAvg}</b> / mo
                </span>
              </Card>
              <Card style={{ padding: '7px 11px' }}>
                <span style={{ display: 'inline-block', width: 9, height: 9,
                               background: KONE.sand, border: `1px solid ${KONE.hairline}`,
                               marginRight: 7 }} />
                <span style={{ fontFamily: INTER, fontSize: 12, color: KONE.black }}>
                  Closed <b style={{ fontFamily: KONE_INFO }}>{world.flow.outAvg}</b> / mo
                </span>
              </Card>
              <Card style={{ padding: '7px 11px' }}>
                <span style={{ fontFamily: INTER, fontSize: 12, color: KONE.black }}>
                  Backlog{' '}
                  <b style={{ fontFamily: KONE_INFO,
                              color: netPerMonth === 0 ? KONE.black60
                                : netPerMonth > 0 ? KONE.green : KONE.red }}>
                    {netPerMonth === 0 ? 'level'
                      : `${netPerMonth > 0 ? '−' : '+'}${Math.abs(netPerMonth)} / mo`}
                  </b>
                </span>
              </Card>
            </div>
          )}
        </div>

        {worldReady && <Panel selection={selection} world={world} data={data} />}
      </div>

      {/* Keyboard access to every storey, beside the drawing rather than
          hidden in it: a canvas cannot be tabbed into. */}
      {view === 'world' && worldReady && world.floors.length > 0 && (
        <div style={{ display: 'flex', gap: 8, padding: '12px 26px 0', flexWrap: 'wrap',
                      alignItems: 'center' }}>
          <Label>Storeys</Label>
          {world.floors.map(f => button(
            selection?.kind === 'floor' && selection.key === f.key,
            f.name,
            () => setSelection(selection?.key === f.key ? null
              : { kind: 'floor', ...f }),
            f.key,
          ))}
        </div>
      )}

      {/* Flow, and the questions a leadership room asks of it */}
      <div style={{ display: 'flex', gap: 24, padding: '16px 26px 0', flexWrap: 'wrap' }}>
        <div style={{ flex: 2, minWidth: 320 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8,
                        flexWrap: 'wrap' }}>
            <Label>Raised vs closed</Label>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 13, height: 9, background: KONE.blue }} />
              <span style={{ fontFamily: INTER, fontSize: 11, color: KONE.black60 }}>raised</span>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 13, height: 9, background: KONE.sand,
                             border: `1px solid ${KONE.hairline}` }} />
              <span style={{ fontFamily: INTER, fontSize: 11, color: KONE.black60 }}>closed</span>
            </span>
          </div>
          <TrendStrip trend={data?.trend ?? []} />
        </div>

        <div style={{ flex: 1, minWidth: 260 }}>
          <Label style={{ marginBottom: 8 }}>Median days to close</Label>
          <div style={{ display: 'flex', gap: 18 }}>
            {(data?.service_close_days ?? []).map(s => (
              <div key={s.service} title={`${s.service} — ${s.closed} closed`}>
                <Label style={{ fontSize: 10 }}>{s.short}</Label>
                <div style={{ fontFamily: KONE_INFO, fontSize: 22, color: KONE.black,
                              marginTop: 2 }}>
                  {s.median_days == null ? '—' : `${s.median_days}d`}
                </div>
              </div>
            ))}
          </div>
          <Label style={{ marginTop: 14, marginBottom: 6 }}>Open over 30 days</Label>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            {(data?.oldest_open ?? []).slice(0, 5).map(r => (
              <span key={r.area} style={{ fontFamily: INTER, fontSize: 12,
                                          color: KONE.black60 }}
                    title={`oldest ${r.oldest_days} days`}>
                {r.area}{' '}
                <b style={{ fontFamily: KONE_INFO, color: KONE.black }}>{r.count}</b>
              </span>
            ))}
            {!(data?.oldest_open ?? []).length && (
              <span style={{ fontFamily: INTER, fontSize: 12, color: KONE.black60 }}>
                Nothing open beyond 30 days
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
        padding: '18px 26px 20px', marginTop: 16, borderTop: `1px solid ${KONE.hairline}`,
      }}>
        <Label>{span || 'No data'}</Label>
        <Label>Source: ServiceNow export · Feedback sheet</Label>
      </div>
    </div>
  )
}
