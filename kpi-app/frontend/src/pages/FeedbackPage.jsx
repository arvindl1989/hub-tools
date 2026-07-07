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

const svcColor = (name, i) => SUB_CAT_COLORS[name] ?? PALETTE[i % PALETTE.length]

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

// ── Page ──────────────────────────────────────────────────────────────────────
export default function FeedbackPage() {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  const [range,   setRange]   = useState({ from: '', to: '' })
  const [user,    setUser]    = useState('')
  const [service, setService] = useState('')
  const [groupBy, setGroupBy] = useState('week')

  const reqRef = useRef(0)
  const load = useCallback((refresh = false) => {
    const id = ++reqRef.current
    setLoading(true)
    setError(null)
    getFeedback({ dateFrom: range.from, dateTo: range.to, user, service, groupBy, refresh })
      .then(d => { if (id === reqRef.current) { setData(d); setLoading(false) } })
      .catch(e => {
        if (id !== reqRef.current) return
        setError(e?.response?.data?.detail || e?.message || 'Could not load feedback')
        setLoading(false)
      })
  }, [range.from, range.to, user, service, groupBy])

  useEffect(() => { load() }, [load])

  const scaleMax = data?.scale_max ?? 5
  const tone = scoreTone(data?.avg_score, scaleMax)

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

        {/* Hero cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {/* Average score — sentiment-tinted hero */}
          <div style={{ background: tone.bg, borderRadius: 12, padding: '18px 20px', boxShadow: '0 1px 3px rgba(20,20,20,0.06)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: tone.fg, textTransform: 'uppercase' }}>
              {user ? `${user} — Avg Score` : 'Average Score'}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
              <span style={{ fontSize: 40, fontWeight: 800, color: '#141414', lineHeight: 1, letterSpacing: '-0.02em' }}>
                {data.avg_score ?? '—'}
              </span>
              <span style={{ fontSize: 14, fontWeight: 600, color: tone.fg }}>/ {scaleMax}</span>
            </div>
            <div style={{ marginTop: 6 }}><Stars score={data.avg_score} max={scaleMax} color={tone.fg} /></div>
          </div>

          {/* Total feedbacks — KONE blue hero */}
          <div style={{ background: '#1450f5', borderRadius: 12, padding: '18px 20px', boxShadow: '0 1px 3px rgba(20,20,20,0.06)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase' }}>Total Feedbacks</div>
            <div style={{ fontSize: 40, fontWeight: 800, color: '#fff', lineHeight: 1, marginTop: 8, letterSpacing: '-0.02em' }}>{data.total}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 6 }}>{data.rated} with a rating</div>
          </div>

          {/* Positive share */}
          <div style={{ background: '#d2f5ff', borderRadius: 12, padding: '18px 20px', boxShadow: '0 1px 3px rgba(20,20,20,0.06)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: '#005f86', textTransform: 'uppercase' }}>Positive ({scaleMax === 5 ? '4★+' : '8+'})</div>
            <div style={{ fontSize: 40, fontWeight: 800, color: '#141414', lineHeight: 1, marginTop: 8, letterSpacing: '-0.02em' }}>
              {data.positive_pct != null ? `${data.positive_pct}%` : '—'}
            </div>
            <div style={{ fontSize: 11, color: '#005f86', marginTop: 6 }}>of rated feedbacks</div>
          </div>

          {/* Services covered */}
          <div style={{ background: '#f3eee6', borderRadius: 12, padding: '18px 20px', boxShadow: '0 1px 3px rgba(20,20,20,0.06)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: '#6e6e6e', textTransform: 'uppercase' }}>Services Rated</div>
            <div style={{ fontSize: 40, fontWeight: 800, color: '#141414', lineHeight: 1, marginTop: 8, letterSpacing: '-0.02em' }}>{data.by_service.length}</div>
            <div style={{ fontSize: 11, color: '#6e6e6e', marginTop: 6 }}>{data.by_user.length} specialists rated</div>
          </div>
        </div>

        {/* Inflow + score trend */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 16 }}>
          <Card title="Feedback Inflow" subtitle={`Feedbacks received per ${groupBy}`} accent="#1450f5"
            controls={
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
            }>
            <InflowBars data={data.by_period} />
          </Card>
          <Card title="Average Score Trend" subtitle={`Mean rating per ${groupBy}`} accent="#1e8a5e">
            <ScoreTrend data={data.by_period} max={scaleMax} />
          </Card>
        </div>

        {/* Distribution + by service */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 16 }}>
          <Card title="Score Distribution" subtitle="How ratings spread across the scale" accent="#b87d00">
            <Distribution data={data.distribution} max={scaleMax} />
          </Card>
          <Card title="Feedback by Service" subtitle="Volume and average score per service" accent="#0077a8">
            <ServiceBreakdown rows={data.by_service} scaleMax={scaleMax} onPick={s => setService(s === service ? '' : s)} active={service} />
          </Card>
        </div>

        {/* By specialist + recent comments */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Card title="Feedback by Specialist" subtitle="Click a row to focus the whole page on that person" accent="#c0305a">
            <UserTable rows={data.by_user} scaleMax={scaleMax} onPick={u => setUser(u === user ? '' : u)} active={user} />
          </Card>
          <Card title="Latest Feedback" subtitle="Most recent entries from the sheet" accent="#1e8a5e">
            <RecentList rows={data.recent} scaleMax={scaleMax} />
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

// ── Inflow bar chart ──────────────────────────────────────────────────────────
function InflowBars({ data = [] }) {
  if (!data.length) return <Empty />
  const W = 760, H = 240, PAD = { t: 12, r: 8, b: 46, l: 34 }
  const cw = W - PAD.l - PAD.r, ch = H - PAD.t - PAD.b
  const max = Math.max(...data.map(d => d.count), 1)
  const bw = Math.min(40, (cw / data.length) * 0.72)
  const step = cw / data.length
  const labelEvery = Math.ceil(data.length / 10)

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} style={{ minWidth: 480 }}>
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
          const h = (d.count / max) * ch
          const x = PAD.l + i * step + (step - bw) / 2
          return (
            <g key={d.period}>
              <rect x={x} y={PAD.t + ch - h} width={bw} height={Math.max(h, d.count ? 2 : 0)} rx={4} fill="#1450f5">
                <title>{d.label}: {d.count} feedbacks{d.avg_score != null ? ` · avg ${d.avg_score}` : ''}</title>
              </rect>
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
    </div>
  )
}

// ── Average score trend line ──────────────────────────────────────────────────
function ScoreTrend({ data = [], max = 5 }) {
  const pts = data.filter(d => d.avg_score != null)
  if (!pts.length) return <Empty />
  const W = 480, H = 240, PAD = { t: 12, r: 12, b: 46, l: 28 }
  const cw = W - PAD.l - PAD.r, ch = H - PAD.t - PAD.b
  const x = i => PAD.l + (pts.length === 1 ? cw / 2 : (i / (pts.length - 1)) * cw)
  const y = v => PAD.t + ch - (v / max) * ch
  const path = pts.map((d, i) => `${i ? 'L' : 'M'} ${x(i)},${y(d.avg_score)}`).join(' ')
  const labelEvery = Math.ceil(pts.length / 6)

  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
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
          <circle cx={x(i)} cy={y(d.avg_score)} r={3.5} fill="#fff" stroke="#1e8a5e" strokeWidth={2}>
            <title>{d.label}: avg {d.avg_score} ({d.count} feedbacks)</title>
          </circle>
          {i % labelEvery === 0 && (
            <text x={x(i)} y={H - 30} textAnchor="end" fontSize={9} fill="#9c9c9c"
              transform={`rotate(-35 ${x(i)} ${H - 30})`}>{d.label}</text>
          )}
        </g>
      ))}
    </svg>
  )
}

// ── Score distribution (horizontal, 5★ → 1★) ─────────────────────────────────
function Distribution({ data = [], max = 5 }) {
  const total = data.reduce((s, d) => s + d.count, 0)
  if (!total) return <Empty />
  const biggest = Math.max(...data.map(d => d.count), 1)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {[...data].reverse().map(d => {
        const t = scoreTone(d.score, max)
        const pct = total ? Math.round((d.count / total) * 100) : 0
        return (
          <div key={d.score} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 34, fontSize: 12, fontWeight: 700, color: '#404040', textAlign: 'right' }}>{d.score}★</span>
            <div style={{ flex: 1, height: 18, background: '#f1ede3', borderRadius: 5, overflow: 'hidden' }}>
              <div style={{ width: `${(d.count / biggest) * 100}%`, height: '100%', background: t.bar, borderRadius: 5, transition: 'width 0.3s' }}
                title={`${d.count} feedbacks (${pct}%)`} />
            </div>
            <span style={{ width: 70, fontSize: 11, color: '#6e6e6e' }}>{d.count} · {pct}%</span>
          </div>
        )
      })}
    </div>
  )
}

// ── Per-service breakdown ─────────────────────────────────────────────────────
function ServiceBreakdown({ rows = [], scaleMax, onPick, active }) {
  if (!rows.length) return <Empty />
  const maxCount = Math.max(...rows.map(r => r.count), 1)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map((r, i) => {
        const t = scoreTone(r.avg_score, scaleMax)
        const c = svcColor(r.service, i)
        const isActive = active === r.service
        return (
          <div key={r.service} onClick={() => onPick(r.service)}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
              padding: '8px 10px', borderRadius: 8,
              background: isActive ? '#eef3fe' : 'transparent',
              border: isActive ? '1px solid #c7d7fd' : '1px solid transparent',
            }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: c, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#141414', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.service}</div>
              <div style={{ height: 8, background: '#f1ede3', borderRadius: 4, marginTop: 5, overflow: 'hidden' }}>
                <div style={{ width: `${(r.count / maxCount) * 100}%`, height: '100%', background: c, borderRadius: 4 }} />
              </div>
            </div>
            <span style={{ fontSize: 12, color: '#6e6e6e', width: 74, textAlign: 'right' }}>{r.count} fb</span>
            <span style={{
              fontSize: 12, fontWeight: 700, color: t.fg, background: t.bg,
              borderRadius: 6, padding: '3px 8px', width: 52, textAlign: 'center', flexShrink: 0,
            }}>
              {r.avg_score ?? '—'}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ── Per-specialist table ──────────────────────────────────────────────────────
function UserTable({ rows = [], scaleMax, onPick, active }) {
  if (!rows.length) return <Empty />
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <thead>
        <tr style={{ borderBottom: '2px solid #e8e2d6' }}>
          <th style={thStyle}>Specialist</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>Feedbacks</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>Avg Score</th>
          <th style={{ ...thStyle, textAlign: 'left', paddingLeft: 14 }}>Rating</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => {
          const t = scoreTone(r.avg_score, scaleMax)
          const isActive = active === r.user
          return (
            <tr key={r.user} onClick={() => onPick(r.user)}
              style={{ borderBottom: '1px solid #f1ede3', cursor: 'pointer', background: isActive ? '#eef3fe' : 'transparent' }}>
              <td style={{ padding: '9px 6px', fontWeight: 600, color: isActive ? '#1450f5' : '#141414' }}>{r.user}</td>
              <td style={{ padding: '9px 6px', textAlign: 'right', color: '#6e6e6e' }}>{r.count}</td>
              <td style={{ padding: '9px 6px', textAlign: 'right' }}>
                <span style={{ fontWeight: 700, color: t.fg, background: t.bg, borderRadius: 6, padding: '3px 8px' }}>
                  {r.avg_score ?? '—'}
                </span>
              </td>
              <td style={{ padding: '9px 6px 9px 14px' }}><Stars score={r.avg_score} max={scaleMax} size={13} color="#b87d00" /></td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

const thStyle = {
  padding: '6px', fontSize: 10, fontWeight: 700, color: '#6e6e6e',
  textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left',
}

// ── Recent feedback list ──────────────────────────────────────────────────────
function RecentList({ rows = [], scaleMax }) {
  const items = rows.filter(r => r.score != null || r.comment)
  if (!items.length) return <Empty />
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 420, overflowY: 'auto' }}>
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

function Empty() {
  return <div style={{ padding: 30, textAlign: 'center', color: '#9c9c9c', fontSize: 12 }}>No feedback for this filter</div>
}
