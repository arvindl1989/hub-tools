import { useEffect, useMemo, useState } from 'react'
import { getFeedback, getKpi3d, getOverview, getUserMetrics } from '../api'
import KoneWorld from '../components/KoneWorld'
import VolumeField from '../components/VolumeField'
import { INTER, KONE_FONT } from '../components/KoneUI'

// ── A board for a room, not a desk ───────────────────────────────────────────
// Two ways of looking at the same upload. The World puts the hub inside a KONE
// building — a floor per area, the three headline rates riding the lift bank,
// and the escalators at the front carrying work in and out. The Field is the
// year laid flat: months across, areas deep, volume as height.
//
// Everything on both comes from the tabs that already exist. There is no second
// source of truth here, only a second way of looking, and anything the shapes
// cannot say exactly is written in figures in the panel beside them.

const BLUE = '#1450f5'
const SAND = '#F3EEE6'
const DIM = '#9c9c9c'
const GREEN = '#5fd0a0'
const PINK = '#ff8aa4'

const MONTH_CHOICES = [6, 12, 18]

function Figure({ label, value, suffix, tone = '#ffffff', note }) {
  return (
    <div style={{
      flex: 1, minWidth: 0, background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10,
      padding: '16px 20px',
    }}>
      <div style={{
        fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', color: DIM,
        textTransform: 'uppercase', fontFamily: INTER,
      }}>{label}</div>
      <div style={{
        fontFamily: KONE_FONT, fontSize: 44, fontWeight: 700, color: tone,
        lineHeight: 1.1, marginTop: 6, letterSpacing: '-0.02em',
      }}>
        {value}
        {suffix && (
          <span style={{ fontSize: 18, fontWeight: 600, color: DIM, marginLeft: 8 }}>
            {suffix}
          </span>
        )}
      </div>
      {note && (
        <div style={{ fontSize: 12, color: DIM, marginTop: 6, fontFamily: INTER }}>{note}</div>
      )}
    </div>
  )
}

// ── Raised against closed, flat ──────────────────────────────────────────────
// This was a row inside the 3D field and it did not belong there: a month's
// closures are a different total from one area's raises, so the sand bar stood
// three times the height of anything around it and invited a comparison that
// is not one. Here the two sit on the same scale as each other, and nothing
// else, which is the only way the gap between them means anything.
function TrendStrip({ trend = [] }) {
  const peak = Math.max(1, ...trend.map(t => Math.max(t.raised, t.closed)))
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 86 }}>
      {trend.map(t => (
        <div key={t.key} style={{ flex: 1, minWidth: 0, textAlign: 'center' }}
             title={`${t.label}: ${t.raised} raised, ${t.closed} closed`}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                        gap: 3, height: 58 }}>
            <div style={{ width: '42%', maxWidth: 16, background: BLUE,
                          height: `${(t.raised / peak) * 100}%`, borderRadius: '2px 2px 0 0',
                          minHeight: t.raised ? 2 : 0 }} />
            <div style={{ width: '42%', maxWidth: 16, background: SAND,
                          height: `${(t.closed / peak) * 100}%`, borderRadius: '2px 2px 0 0',
                          minHeight: t.closed ? 2 : 0 }} />
          </div>
          <div style={{ fontSize: 10, color: DIM, fontFamily: INTER, marginTop: 6,
                        whiteSpace: 'nowrap' }}>{t.label}</div>
        </div>
      ))}
    </div>
  )
}

// ── What the building cannot say exactly ─────────────────────────────────────
// A lift car's height and a floor's width are comparisons, not readings. The
// panel is where the actual numbers live, and it changes with whatever was
// last clicked.
function Panel({ selection, world }) {
  const Row = ({ k, v, tone }) => (
    <div style={{
      display: 'flex', justifyContent: 'space-between', gap: 12,
      padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.07)',
    }}>
      <span style={{ fontSize: 12, color: DIM, fontFamily: INTER }}>{k}</span>
      <span style={{
        fontSize: 13, color: tone || '#fff', fontWeight: 700, fontFamily: KONE_FONT,
        whiteSpace: 'nowrap',
      }}>{v}</span>
    </div>
  )

  let title = 'The hub'
  let sub = 'Click a floor or a lift car'
  let rows = []

  if (selection?.kind === 'floor') {
    title = selection.name
    sub = `Floor ${(world.floors ?? []).findIndex(f => f.key === selection.key) + 1} of `
        + `${(world.floors ?? []).length} — an area of the business`
    rows = [
      ['Requests raised', selection.requests?.toLocaleString() ?? '—'],
      ['People who raised them', selection.users?.toLocaleString() ?? '—'],
      ['Utility rate', selection.utility == null ? '—' : `${selection.utility}%`],
      ['Requests per person', selection.perUser ?? '—'],
      ['Feedback score', selection.score == null ? 'No responses'
        : `${selection.score.toFixed(2)} / ${world.scaleMax ?? 5}`],
      ['Responses', selection.responses?.toLocaleString() ?? '0'],
    ]
  } else if (selection?.kind === 'kpi') {
    title = selection.label
    sub = selection.where
    rows = [
      ['Reading', selection.value == null ? '—' : `${Math.round(selection.value)}%`],
      ...(selection.detail ?? []),
    ]
  } else {
    rows = [
      ['Requests in the window', world.summary?.requests?.toLocaleString() ?? '—'],
      ['People who raised them', world.summary?.users?.toLocaleString() ?? '—'],
      ['Open right now', world.summary?.open?.toLocaleString() ?? '—'],
      ['Average age of open work', world.summary?.avgAge == null ? '—'
        : `${world.summary.avgAge} days`],
      ['Feedback responses', world.summary?.responses?.toLocaleString() ?? '—'],
      ['Areas in the building', (world.floors ?? []).length],
    ]
  }

  return (
    <div style={{
      width: 300, flexShrink: 0, background: 'rgba(255,255,255,0.035)',
      border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10,
      padding: '18px 20px', alignSelf: 'stretch', overflowY: 'auto',
    }}>
      <div style={{
        fontFamily: KONE_FONT, fontSize: 21, fontWeight: 700, color: '#fff',
        letterSpacing: '-0.01em',
      }}>{title}</div>
      <div style={{ fontSize: 12, color: DIM, marginTop: 5, marginBottom: 10,
                    fontFamily: INTER, lineHeight: 1.5 }}>{sub}</div>
      {rows.map(([k, v, tone]) => <Row key={k} k={k} v={v} tone={tone} />)}
      {selection?.note && (
        <div style={{ fontSize: 11, color: '#7e7e8a', marginTop: 12, fontFamily: INTER,
                      lineHeight: 1.6 }}>{selection.note}</div>
      )}
    </div>
  )
}

export default function ThreeDDashboardPage({ sessionId, onSessionExpired }) {
  const [view, setView] = useState('world')
  const [data, setData] = useState(null)        // the field's figures
  const [extra, setExtra] = useState(null)      // overview + activity + feedback
  const [error, setError] = useState(null)
  const [months, setMonths] = useState(12)
  const [paused, setPaused] = useState(false)
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

  // The building needs three tabs' worth of figures. They are fetched in
  // parallel and each is allowed to fail on its own: no feedback sheet should
  // mean a building without a satisfaction car, not an empty screen.
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
  const net = useMemo(() => (h.closed ?? 0) - (h.requests ?? 0), [h])
  const span = useMemo(() => {
    const first = data?.months?.[0]
    const last = data?.months?.[(data?.months?.length ?? 1) - 1]
    if (!first || !last) return ''
    return `${first.label} ${first.year} — ${last.label} ${last.year}`
  }, [data])

  // ── The building, assembled from the three tabs ────────────────────────────
  const world = useMemo(() => {
    const ov = extra?.overview
    const ua = extra?.activity
    const fb = extra?.feedback
    const scoreOf = {}
    const countOf = {}
    for (const r of fb?.by_area ?? []) {
      scoreOf[r.area] = r.avg_score
      countOf[r.area] = r.count
    }

    const floors = [...(ua?.activity_groups?.by_area ?? [])]
      // Busiest at the bottom: a building carries its weight low down, and
      // the widest block belongs on the ground floor rather than the roof.
      .sort((a, b) => b.requests - a.requests)
      .map(a => ({
        key: a.name,
        name: a.name,
        requests: a.requests,
        users: a.users,
        utility: a.utility_pct,
        perUser: a.requests_per_user,
        score: scoreOf[a.name] ?? null,
        responses: countOf[a.name] ?? 0,
      }))

    const openNow = ov?.total_active ?? 0
    const onTime = openNow ? ((openNow - (ov?.overdue_sla ?? 0)) / openNow) * 100 : null
    const engagement = ua?.rates?.engagement_pct ?? null
    const satisfaction = fb?.avg_score != null && fb?.scale_max
      ? (fb.avg_score / fb.scale_max) * 100 : null

    const kpis = [
      {
        key: 'ontime', short: 'ON TIME', label: 'Open work still inside SLA',
        value: onTime, tone: BLUE, where: 'From the Dashboard',
        detail: [
          ['Open right now', (ov?.total_active ?? 0).toLocaleString()],
          ['Already overdue', (ov?.overdue_sla ?? 0).toLocaleString()],
          ['Due within five days', (ov?.due_within_5 ?? 0).toLocaleString()],
        ],
        note: 'The share of what is open today that has not yet passed its SLA date. '
            + 'It says nothing about work already closed.',
      },
      {
        key: 'engaged', short: 'ENGAGED', label: 'Engagement rate',
        value: engagement, tone: GREEN, where: 'From User Activity',
        detail: [
          ['Active users', (ua?.lifecycle?.active?.length ?? 0).toLocaleString()],
          ['Regular users', (ua?.lifecycle?.regular?.length ?? 0).toLocaleString()],
          ['Dormant users', (ua?.lifecycle?.dormant?.length ?? 0).toLocaleString()],
        ],
        note: 'Active plus Regular over every user — everyone whose last request '
            + 'was inside the dormancy window.',
      },
      {
        key: 'happy', short: 'SCORE', label: 'Feedback score',
        value: satisfaction, tone: SAND, where: 'From Feedback',
        detail: [
          ['Average', fb?.avg_score == null ? '—'
            : `${fb.avg_score.toFixed(2)} / ${fb.scale_max ?? 5}`],
          ['Responses', (fb?.rated ?? 0).toLocaleString()],
          ['Response rate', fb?.feedback_rate == null ? '—' : `${fb.feedback_rate}%`],
          ['Top marks', fb?.five_star_pct == null ? '—' : `${fb.five_star_pct}%`],
        ],
        note: 'The average score as a share of the top of the scale, so it can ride '
            + 'the same shaft scale as the other two.',
      },
    ]

    // The escalators run at the rate work actually arrived and left. The
    // busier of the two is pinned to a readable speed and the other is scaled
    // against it, so the gap between them is the thing you see.
    const trend = data?.trend ?? []
    const avg = (k) => (trend.length
      ? trend.reduce((s, t) => s + (t[k] ?? 0), 0) / trend.length : 0)
    const inAvg = avg('raised')
    const outAvg = avg('closed')
    const top = Math.max(inAvg, outAvg, 1)

    return {
      floors,
      kpis,
      scaleMax: fb?.scale_max ?? 5,
      flow: {
        inSpeed: 0.1 + (inAvg / top) * 0.4,
        outSpeed: 0.1 + (outAvg / top) * 0.4,
        inAvg: Math.round(inAvg),
        outAvg: Math.round(outAvg),
      },
      summary: {
        requests: h.requests,
        users: h.users,
        open: ov?.total_active,
        avgAge: ov?.avg_age,
        responses: fb?.rated,
      },
    }
  }, [extra, data, h])

  const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString())
  const worldReady = !!extra && (world.floors.length > 0 || !!extra.activity)

  const tab = (id, label) => (
    <button
      key={id}
      onClick={() => { setView(id); setSelection(null) }}
      style={{
        background: view === id ? BLUE : 'transparent',
        color: view === id ? '#fff' : DIM,
        border: `1px solid ${view === id ? BLUE : 'rgba(255,255,255,0.15)'}`,
        borderRadius: 7, padding: '7px 16px', fontSize: 12, fontWeight: 700,
        fontFamily: INTER, cursor: 'pointer',
      }}
    >{label}</button>
  )

  return (
    <div style={{
      background: '#101010', borderRadius: 12, overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
      border: '1px solid #1f1f1f',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        gap: 20, padding: '22px 26px 0', flexWrap: 'wrap',
      }}>
        <div>
          <div style={{
            fontFamily: KONE_FONT, fontSize: 26, fontWeight: 700, color: '#fff',
            letterSpacing: '-0.01em',
          }}>
            Digital Marketing Hub — {view === 'world' ? 'The Building' : 'Request Volume'}
          </div>
          <div style={{ fontSize: 13, color: DIM, marginTop: 6, fontFamily: INTER }}>
            {view === 'world'
              ? 'A floor per area, the headline rates on the lifts, work in and out on the escalators'
              : span}
            {h.period_end && <span> · newest request {h.period_end}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {tab('world', 'World')}
          {tab('field', 'Volume field')}
          <span style={{ width: 10 }} />
          {view === 'field' && MONTH_CHOICES.map(m => (
            <button
              key={m}
              onClick={() => setMonths(m)}
              style={{
                background: m === months ? BLUE : 'transparent',
                color: m === months ? '#fff' : DIM,
                border: `1px solid ${m === months ? BLUE : 'rgba(255,255,255,0.15)'}`,
                borderRadius: 7, padding: '7px 14px', fontSize: 12, fontWeight: 700,
                fontFamily: INTER, cursor: 'pointer',
              }}
            >{m} months</button>
          ))}
          <button
            onClick={() => setPaused(p => !p)}
            title="The view turns on its own until you hold it"
            style={{
              background: 'transparent', color: DIM,
              border: '1px solid rgba(255,255,255,0.15)', borderRadius: 7,
              padding: '7px 14px', fontSize: 12, fontWeight: 700, fontFamily: INTER,
              cursor: 'pointer',
            }}
          >{paused ? 'Rotate' : 'Hold'}</button>
        </div>
      </div>

      {/* The four figures the room is meant to read */}
      <div style={{ display: 'flex', gap: 12, padding: '18px 26px 0', flexWrap: 'wrap' }}>
        <Figure label="Requests raised" value={fmt(h.requests)}
                note={`${fmt(h.users)} people`} />
        <Figure label="Closed" value={fmt(h.closed)} tone={SAND}
                note="In the same window" />
        <Figure
          label={net >= 0 ? 'Backlog drained by' : 'Backlog grew by'}
          value={fmt(Math.abs(net))}
          tone={net >= 0 ? GREEN : PINK}
          note="Closed less raised" />
        <Figure label="Open now" value={fmt(h.open)}
                note={h.median_open_age != null
                  ? `Median age ${fmt(h.median_open_age)} days`
                  : 'Nothing open'} />
      </div>

      {/* The view */}
      <div style={{
        display: 'flex', gap: 12, padding: '14px 16px 0',
        height: 'clamp(420px, 56vh, 680px)',
      }}>
        <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
          {error && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
              justifyContent: 'center', color: PINK, fontFamily: INTER, fontSize: 14,
            }}>{error}</div>
          )}
          {!error && view === 'field' && !data && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
              justifyContent: 'center', color: DIM, fontFamily: INTER, fontSize: 14,
            }}>Building the field…</div>
          )}
          {!error && view === 'field' && data && <VolumeField data={data} paused={paused} />}

          {!error && view === 'world' && !worldReady && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
              justifyContent: 'center', color: DIM, fontFamily: INTER, fontSize: 14,
            }}>Putting up the building…</div>
          )}
          {!error && view === 'world' && worldReady && (
            <KoneWorld world={world} selected={selection} onPick={setSelection}
                       paused={paused} />
          )}
        </div>

        {view === 'world' && worldReady && <Panel selection={selection} world={world} />}
      </div>

      {/* Inflow against outflow, month by month */}
      <div style={{ padding: '10px 26px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8,
                      flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: DIM, fontFamily: INTER, letterSpacing: '0.05em' }}>
            RAISED vs CLOSED
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 14, height: 9, borderRadius: 2, background: BLUE }} />
            <span style={{ fontSize: 11, color: DIM, fontFamily: INTER }}>raised</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 14, height: 9, borderRadius: 2, background: SAND }} />
            <span style={{ fontSize: 11, color: DIM, fontFamily: INTER }}>closed</span>
          </span>
          {view === 'world' && (
            <span style={{ fontSize: 11, color: '#6e6e6e', fontFamily: INTER }}>
              The escalators run at these rates — {world.flow?.inAvg ?? 0} in and{' '}
              {world.flow?.outAvg ?? 0} out in an average month
            </span>
          )}
        </div>
        <TrendStrip trend={data?.trend ?? []} />
      </div>

      {/* Legend and the service split */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 24, padding: '10px 26px 22px', flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          {view === 'field' ? (
            <>
              <span style={{ fontSize: 11, color: DIM, fontFamily: INTER,
                             letterSpacing: '0.05em' }}>HEIGHT = REQUESTS</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {['#d0dcfd', '#a1b9fb', '#7296f9', '#4373f7', '#1450f5'].map(c => (
                  <span key={c} style={{ width: 22, height: 9, borderRadius: 2, background: c }} />
                ))}
                <span style={{ fontSize: 11, color: DIM, fontFamily: INTER, marginLeft: 4 }}>
                  by area
                </span>
              </span>
              <span style={{ fontSize: 11, color: '#6e6e6e', fontFamily: INTER }}>
                Drag to turn · hover a bar for its number
              </span>
            </>
          ) : (
            <span style={{ fontSize: 11, color: '#6e6e6e', fontFamily: INTER }}>
              Drag to walk around · click a floor or a lift car · click away to clear
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 22 }}>
          {(data?.services ?? []).map(s => (
            <div key={s.service} title={s.service}>
              <div style={{ fontSize: 11, color: DIM, fontFamily: INTER, letterSpacing: '0.05em' }}>
                {s.short}
              </div>
              <div style={{
                fontFamily: KONE_FONT, fontSize: 22, fontWeight: 700, color: '#fff',
                marginTop: 2,
              }}>{fmt(s.count)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
