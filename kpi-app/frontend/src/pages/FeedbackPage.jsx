import { useEffect, useState, useCallback, useRef } from 'react'
import { getFeedback } from '../api'
import DateRangePicker from '../components/DateRangePicker'
import { PALETTE } from '../utils/colors'

// ── Score → KONE sentiment colors ─────────────────────────────────────────────
function scoreTone(score, max = 5) {
  if (score == null) return { fg: '#6e6e6e', bg: '#f1ede3', bar: '#9c9c9c' }
  const r = score / max
  if (r >= 0.9)  return { fg: '#0f5132', bg: '#aae1c8', bar: '#1e8a5e' }
  if (r >= 0.7)  return { fg: '#1e8a5e', bg: '#d3efe0', bar: '#1e8a5e' }
  if (r >= 0.5)  return { fg: '#7a5400', bg: '#ffe141', bar: '#b87d00' }
  return { fg: '#8c1a2e', bg: '#ffcdd7', bar: '#c0305a' }
}

// Sentiment colors for the Promoters/Passives/Detractors boxes, reused as
// text color for every rating badge on the page (By Frontlines, By Area,
// Feedback by Service, Feedback by Specialist) — the badge itself stays
// white, only the number's color signals promoter/passive/detractor.
// Scale: 1-2 detractor, 3 passive, 4-5 promoter (see main.py's _nps_bucket).
const NPS_BUCKET_STYLES = {
  promoter:  { fg: '#0f5132', bg: '#aae1c8' },
  passive:   { fg: '#7a5400', bg: '#ffe141' },
  detractor: { fg: '#8c1a2e', bg: '#ffcdd7' },
}
function bucketTone(score, max = 5) {
  if (score == null) return { fg: '#6e6e6e' }
  const r = Math.round(score)
  const detractorMax = Math.round(max * 0.4)
  const promoterMin = Math.round(max * 0.6) + 1
  if (r >= promoterMin) return NPS_BUCKET_STYLES.promoter
  if (r <= detractorMax) return NPS_BUCKET_STYLES.detractor
  return NPS_BUCKET_STYLES.passive
}

// One fixed-size pill for every rating badge on the page (By Frontlines, By
// Area, Feedback by Service, Feedback by Specialist) — `display: inline-block`
// + an explicit width so it renders identically whether it's a flex child
// (the two ranked lists) or sitting inside a plain table cell (the two
// tables), which a bare padded <span> would size inconsistently between the two.
const ratingBadgeStyle = (t) => ({
  display: 'inline-block', width: 40, textAlign: 'center',
  fontSize: 12, fontWeight: 700, color: t.fg, background: t.bg ?? '#f1ede3',
  borderRadius: 2, padding: '3px 8px', fontFamily: KONE_FONT,
})

// Shared cap for By Frontlines / By Area / Feedback by Service / Feedback by
// Specialist — whichever of the four has more rows would otherwise stretch
// its card taller than the others (CSS Grid then stretches every card in
// that row to match, leaving the shorter ones full of empty space). Capping
// all four at the same height with an internal scroll keeps every one the
// same size regardless of how many rows it actually has.
const PANEL_MAX_HEIGHT = 320

// Average scores are rounded to one decimal everywhere they're displayed —
// done on the frontend (not just backend rounding) so a value that lands on
// a whole number still reads "4.0" instead of silently dropping to "4".
const fmt1 = (v) => (v == null ? null : v.toFixed(1))

// KONE Information — the brand's secondary typeface, self-hosted (see index.css).
// Used for KONE-style figures (big numbers); body/sentence text stays on
// Inter per brand rule. Card titles (the 6 metric cards + the Hub Feedback
// Score boxes) use Inter Semibold instead, per explicit request — bigger and
// bolder than the default eyebrow-label size used elsewhere on this page.
const KONE_FONT = "'KONE Information', 'Inter', sans-serif"
const cardHeadingStyle = (color) => ({
  fontSize: 13, fontWeight: 600, letterSpacing: '0.02em', color,
  textTransform: 'uppercase', fontFamily: "'Inter', sans-serif",
})

// Filter-dropdown allowlist only — never applied to the underlying data, so
// charts/tables/Feedback Entries keep showing every specialist regardless.
// Keeps the Specialist filter lean without losing anyone's numbers.
const ALLOWED_SPECIALISTS = [
  'Ajith A',
  'Akshaya Praveen',
  'Akshayaa Rajeswari AS',
  'Arvind Lakshminarayanan',
  'Nitish JK',
  'Ranjithkumar Ashokkumar',
]

// Feedback tab wants a leaner date filter than the Dashboard's — just
// "All time", the By Period dropdown, and the raw calendar inputs.
const ALL_TIME_PRESET = [{ label: 'All time', from: '', to: '' }]

const PARAM_LABELS = {
  overall: 'Overall', quality: 'Quality',
  timeliness: 'Timeliness', interaction: 'Interaction',
}
// Fixed card order for the four rating-parameter metrics, regardless of which
// columns the sheet actually has — missing ones render as a dashed placeholder.
const ORDERED_PARAMS = ['overall', 'quality', 'timeliness', 'interaction']

// ── Hover tooltip helpers ─────────────────────────────────────────────────────
function useTooltip() {
  const [tip, setTip] = useState(null)
  const wrapRef = useRef(null)
  const show = (e, lines) => {
    const r = wrapRef.current?.getBoundingClientRect()
    if (!r) return
    setTip({ x: e.clientX - r.left, y: e.clientY - r.top, lines })
  }
  const hide = () => setTip(null)
  return { tip, wrapRef, show, hide }
}

function Tooltip({ tip }) {
  if (!tip) return null
  const flip = tip.x > 420
  return (
    <div style={{
      position: 'absolute',
      left: flip ? undefined : tip.x + 12,
      right: flip ? `calc(100% - ${tip.x}px + 12px)` : undefined,
      top: Math.max(0, tip.y - 14),
      background: '#141414', color: '#fff', borderRadius: 8,
      padding: '8px 11px', fontSize: 11.5, lineHeight: 1.55,
      pointerEvents: 'none', zIndex: 10, whiteSpace: 'nowrap',
      boxShadow: '0 4px 14px rgba(20,20,20,0.25)',
    }}>
      {tip.lines.map((l, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: i === 0 ? 700 : 400 }}>
          {l.swatch && <span style={{ width: 8, height: 8, borderRadius: 2, background: l.swatch, flexShrink: 0 }} />}
          <span>{l.text ?? l}</span>
        </div>
      ))}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function FeedbackPage({ sessionId }) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  const [range,   setRange]   = useState({ from: '', to: '' })
  const [service, setService] = useState('')
  const [area,    setArea]    = useState('')
  const [fl,      setFl]      = useState('')
  const [user,    setUser]    = useState('')
  const [groupBy, setGroupBy] = useState('week')
  const [splitByUser, setSplitByUser] = useState(false)

  // Feedback Entries has its own independent Specialist/Service filters
  const [entriesUser,    setEntriesUser]    = useState('')
  const [entriesService, setEntriesService] = useState('')

  const reqRef = useRef(0)
  const load = useCallback((refresh = false) => {
    const id = ++reqRef.current
    setLoading(true)
    setError(null)
    getFeedback({
      dateFrom: range.from, dateTo: range.to, user, service, area, fl, groupBy, refresh,
      sid: sessionId, entriesUser, entriesService,
    })
      .then(d => { if (id === reqRef.current) { setData(d); setLoading(false) } })
      .catch(e => {
        if (id !== reqRef.current) return
        setError(e?.response?.data?.detail || e?.message || 'Could not load feedback')
        setLoading(false)
      })
  }, [range.from, range.to, user, service, area, fl, groupBy, sessionId, entriesUser, entriesService])

  useEffect(() => { load() }, [load])

  const scaleMax = data?.scale_max ?? 5
  const specialists = ALLOWED_SPECIALISTS.filter(a => (data?.users ?? []).includes(a))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#141414', margin: 0, letterSpacing: '-0.02em' }}>Feedback</h2>
          {(service || area || fl || user) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              {[service, area, fl, user].filter(Boolean).map((v) => (
                <span key={v} style={activeFilterPillStyle}>{v}</span>
              ))}
            </div>
          )}
        </div>
        <button className="btn-secondary" onClick={() => load(true)} title="Re-fetch the sheet">
          ⟳ Refresh sheet
        </button>
      </div>

      {/* Filters */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8e2d6', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#6e6e6e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Filters</span>
        <select value={service} onChange={e => setService(e.target.value)} style={selStyle}>
          <option value="">All Services</option>
          {(data?.services ?? []).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={area} onChange={e => setArea(e.target.value)} style={selStyle}>
          <option value="">All Areas</option>
          {(data?.areas ?? []).map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={fl} onChange={e => setFl(e.target.value)} style={selStyle}>
          <option value="">All Frontlines</option>
          {(data?.fl_segments ?? []).map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        <select value={user} onChange={e => setUser(e.target.value)} style={selStyle}>
          <option value="">All Specialists</option>
          {specialists.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
        <DateRangePicker dateFrom={range.from} dateTo={range.to} onChange={(from, to) => setRange({ from, to })} presets={ALL_TIME_PRESET} />
        {(user || service || area || fl || range.from || range.to) && (
          <button
            onClick={() => { setUser(''); setService(''); setArea(''); setFl(''); setRange({ from: '', to: '' }) }}
            style={{ border: 'none', background: 'none', color: '#c0305a', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}
          >
            Reset all
          </button>
        )}
      </div>

      {error && (
        <div style={{ background: '#ffdee5', border: '1px solid #ffcdd7', color: '#8c1a2e', borderRadius: 12, padding: '14px 18px', fontSize: 13 }}>
          <b>Could not load the feedback sheet.</b> {String(error)}
        </div>
      )}

      {loading && !data && (
        <div style={{ padding: 60, textAlign: 'center', color: '#9c9c9c', fontSize: 13 }}>Loading feedback…</div>
      )}

      {data && (<>

        {/* Feedback Score — sits above the 6 metric cards */}
        <FeedbackScoreBadge nps={data.nps} />

        {/* 6 metric cards: Total, Rate, Overall/Quality/Timeliness/Interaction */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <div style={{ background: '#1450f5', borderRadius: 8, padding: '18px 20px', boxShadow: '0 1px 3px rgba(20,20,20,0.06)' }}>
            <div style={cardHeadingStyle('rgba(255,255,255,0.8)')}>Total Feedback</div>
            <div style={{ fontSize: 34, fontWeight: 700, color: '#fff', lineHeight: 1, marginTop: 8, letterSpacing: '-0.01em', fontFamily: KONE_FONT }}>{data.total}</div>
          </div>

          <FeedbackRateCard rate={data.feedback_rate} />

          {ORDERED_PARAMS.map(k => (
            <FiveStarCard
              key={k}
              label={PARAM_LABELS[k]}
              avg={data.param_avgs?.[k] ?? (k === 'overall' ? data.avg_score : null)}
              scaleMax={scaleMax}
            />
          ))}
        </div>

        {/* Promoters / Passives / Detractors */}
        <NpsBuckets nps={data.nps} />

        {/* By Frontlines + By Area */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Card title="By Frontlines" subtitle="Volume and average score per FL segment — every segment shown, even at 0">
            {data.has_fl_segment
              ? <RankedList rows={data.by_fl} labelKey="fl_segment" scaleMax={scaleMax} />
              : <Empty text={'No "FL" column detected in the sheet'} />}
          </Card>
          <Card title="By Area" subtitle="Volume and average score per area">
            {data.has_area
              ? <RankedList rows={data.by_area} labelKey="area" scaleMax={scaleMax} />
              : <ConnectTicketsNote />}
          </Card>
        </div>

        {/* Feedback by Service + Feedback by Specialist */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 16 }}>
          <Card title="Feedback by Service"
            subtitle="Feedbacks, tickets, feedback rate and rating per service">
            <ServiceBreakdown rows={data.by_service} paramKeys={data.param_keys ?? []} scaleMax={scaleMax} onPick={s => setService(s === service ? '' : s)} active={service} />
          </Card>
          <Card title="Feedback by Specialist"
            subtitle="Feedbacks, tickets, feedback rate and rating per specialist · click a row to focus on that person">
            <UserTable rows={data.by_user} paramKeys={data.param_keys ?? []} scaleMax={scaleMax} onPick={u => setUser(u === user ? '' : u)} active={user} />
          </Card>
        </div>

        {/* Score Distribution — rows = star level, columns = rating parameter */}
        <Card title="Score Distribution" subtitle="How many feedbacks gave each star rating, per parameter">
          <ScoreDistributionTable distributions={data.distributions} paramKeys={data.param_keys ?? []} scaleMax={scaleMax} />
        </Card>

        {/* Feedback Entries — full width, own Specialist/Service filters */}
        <Card title="Feedback Entries"
          subtitle={`${data.entries.length} entries · newest to oldest${range.from || range.to ? ' · within the selected date range' : ''}`}
          controls={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <select value={entriesUser} onChange={e => setEntriesUser(e.target.value)} style={selStyle}>
                <option value="">All Specialists</option>
                {(data.users ?? []).map(u => <option key={u} value={u}>{u}</option>)}
              </select>
              <select value={entriesService} onChange={e => setEntriesService(e.target.value)} style={selStyle}>
                <option value="">All Services</option>
                {(data.services ?? []).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              {(entriesUser || entriesService) && (
                <button
                  onClick={() => { setEntriesUser(''); setEntriesService('') }}
                  style={{ border: 'none', background: 'none', color: '#c0305a', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}
                >
                  Reset
                </button>
              )}
            </div>
          }>
          <RecentList rows={data.entries} scaleMax={scaleMax} />
        </Card>

        {/* Feedback Inflow + Average Score Trend */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 16 }}>
          <Card title="Feedback Inflow" subtitle={`Feedbacks received per ${groupBy}`}
            controls={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={() => setSplitByUser(v => !v)}
                  style={{
                    padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    fontFamily: 'Inter, sans-serif', borderRadius: 8,
                    border: `1px solid ${splitByUser ? '#1450f5' : '#e8e2d6'}`,
                    background: splitByUser ? '#eef3fe' : '#fff',
                    color: splitByUser ? '#1450f5' : '#6e6e6e',
                  }}
                >
                  ⫽ Split by specialist
                </button>
                <div style={{ display: 'flex', borderRadius: 8, border: '1px solid #e8e2d6', overflow: 'hidden' }}>
                  {['week', 'month'].map(g => (
                    <button key={g} onClick={() => setGroupBy(g)} style={{
                      padding: '5px 12px', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
                      fontFamily: 'Inter, sans-serif',
                      background: groupBy === g ? '#1450f5' : '#fff',
                      color: groupBy === g ? '#fff' : '#6e6e6e',
                    }}>
                      {g === 'week' ? 'Weekly' : 'Monthly'}
                    </button>
                  ))}
                </div>
              </div>
            }>
            <InflowBars data={data.by_period} users={data.users} stacked={splitByUser} />
          </Card>
          <Card title="Average Score Trend" subtitle={`Mean rating per ${groupBy} — hover for values`}>
            <ScoreTrend data={data.by_period} max={scaleMax} />
          </Card>
        </div>

      </>)}
    </div>
  )
}

const selStyle = {
  height: 30, padding: '0 8px', fontSize: 12, color: '#404040',
  border: '1px solid #e8e2d6', borderRadius: 7, outline: 'none',
  background: '#fff', cursor: 'pointer', fontFamily: 'Inter, sans-serif', maxWidth: 220,
}

// Matches the filter bar's active "All time" pill exactly, so an active
// filter shown up in the header reads the same way as one shown down there.
const activeFilterPillStyle = {
  padding: '5px 10px', fontSize: 12, fontWeight: 500, fontFamily: 'Inter, sans-serif',
  border: '1px solid #1450f5', borderRadius: 7, background: '#1450f5', color: '#fff',
}

// ── Card shell (matches the rest of the app) ──────────────────────────────────
function Card({ title, subtitle, controls, children }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 12, border: '1px solid #e8e2d6',
      boxShadow: '0 1px 3px rgba(20,20,20,0.04), 0 4px 12px rgba(20,20,20,0.03)',
      minWidth: 0,
    }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1ede3', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: '#141414', margin: 0 }}>{title}</h3>
          {subtitle && <p style={{ fontSize: 11, color: '#9c9c9c', margin: '2px 0 0' }}>{subtitle}</p>}
        </div>
        {controls}
      </div>
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  )
}

// ── Feedback Rate card (feedbacks ÷ tickets, needs ticket-session join) ───────
// Blue box, white text — matches Total Feedback. One line, one consistent
// size throughout (no big-number/small-suffix split): "18% (or) 1 in 5
// tickets", all KONE Information.
function FeedbackRateCard({ rate }) {
  const text = rate?.pct != null
    ? `${rate.pct}%${rate.ratio > 1 ? ` (or) 1 in ${rate.ratio} tickets` : ''}`
    : '—'
  return (
    <div style={{ background: '#1450f5', borderRadius: 8, padding: '18px 20px', boxShadow: '0 1px 3px rgba(20,20,20,0.06)' }}>
      <div style={cardHeadingStyle('rgba(255,255,255,0.8)')}>Feedback Rate</div>
      <div style={{ marginTop: 8 }}>
        <span style={{ fontSize: 34, fontWeight: 700, color: '#fff', lineHeight: 1, letterSpacing: '-0.01em', fontFamily: KONE_FONT }}>
          {text}
        </span>
      </div>
    </div>
  )
}

// ── One of the four rating-parameter cards — average score out of scaleMax ────
// Blue box, white text — matches Total Feedbacks.
function FiveStarCard({ label, avg, scaleMax }) {
  return (
    <div style={{ background: '#1450f5', borderRadius: 8, padding: '18px 20px', boxShadow: '0 1px 3px rgba(20,20,20,0.06)' }}>
      <div style={cardHeadingStyle('rgba(255,255,255,0.8)')}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
        <span style={{ fontSize: 34, fontWeight: 700, color: '#fff', lineHeight: 1, letterSpacing: '-0.01em', fontFamily: KONE_FONT }}>
          {fmt1(avg) ?? '—'}
        </span>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.75)', fontFamily: KONE_FONT }}>/ {scaleMax}</span>
      </div>
    </div>
  )
}

// ── Feedback Score badge — standalone, sits above the 6 metric cards ──────────
function FeedbackScoreBadge({ nps }) {
  if (!nps || nps.score == null) return null
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: '#1450f5', background: '#eef3fe', borderRadius: 8, padding: '5px 12px', fontFamily: KONE_FONT }}>
        FEEDBACK SCORE {nps.score > 0 ? '+' : ''}{fmt1(nps.score)}
      </span>
    </div>
  )
}

// ── Promoters / Passives / Detractors ──────────────────────────────────────────
// Each bucket keeps its own sentiment color (mint/yellow/pink) across the
// whole box; the Top 3 list is a direct extension of that same box (one
// card, not two), separated only by a hairline.
function NpsBuckets({ nps }) {
  if (!nps) return null
  const buckets = [
    { key: 'promoters',  label: 'Promoters',  count: nps.promoters,  items: nps.top_promoters,  ...NPS_BUCKET_STYLES.promoter },
    { key: 'passives',   label: 'Passives',   count: nps.passives,   items: nps.top_passives,   ...NPS_BUCKET_STYLES.passive },
    { key: 'detractors', label: 'Detractors', count: nps.detractors, items: nps.top_detractors, ...NPS_BUCKET_STYLES.detractor },
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
      {buckets.map(b => (
        <div key={b.key} style={{ background: b.bg, borderRadius: 8 }}>
          <div style={{ padding: '16px 18px' }}>
            <div style={cardHeadingStyle(b.fg)}>{b.label}</div>
            <div style={{ fontSize: 30, fontWeight: 700, color: b.fg, lineHeight: 1, marginTop: 8, fontFamily: KONE_FONT }}>{b.count}</div>
          </div>
          <div style={{ borderTop: '1px solid rgba(0,0,0,0.12)', padding: '14px 18px' }}>
            <div style={{ ...cardHeadingStyle(b.fg), opacity: 0.75, marginBottom: 10 }}>Top 3</div>
            {!b.items?.length ? (
                <div style={{ fontSize: 12, color: b.fg, opacity: 0.6 }}>No data</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {b.items.map((it, i) => (
                    <div key={it.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{
                        width: 20, height: 20, borderRadius: '50%', background: 'rgba(255,255,255,0.55)', color: b.fg,
                        fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        fontFamily: KONE_FONT,
                      }}>{i + 1}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: b.fg, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name}</div>
                        {it.fl && <div style={{ fontSize: 10.5, color: b.fg, opacity: 0.7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.fl}</div>}
                      </div>
                      <span style={{ fontSize: 12, color: b.fg, opacity: 0.85, flexShrink: 0, fontFamily: KONE_FONT }}>{it.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
  )
}

// ── Generic ranked bar list (By Frontlines / By Area) ──────────────────────────
// The color square sits inline with the label (not centered against the
// whole row) and the bar starts directly below it, indented to line up
// under the label — same alignment convention as Feedback by Service /
// Feedback by Specialist. Rating box is white with green/yellow/red text
// by score, matching those two tables too.
function RankedList({ rows = [], labelKey, scaleMax }) {
  if (!rows.length) return <Empty />
  const maxCount = Math.max(...rows.map(r => r.count), 1)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: PANEL_MAX_HEIGHT, overflowY: 'auto', paddingRight: 4 }}>
      {rows.map((r) => {
        const t = bucketTone(r.avg_score, scaleMax)
        return (
          <div key={r[labelKey]} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: '#1450f5', flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: '#141414', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r[labelKey]}</span>
              </div>
              <div style={{ height: 8, background: '#f1ede3', borderRadius: 4, marginTop: 5, marginLeft: 18, overflow: 'hidden' }}>
                <div style={{ width: `${(r.count / maxCount) * 100}%`, height: '100%', background: '#1450f5', borderRadius: 4 }} />
              </div>
            </div>
            <span style={{ fontSize: 12, color: '#6e6e6e', width: 30, textAlign: 'right' }}>{r.count}</span>
            <span style={{ ...ratingBadgeStyle(t), flexShrink: 0 }}>
              {fmt1(r.avg_score) ?? '—'}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function ConnectTicketsNote() {
  return (
    <div style={{ padding: '20px 10px', textAlign: 'center', color: '#9c9c9c', fontSize: 12, lineHeight: 1.6 }}>
      No Area data available — add an "Area" column to the feedback sheet,<br />
      or connect ticket data on the Dashboard tab to match it by ticket number.
    </div>
  )
}

// ── Inflow bar chart (hoverable, optional per-specialist stacking) ────────────
function InflowBars({ data = [], users = [], stacked = false }) {
  const { tip, wrapRef, show, hide } = useTooltip()
  if (!data.length) return <Empty />

  const W = 760, H = stacked ? 262 : 240, PAD = { t: 12, r: 8, b: 46, l: 34 }
  const cw = W - PAD.l - PAD.r, ch = H - PAD.t - PAD.b
  const max = Math.max(...data.map(d => d.count), 1)
  const bw = Math.min(40, (cw / data.length) * 0.72)
  const step = cw / data.length
  const labelEvery = Math.ceil(data.length / 10)
  const userColor = Object.fromEntries(users.map((u, i) => [u, PALETTE[i % PALETTE.length]]))
  const shownUsers = users.filter(u => data.some(d => (d.by_user ?? {})[u]))

  const tipLines = d => {
    const lines = [{ text: `${d.label} — ${d.count} feedback${d.count === 1 ? '' : 's'}` }]
    if (stacked) {
      shownUsers.forEach(u => {
        const c = (d.by_user ?? {})[u]
        if (c) lines.push({ text: `${u}: ${c}`, swatch: userColor[u] })
      })
    } else if (d.avg_score != null) {
      lines.push({ text: `avg score ${d.avg_score}` })
    }
    return lines
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', overflowX: 'auto' }}>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} style={{ minWidth: 480 }} onMouseLeave={hide}>
        {[...new Set([0, 0.25, 0.5, 0.75, 1].map(f => Math.round(f * max)))].map(v => {
          const y = PAD.t + ch - (v / max) * ch
          return (
            <g key={v}>
              <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y} stroke="#f1ede3" strokeWidth={1} />
              <text x={PAD.l - 6} y={y + 4} textAnchor="end" fontSize={10} fill="#9c9c9c">{v}</text>
            </g>
          )
        })}
        {data.map((d, i) => {
          const x = PAD.l + i * step + (step - bw) / 2
          let bars
          if (stacked) {
            let yCursor = PAD.t + ch
            bars = shownUsers.map(u => {
              const c = (d.by_user ?? {})[u] ?? 0
              if (!c) return null
              const h = (c / max) * ch
              yCursor -= h
              return <rect key={u} x={x} y={yCursor + 1} width={bw} height={Math.max(h - 2, 1)} rx={2} fill={userColor[u]} />
            })
          } else {
            const h = (d.count / max) * ch
            bars = <rect x={x} y={PAD.t + ch - h} width={bw} height={Math.max(h, d.count ? 2 : 0)} rx={4} fill="#1450f5" />
          }
          return (
            <g key={d.period}>
              {bars}
              {/* full-height hover target */}
              <rect x={PAD.l + i * step} y={PAD.t} width={step} height={ch} fill="transparent"
                onMouseMove={e => show(e, tipLines(d))} onMouseLeave={hide} style={{ cursor: 'pointer' }} />
              {i % labelEvery === 0 && (
                <text x={PAD.l + i * step + step / 2} y={H - 30} textAnchor="end" fontSize={9} fill="#9c9c9c"
                  transform={`rotate(-35 ${PAD.l + i * step + step / 2} ${H - 30})`}>
                  {d.label}
                </text>
              )}
            </g>
          )
        })}
        <line x1={PAD.l} y1={PAD.t + ch} x2={W - PAD.r} y2={PAD.t + ch} stroke="#d8d8d8" strokeWidth={1.5} />
      </svg>
      {stacked && shownUsers.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', paddingTop: 6 }}>
          {shownUsers.map(u => (
            <span key={u} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#404040' }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: userColor[u] }} />
              {u}
            </span>
          ))}
        </div>
      )}
      <Tooltip tip={tip} />
    </div>
  )
}

// ── Average score trend line (hoverable) ──────────────────────────────────────
function ScoreTrend({ data = [], max = 5 }) {
  const { tip, wrapRef, show, hide } = useTooltip()
  const pts = data.filter(d => d.avg_score != null)
  if (!pts.length) return <Empty />
  const W = 480, H = 240, PAD = { t: 12, r: 12, b: 46, l: 28 }
  const cw = W - PAD.l - PAD.r, ch = H - PAD.t - PAD.b
  const x = i => PAD.l + (pts.length === 1 ? cw / 2 : (i / (pts.length - 1)) * cw)
  const y = v => PAD.t + ch - (v / max) * ch
  const path = pts.map((d, i) => `${i ? 'L' : 'M'} ${x(i)},${y(d.avg_score)}`).join(' ')
  const labelEvery = Math.ceil(pts.length / 6)
  const colW = pts.length > 1 ? (x(1) - x(0)) : cw

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} onMouseLeave={hide}>
        {Array.from({ length: max + 1 }, (_, v) => (
          <g key={v}>
            <line x1={PAD.l} y1={y(v)} x2={W - PAD.r} y2={y(v)} stroke="#f1ede3" strokeWidth={1} />
            <text x={PAD.l - 6} y={y(v) + 3} textAnchor="end" fontSize={10} fill="#9c9c9c">{v}</text>
          </g>
        ))}
        <path d={`${path} L ${x(pts.length - 1)},${PAD.t + ch} L ${x(0)},${PAD.t + ch} Z`} fill="#1e8a5e" opacity={0.08} />
        <path d={path} fill="none" stroke="#1e8a5e" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        {pts.map((d, i) => (
          <g key={d.period}>
            <circle cx={x(i)} cy={y(d.avg_score)} r={3.5} fill="#fff" stroke="#1e8a5e" strokeWidth={2} />
            {/* column-wide hover target */}
            <rect x={x(i) - colW / 2} y={PAD.t} width={colW} height={ch} fill="transparent"
              onMouseMove={e => show(e, [
                { text: `${d.label}` },
                { text: `avg score ${d.avg_score} / ${max}` },
                { text: `${d.count} feedback${d.count === 1 ? '' : 's'}` },
              ])}
              onMouseLeave={hide} style={{ cursor: 'pointer' }} />
            {i % labelEvery === 0 && (
              <text x={x(i)} y={H - 30} textAnchor="end" fontSize={9} fill="#9c9c9c"
                transform={`rotate(-35 ${x(i)} ${H - 30})`}>{d.label}</text>
            )}
          </g>
        ))}
      </svg>
      <Tooltip tip={tip} />
    </div>
  )
}

// ── Per-service breakdown (chart bar + rating-parameter columns) ──────────────
function ServiceBreakdown({ rows = [], paramKeys = [], scaleMax, onPick, active }) {
  if (!rows.length) return <Empty />
  const maxCount = Math.max(...rows.map(r => r.count), 1)
  const hasParams = paramKeys.length > 0

  const scoreBadge = (v) => {
    const t = bucketTone(v, scaleMax)
    return (
      <span style={ratingBadgeStyle(t)}>
        {fmt1(v) ?? '—'}
      </span>
    )
  }

  return (
    <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: PANEL_MAX_HEIGHT }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e8e2d6' }}>
            <th style={thStyle}>Service</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Feedbacks</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Tickets</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Feedback Rate</th>
            {hasParams
              ? paramKeys.map(k => (
                  <th key={k} style={{ ...thStyle, textAlign: 'center' }}>{PARAM_LABELS[k] ?? k}</th>
                ))
              : <th style={{ ...thStyle, textAlign: 'center' }}>Avg Score</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const isActive = active === r.service
            return (
              <tr key={r.service} onClick={() => onPick(r.service)}
                style={{ borderBottom: '1px solid #f1ede3', cursor: 'pointer', background: isActive ? '#eef3fe' : 'transparent' }}>
                <td style={{ padding: '9px 6px', minWidth: 170 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: '#1450f5', flexShrink: 0 }} />
                    <span style={{ fontWeight: 600, color: isActive ? '#1450f5' : '#141414' }}>{r.service}</span>
                  </div>
                  <div style={{ height: 6, background: '#f1ede3', borderRadius: 3, marginTop: 6, marginLeft: 18, overflow: 'hidden' }}>
                    <div style={{ width: `${(r.count / maxCount) * 100}%`, height: '100%', background: '#1450f5', borderRadius: 3 }} />
                  </div>
                </td>
                <td style={{ padding: '9px 6px', textAlign: 'right', color: '#6e6e6e' }}>{r.count}</td>
                <td style={{ padding: '9px 6px', textAlign: 'right', color: '#6e6e6e' }}>{r.tickets ?? '—'}</td>
                <td style={{ padding: '9px 6px', textAlign: 'right', color: '#6e6e6e' }}>{r.feedback_rate_pct != null ? `${r.feedback_rate_pct}%` : '—'}</td>
                {hasParams
                  ? paramKeys.map(k => (
                      <td key={k} style={{ padding: '9px 6px', textAlign: 'center' }}>{scoreBadge(r.params?.[k])}</td>
                    ))
                  : <td style={{ padding: '9px 6px', textAlign: 'center' }}>{scoreBadge(r.avg_score)}</td>}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Per-specialist table (chart bar + rating-parameter breakdown) ─────────────
function UserTable({ rows = [], paramKeys = [], scaleMax, onPick, active }) {
  if (!rows.length) return <Empty />
  const maxCount = Math.max(...rows.map(r => r.count), 1)
  const hasParams = paramKeys.length > 0

  const scoreBadge = (v) => {
    const t = bucketTone(v, scaleMax)
    return (
      <span style={ratingBadgeStyle(t)}>
        {fmt1(v) ?? '—'}
      </span>
    )
  }

  return (
    <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: PANEL_MAX_HEIGHT }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e8e2d6' }}>
            <th style={thStyle}>Specialist</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Feedbacks</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Tickets</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Feedback Rate</th>
            {hasParams
              ? paramKeys.map(k => (
                  <th key={k} style={{ ...thStyle, textAlign: 'center' }}>{PARAM_LABELS[k] ?? k}</th>
                ))
              : <th style={{ ...thStyle, textAlign: 'center' }}>Avg Score</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const isActive = active === r.user
            return (
              <tr key={r.user} onClick={() => onPick(r.user)}
                style={{ borderBottom: '1px solid #f1ede3', cursor: 'pointer', background: isActive ? '#eef3fe' : 'transparent' }}>
                <td style={{ padding: '9px 6px', minWidth: 150 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: '#1450f5', flexShrink: 0 }} />
                    <span style={{ fontWeight: 600, color: isActive ? '#1450f5' : '#141414', whiteSpace: 'nowrap' }}>{r.user}</span>
                  </div>
                  <div style={{ height: 6, background: '#f1ede3', borderRadius: 3, marginTop: 6, marginLeft: 18, overflow: 'hidden' }}>
                    <div style={{ width: `${(r.count / maxCount) * 100}%`, height: '100%', background: '#1450f5', borderRadius: 3 }} />
                  </div>
                </td>
                <td style={{ padding: '9px 6px', textAlign: 'right', color: '#6e6e6e' }}>{r.count}</td>
                <td style={{ padding: '9px 6px', textAlign: 'right', color: '#6e6e6e' }}>{r.tickets ?? '—'}</td>
                <td style={{ padding: '9px 6px', textAlign: 'right', color: '#6e6e6e' }}>{r.feedback_rate_pct != null ? `${r.feedback_rate_pct}%` : '—'}</td>
                {hasParams
                  ? paramKeys.map(k => (
                      <td key={k} style={{ padding: '9px 6px', textAlign: 'center' }}>{scoreBadge(r.params?.[k])}</td>
                    ))
                  : <td style={{ padding: '9px 6px', textAlign: 'center' }}>{scoreBadge(r.avg_score)}</td>}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

const thStyle = {
  padding: '6px', fontSize: 10, fontWeight: 600, color: '#6e6e6e',
  textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left',
  fontFamily: KONE_FONT,
}

// ── Score Distribution table (rows = star level, columns = rating parameter) ──
function ScoreDistributionTable({ distributions = {}, paramKeys = [], scaleMax = 5 }) {
  if (!paramKeys.length) return <Empty text="No rating parameters detected in the sheet" />
  const levels = Array.from({ length: scaleMax }, (_, i) => scaleMax - i) // e.g. 5,4,3,2,1

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e8e2d6' }}>
            <th style={thStyle}>Rating</th>
            {paramKeys.map(k => (
              <th key={k} style={{ ...thStyle, textAlign: 'center' }}>{PARAM_LABELS[k] ?? k}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {levels.map(lvl => (
            <tr key={lvl} style={{ borderBottom: '1px solid #f1ede3' }}>
              <td style={{ padding: '9px 6px', fontWeight: 600, color: '#141414', whiteSpace: 'nowrap' }}>
                {lvl} Star Feedbacks
              </td>
              {paramKeys.map(k => {
                const row = (distributions?.[k] ?? []).find(d => d.score === lvl)
                return (
                  <td key={k} style={{ padding: '9px 6px', textAlign: 'center', fontWeight: 700, color: '#1450f5', fontFamily: KONE_FONT }}>
                    {row?.count ?? 0}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Feedback entries list ──────────────────────────────────────────────────────
function RecentList({ rows = [], scaleMax }) {
  const items = rows.filter(r => r.score != null || r.comment)
  if (!items.length) return <Empty />
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 560, overflowY: 'auto' }}>
      {items.map((r, i) => {
        const t = scoreTone(r.score, scaleMax)
        return (
          <div key={i} style={{ border: '1px solid #f1ede3', borderRadius: 10, padding: '10px 12px', background: '#faf8f3' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {r.score != null && (
                <span style={{ fontSize: 12, fontWeight: 800, color: t.fg, background: t.bg, borderRadius: 6, padding: '2px 8px' }}>
                  {r.score} / {scaleMax}
                </span>
              )}
              {r.requester && (
                <span style={{ fontSize: 12, fontWeight: 700, color: '#0077a8' }}>{r.requester}</span>
              )}
              {r.requester && r.user && <span style={{ fontSize: 11, color: '#9c9c9c' }}>→</span>}
              {r.user && <span style={{ fontSize: 12, fontWeight: 600, color: '#141414' }}>{r.user}</span>}
              {r.service && <span style={{ fontSize: 11, color: '#6e6e6e' }}>· {r.service}</span>}
              {r.ticket && <span style={{ fontSize: 11, color: '#1450f5' }}>· {r.ticket}</span>}
              <span style={{ fontSize: 11, color: '#9c9c9c', marginLeft: 'auto' }}>{r.date ?? ''}</span>
            </div>
            {r.comment && <p style={{ fontSize: 12, color: '#404040', margin: '7px 0 0', lineHeight: 1.5 }}>{r.comment}</p>}
          </div>
        )
      })}
    </div>
  )
}

function Empty({ text = 'No feedback for this filter' }) {
  return <div style={{ padding: 30, textAlign: 'center', color: '#9c9c9c', fontSize: 12 }}>{text}</div>
}
