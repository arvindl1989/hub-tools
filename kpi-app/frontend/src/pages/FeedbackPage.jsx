import { useEffect, useState, useCallback, useRef } from 'react'
import { getFeedback } from '../api'
import DateRangePicker from '../components/DateRangePicker'
import { SUB_CAT_COLORS, PALETTE } from '../utils/colors'

// ── Score → KONE sentiment colors ─────────────────────────────────────────────
function scoreTone(score, max = 5) {
  if (score == null) return { fg: '#6e6e6e', bg: '#f1ede3', bar: '#9c9c9c' }
  const r = score / max
  if (r >= 0.9)  return { fg: '#0f5132', bg: '#aae1c8', bar: '#1e8a5e' }
  if (r >= 0.7)  return { fg: '#1e8a5e', bg: '#d3efe0', bar: '#1e8a5e' }
  if (r >= 0.5)  return { fg: '#7a5400', bg: '#ffe141', bar: '#b87d00' }
  return { fg: '#8c1a2e', bg: '#ffcdd7', bar: '#c0305a' }
}

// Tone for a "% of ratings that are top-mark" metric — different bands than a raw score
function pctTone(pct) {
  if (pct == null) return { fg: '#6e6e6e', bg: '#f1ede3' }
  if (pct >= 50) return { fg: '#0f5132', bg: '#aae1c8' }
  if (pct >= 30) return { fg: '#1e8a5e', bg: '#d3efe0' }
  if (pct >= 15) return { fg: '#7a5400', bg: '#ffe141' }
  return { fg: '#8c1a2e', bg: '#ffcdd7' }
}

const svcColor = (name, i) => SUB_CAT_COLORS[name] ?? PALETTE[i % PALETTE.length]

const PARAM_LABELS = {
  overall: 'Overall', quality: 'Quality',
  timeliness: 'Timeliness', interaction: 'Interaction',
}
// Fixed card order for the four rating-parameter metrics, regardless of which
// columns the sheet actually has — missing ones render as a dashed placeholder.
const ORDERED_PARAMS = ['overall', 'quality', 'timeliness', 'interaction']

function Stars({ score, max = 5, size = 18, color = '#b87d00' }) {
  if (score == null) return null
  const full = Math.round(score)
  return (
    <span style={{ fontSize: size, letterSpacing: 2, color, lineHeight: 1 }}>
      {'★'.repeat(Math.min(full, max))}
      <span style={{ opacity: 0.25 }}>{'★'.repeat(Math.max(0, max - full))}</span>
    </span>
  )
}

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
  const [user,    setUser]    = useState('')
  const [service, setService] = useState('')
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
      dateFrom: range.from, dateTo: range.to, user, service, groupBy, refresh,
      sid: sessionId, entriesUser, entriesService,
    })
      .then(d => { if (id === reqRef.current) { setData(d); setLoading(false) } })
      .catch(e => {
        if (id !== reqRef.current) return
        setError(e?.response?.data?.detail || e?.message || 'Could not load feedback')
        setLoading(false)
      })
  }, [range.from, range.to, user, service, groupBy, sessionId, entriesUser, entriesService])

  useEffect(() => { load() }, [load])

  const scaleMax = data?.scale_max ?? 5

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#141414', margin: 0, letterSpacing: '-0.02em' }}>Feedback</h2>
          <p style={{ fontSize: 12, color: '#6e6e6e', margin: '4px 0 0' }}>
            Ratings from the connected Google Sheet (Sheet 2)
            {user && <> · showing <b style={{ color: '#1450f5' }}>{user}</b></>}
            {service && <> · <b style={{ color: '#1450f5' }}>{service}</b></>}
          </p>
        </div>
        <button className="btn-secondary" onClick={() => load(true)} title="Re-fetch the sheet">
          ⟳ Refresh sheet
        </button>
      </div>

      {/* Filters */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8e2d6', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#6e6e6e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Filters</span>
        <select value={user} onChange={e => setUser(e.target.value)} style={selStyle}>
          <option value="">All Specialists</option>
          {(data?.users ?? []).map(u => <option key={u} value={u}>{u}</option>)}
        </select>
        <select value={service} onChange={e => setService(e.target.value)} style={selStyle}>
          <option value="">All Services</option>
          {(data?.services ?? []).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <DateRangePicker dateFrom={range.from} dateTo={range.to} onChange={(from, to) => setRange({ from, to })} />
        {(user || service || range.from || range.to) && (
          <button
            onClick={() => { setUser(''); setService(''); setRange({ from: '', to: '' }) }}
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

        {/* 6 metric cards: Total, Rate, Overall/Quality/Timeliness/Interaction 5★ */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <div style={{ background: '#1450f5', borderRadius: 12, padding: '18px 20px', boxShadow: '0 1px 3px rgba(20,20,20,0.06)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase' }}>Total Feedbacks</div>
            <div style={{ fontSize: 34, fontWeight: 800, color: '#fff', lineHeight: 1, marginTop: 8, letterSpacing: '-0.02em' }}>{data.total}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 6 }}>{data.rated} with a rating</div>
          </div>

          <FeedbackRateCard rate={data.feedback_rate} />

          {ORDERED_PARAMS.map(k => (
            <FiveStarCard
              key={k}
              label={PARAM_LABELS[k]}
              five={k === 'overall'
                ? (data.param_five_star?.overall ?? { count: data.five_star_count, pct: data.five_star_pct, rated: data.rated })
                : data.param_five_star?.[k]}
              scaleMax={scaleMax}
            />
          ))}
        </div>

        {/* Promoter / Passive / Detractor */}
        <NpsSection nps={data.nps} scaleMax={scaleMax} />

        {/* Feedback by FL + Feedback by Area */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Card title="Feedback by FL" subtitle="Volume and average score per FL segment" accent="#0077a8">
            {data.has_fl_segment
              ? <RankedList rows={data.by_fl} labelKey="fl_segment" scaleMax={scaleMax} />
              : <Empty text={'No "FL" column detected in the sheet'} />}
          </Card>
          <Card title="Feedback by Area" subtitle="Volume and average score per area" accent="#c0305a">
            {data.has_area
              ? <RankedList rows={data.by_area} labelKey="area" scaleMax={scaleMax} />
              : <ConnectTicketsNote />}
          </Card>
        </div>

        {/* Feedback by Service + Feedback by Specialist */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 16 }}>
          <Card title="Feedback by Service"
            subtitle={data.param_keys?.length ? 'Volume and average per rating parameter' : 'Volume and average score per service'}
            accent="#b87d00">
            <ServiceBreakdown rows={data.by_service} paramKeys={data.param_keys ?? []} scaleMax={scaleMax} onPick={s => setService(s === service ? '' : s)} active={service} />
          </Card>
          <Card title="Feedback by Specialist"
            subtitle={data.param_keys?.length ? 'Average per rating parameter · click a row to focus on that person' : 'Click a row to focus the whole page on that person'}
            accent="#1e8a5e">
            <UserTable rows={data.by_user} paramKeys={data.param_keys ?? []} scaleMax={scaleMax} onPick={u => setUser(u === user ? '' : u)} active={user} />
          </Card>
        </div>

        {/* Feedback Entries — full width, own Specialist/Service filters */}
        <Card title="Feedback Entries"
          subtitle={`${data.entries.length} entries · newest to oldest${range.from || range.to ? ' · within the selected date range' : ''}`}
          accent="#1450f5"
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
          <Card title="Feedback Inflow" subtitle={`Feedbacks received per ${groupBy}`} accent="#1450f5"
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
          <Card title="Average Score Trend" subtitle={`Mean rating per ${groupBy} — hover for values`} accent="#1e8a5e">
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

// ── Card shell (matches the rest of the app) ──────────────────────────────────
function Card({ title, subtitle, accent = '#1450f5', controls, children }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 12, border: '1px solid #e8e2d6',
      borderLeft: `3px solid ${accent}`,
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
function FeedbackRateCard({ rate }) {
  // Same green used by the Overall/Quality/Timeliness/Interaction 5★ cards
  return (
    <div style={{ background: '#d3efe0', borderRadius: 12, padding: '18px 20px', boxShadow: '0 1px 3px rgba(20,20,20,0.06)' }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: '#1e8a5e', textTransform: 'uppercase' }}>Feedback Rate</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: '#141414', lineHeight: 1.2, marginTop: 8, letterSpacing: '-0.01em' }}>
        {rate ? (rate.ratio <= 1 ? 'Every ticket got feedback' : `1 in ${rate.ratio} tickets got feedback`) : '—'}
      </div>
      <div style={{ fontSize: 11, color: '#1e8a5e', marginTop: 6 }}>
        {rate
          ? `${rate.pct}% · ${rate.feedbacks} of ${rate.tickets} tickets`
          : 'Connect ticket data on Dashboard to see this metric'}
      </div>
    </div>
  )
}

// ── One of the four rating-parameter 5★ cards ──────────────────────────────────
function FiveStarCard({ label, five, scaleMax }) {
  const pct = five?.pct ?? null
  const tone = pctTone(pct)
  return (
    <div style={{ background: tone.bg, borderRadius: 12, padding: '18px 20px', boxShadow: '0 1px 3px rgba(20,20,20,0.06)' }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: tone.fg, textTransform: 'uppercase' }}>
        {label} {scaleMax}★ Rating
      </div>
      <div style={{ fontSize: 34, fontWeight: 800, color: '#141414', lineHeight: 1, marginTop: 8, letterSpacing: '-0.02em' }}>
        {pct != null ? `${pct}%` : '—'}
      </div>
      <div style={{ fontSize: 11, color: tone.fg, marginTop: 6 }}>
        {five ? `(${five.count} ${scaleMax}★ / ${five.rated} feedbacks)` : 'No data for this parameter'}
      </div>
    </div>
  )
}

// ── Promoter / Passive / Detractor section ─────────────────────────────────────
function NpsSection({ nps, scaleMax }) {
  if (!nps) return null
  const buckets = [
    { key: 'promoters',  label: 'Promoters',  count: nps.promoters,  pct: nps.promoter_pct,  tone: { fg: '#0f5132', bg: '#aae1c8' } },
    { key: 'passives',   label: 'Passives',   count: nps.passives,   pct: nps.passive_pct,   tone: { fg: '#7a5400', bg: '#ffe141' } },
    { key: 'detractors', label: 'Detractors', count: nps.detractors, pct: nps.detractor_pct, tone: { fg: '#8c1a2e', bg: '#ffcdd7' } },
  ]
  const topLists = [
    { key: 'top_promoters',  title: 'Top 3 Promoters',  items: nps.top_promoters,  tone: buckets[0].tone },
    { key: 'top_passives',   title: 'Top 3 Passives',   items: nps.top_passives,   tone: buckets[1].tone },
    { key: 'top_detractors', title: 'Top 3 Detractors', items: nps.top_detractors, tone: buckets[2].tone },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#141414', margin: 0 }}>Promoter / Passive / Detractor</h3>
          <p style={{ fontSize: 11, color: '#9c9c9c', margin: '3px 0 0' }}>
            Based on Overall score · {scaleMax}★ promoter · {scaleMax - 1}★ passive · below {scaleMax - 1}★ detractor
          </p>
        </div>
        {nps.score != null && (
          <span style={{ fontSize: 12, fontWeight: 700, color: '#1450f5', background: '#eef3fe', borderRadius: 8, padding: '5px 12px' }}>
            NPS Score {nps.score > 0 ? '+' : ''}{nps.score}
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {buckets.map(b => (
          <div key={b.key} style={{ background: b.tone.bg, borderRadius: 12, padding: '16px 18px', boxShadow: '0 1px 3px rgba(20,20,20,0.06)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: b.tone.fg, textTransform: 'uppercase' }}>{b.label}</div>
            <div style={{ fontSize: 30, fontWeight: 800, color: '#141414', lineHeight: 1, marginTop: 8 }}>{b.count}</div>
            <div style={{ fontSize: 11, color: b.tone.fg, marginTop: 6 }}>{b.pct != null ? `${b.pct}% of rated feedback` : '—'}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {topLists.map(t => (
          <div key={t.key} style={{ background: '#fff', border: '1px solid #e8e2d6', borderLeft: `3px solid ${t.tone.fg}`, borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#404040', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>{t.title}</div>
            {!t.items?.length ? (
              <div style={{ fontSize: 12, color: '#9c9c9c' }}>No data</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {t.items.map((it, i) => (
                  <div key={it.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{
                      width: 20, height: 20, borderRadius: '50%', background: t.tone.bg, color: t.tone.fg,
                      fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#141414', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name}</div>
                      {it.fl && <div style={{ fontSize: 10.5, color: '#9c9c9c', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.fl}</div>}
                    </div>
                    <span style={{ fontSize: 12, color: '#6e6e6e', flexShrink: 0 }}>{it.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Generic ranked bar list (Feedback by FL / Feedback by Area) ───────────────
function RankedList({ rows = [], labelKey, scaleMax }) {
  if (!rows.length) return <Empty />
  const maxCount = Math.max(...rows.map(r => r.count), 1)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map((r, i) => {
        const c = PALETTE[i % PALETTE.length]
        const t = scoreTone(r.avg_score, scaleMax)
        return (
          <div key={r[labelKey]} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: c, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#141414', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r[labelKey]}</div>
              <div style={{ height: 8, background: '#f1ede3', borderRadius: 4, marginTop: 5, overflow: 'hidden' }}>
                <div style={{ width: `${(r.count / maxCount) * 100}%`, height: '100%', background: c, borderRadius: 4 }} />
              </div>
            </div>
            <span style={{ fontSize: 12, color: '#6e6e6e', width: 60, textAlign: 'right' }}>{r.count} fb</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: t.fg, background: t.bg, borderRadius: 6, padding: '3px 8px', width: 52, textAlign: 'center', flexShrink: 0 }}>
              {r.avg_score ?? '—'}
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
    const t = scoreTone(v, scaleMax)
    return (
      <span style={{ fontWeight: 700, color: t.fg, background: t.bg, borderRadius: 6, padding: '3px 8px', fontSize: 12 }}>
        {v ?? '—'}
      </span>
    )
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e8e2d6' }}>
            <th style={thStyle}>Service</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Feedbacks</th>
            {hasParams
              ? paramKeys.map(k => (
                  <th key={k} style={{ ...thStyle, textAlign: 'center' }}>{PARAM_LABELS[k] ?? k}</th>
                ))
              : <th style={{ ...thStyle, textAlign: 'center' }}>Avg Score</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const c = svcColor(r.service, i)
            const isActive = active === r.service
            return (
              <tr key={r.service} onClick={() => onPick(r.service)}
                style={{ borderBottom: '1px solid #f1ede3', cursor: 'pointer', background: isActive ? '#eef3fe' : 'transparent' }}>
                <td style={{ padding: '9px 6px', minWidth: 170 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: c, flexShrink: 0 }} />
                    <span style={{ fontWeight: 600, color: isActive ? '#1450f5' : '#141414' }}>{r.service}</span>
                  </div>
                  <div style={{ height: 6, background: '#f1ede3', borderRadius: 3, marginTop: 6, marginLeft: 18, overflow: 'hidden' }}>
                    <div style={{ width: `${(r.count / maxCount) * 100}%`, height: '100%', background: c, borderRadius: 3 }} />
                  </div>
                </td>
                <td style={{ padding: '9px 6px', textAlign: 'right', color: '#6e6e6e' }}>{r.count}</td>
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
    const t = scoreTone(v, scaleMax)
    return (
      <span style={{ fontWeight: 700, color: t.fg, background: t.bg, borderRadius: 6, padding: '3px 8px', fontSize: 12 }}>
        {v ?? '—'}
      </span>
    )
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e8e2d6' }}>
            <th style={thStyle}>Specialist</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Feedbacks</th>
            {hasParams
              ? paramKeys.map(k => (
                  <th key={k} style={{ ...thStyle, textAlign: 'center' }}>{PARAM_LABELS[k] ?? k}</th>
                ))
              : <th style={{ ...thStyle, textAlign: 'center' }}>Avg Score</th>}
            <th style={{ ...thStyle, textAlign: 'left', paddingLeft: 14 }}>Rating</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const c = PALETTE[i % PALETTE.length]
            const isActive = active === r.user
            return (
              <tr key={r.user} onClick={() => onPick(r.user)}
                style={{ borderBottom: '1px solid #f1ede3', cursor: 'pointer', background: isActive ? '#eef3fe' : 'transparent' }}>
                <td style={{ padding: '9px 6px', minWidth: 150 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: c, flexShrink: 0 }} />
                    <span style={{ fontWeight: 600, color: isActive ? '#1450f5' : '#141414', whiteSpace: 'nowrap' }}>{r.user}</span>
                  </div>
                  <div style={{ height: 6, background: '#f1ede3', borderRadius: 3, marginTop: 6, marginLeft: 18, overflow: 'hidden' }}>
                    <div style={{ width: `${(r.count / maxCount) * 100}%`, height: '100%', background: c, borderRadius: 3 }} />
                  </div>
                </td>
                <td style={{ padding: '9px 6px', textAlign: 'right', color: '#6e6e6e' }}>{r.count}</td>
                {hasParams
                  ? paramKeys.map(k => (
                      <td key={k} style={{ padding: '9px 6px', textAlign: 'center' }}>{scoreBadge(r.params?.[k])}</td>
                    ))
                  : <td style={{ padding: '9px 6px', textAlign: 'center' }}>{scoreBadge(r.avg_score)}</td>}
                <td style={{ padding: '9px 6px 9px 14px' }}><Stars score={r.avg_score} max={scaleMax} size={13} /></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

const thStyle = {
  padding: '6px', fontSize: 10, fontWeight: 700, color: '#6e6e6e',
  textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left',
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
