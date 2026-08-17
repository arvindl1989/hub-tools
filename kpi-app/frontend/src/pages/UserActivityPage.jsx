import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { getUserActivity, getUserMetrics } from '../api'
import DateRangePicker, { ALL_TIME_ONLY } from '../components/DateRangePicker'
import {
  INTER, cardHeadingStyle, selStyle, activeFilterPillStyle, fmt1,
  NPS_BUCKET_STYLES, KONE_BLUE_TONE, Card, MetricCard, SegmentCard, ScrollList, stickyFilterCard,
} from '../components/KoneUI'

// ── Service definitions (match BANDWIDTH_RATES keys in backend) ───────────────
const SERVICES = [
  'Website Content Management',
  'Demand Creation – Global',
  'Email – Local',
  'Retention – Activations',
  'Content Production – Graphic Design',
]
const SERVICE_SHORT = [
  'Web Content Mgmt',
  'Demand Creation',
  'Email – Local',
  'Retention',
  'Graphic Design',
]
const SERVICE_COLORS = ['#1450f5', '#0077a8', '#1e8a5e', '#b87d00', '#c0305a']


// Lifecycle segments reuse the sentiment triad: Active→mint, Regular→yellow,
// Dormant→pink. Row 5 uses the KONE Blue accent pair.
const LIFECYCLE = [
  { key: 'active',  label: 'Active Users',  tone: NPS_BUCKET_STYLES.promoter,  sub: 'Last request ≤ 30 days ago' },
  { key: 'regular', label: 'Regular Users', tone: NPS_BUCKET_STYLES.passive,   sub: 'Last request 31–90 days ago' },
  { key: 'dormant', label: 'Dormant Users', tone: NPS_BUCKET_STYLES.detractor, sub: 'Last request > 90 days ago' },
]

// Shared column set for every segment list (Rows 4 and 5).
const BASE_COLUMNS = [
  { key: 'user',      label: 'User',       width: '34%' },
  { key: 'frontline', label: 'Frontline',  width: '24%' },
  { key: 'area',      label: 'Area',       width: '18%' },
  { key: 'count',     label: 'Requests',   width: '14%', align: 'right' },
]

const fmtDate = (s) => {
  if (!s) return '—'
  const iso = String(s).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '—'
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
}

// Every rate/ratio guards its own denominator on the backend and arrives as
// null; this just renders that consistently.
const pct = (v) => (v == null ? null : `${v}%`)

const TIER_CONFIG = {
  Active:          { color: '#1e8a5e', bg: '#edf8f2', border: '#aae1c8' },
  'At Risk':       { color: '#b87d00', bg: '#fffae3', border: '#ffe141' },
  'Remove Access': { color: '#c0305a', bg: '#fff0f3', border: '#f28ba0' },
}

function TierBadge({ tier }) {
  const cfg = TIER_CONFIG[tier] || { color: '#6e6e6e', bg: '#f1ede3', border: '#e8e2d6' }
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, letterSpacing: '0.02em',
      color: cfg.color, background: cfg.bg,
      border: `1px solid ${cfg.border}`,
      borderRadius: 20, padding: '3px 10px',
      whiteSpace: 'nowrap',
      display: 'inline-flex', alignItems: 'center', gap: 4,
    }}>
      {tier === 'Remove Access' && (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
        </svg>
      )}
      {tier}
    </span>
  )
}

function SortIcon({ dir }) {
  if (!dir) return <span style={{ color: '#d8d8d8', fontSize: 10, marginLeft: 2 }}>↕</span>
  return <span style={{ color: '#1450f5', fontSize: 10, marginLeft: 2 }}>{dir === 'asc' ? '↑' : '↓'}</span>
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function UserActivityPage({ sessionId, onSessionExpired }) {
  const [metrics, setMetrics] = useState(null)
  const [rows,    setRows]    = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  // Filter state mirrors FeedbackPage exactly — local useState, no URL sync.
  const [range,   setRange]   = useState({ from: '', to: '' })
  const [service, setService] = useState('')
  const [area,    setArea]    = useState('')
  const [fl,      setFl]      = useState('')
  const [user,    setUser]    = useState('')

  // Table-local controls (the retained user list keeps its own search + sort).
  const [search, setSearch]     = useState('')
  const [tierFilter, setTierFilter] = useState('')
  const [sort, setSort] = useState({ key: 'days_since_last', dir: 'desc' })

  const reqRef = useRef(0)
  const load = useCallback(() => {
    const id = ++reqRef.current
    setLoading(true)
    setError(null)
    const params = {
      dateFrom: range.from, dateTo: range.to,
      assignedTo: user, team: fl, area, subCategory: service,
    }
    Promise.all([getUserMetrics(sessionId, params), getUserActivity(sessionId, params)])
      .then(([m, r]) => {
        if (id !== reqRef.current) return
        setMetrics(m); setRows(r); setLoading(false)
      })
      .catch(e => {
        if (id !== reqRef.current) return
        if (e.sessionExpired) { onSessionExpired?.(); return }
        setError(e?.response?.data?.detail || e?.message || 'Could not load user activity')
        setLoading(false)
      })
  }, [range.from, range.to, user, service, area, fl, sessionId, onSessionExpired])

  useEffect(() => { load() }, [load])

  // Dev-only: the three lifecycle segments must partition the user base.
  useEffect(() => {
    if (!import.meta.env.DEV || !metrics) return
    const { active = [], regular = [], dormant = [] } = metrics.lifecycle ?? {}
    const sum = active.length + regular.length + dormant.length
    if (sum !== metrics.total_users) {
      console.error(
        `[UserActivity] lifecycle segments do not partition the user base: ` +
        `${active.length}+${regular.length}+${dormant.length}=${sum}, total_users=${metrics.total_users}`
      )
    }
  }, [metrics])

  const reach   = metrics?.reach   ?? {}
  const volume  = metrics?.volume  ?? {}
  const growth  = metrics?.growth  ?? {}
  const rates   = metrics?.rates   ?? {}
  const segments = metrics?.lifecycle ?? {}

  // ── Retained user table: page filters are applied server-side; search, tier
  // and sort stay local to the table. ───────────────────────────────────────
  const filtered = useMemo(() => {
    let out = rows
    if (search) out = out.filter(r => r.creator.toLowerCase().includes(search.toLowerCase()))
    if (tierFilter) out = out.filter(r => r.engagement_tier === tierFilter)
    return [...out].sort((a, b) => {
      let av, bv
      if (sort.key.startsWith('svc:')) {
        const sc = sort.key.slice(4)
        av = a.service_breakdown?.[sc] ?? 0
        bv = b.service_breakdown?.[sc] ?? 0
      } else {
        av = a[sort.key] ?? ''
        bv = b[sort.key] ?? ''
      }
      if (av < bv) return sort.dir === 'asc' ? -1 : 1
      if (av > bv) return sort.dir === 'asc' ? 1 : -1
      return 0
    })
  }, [rows, search, tierFilter, sort])

  const serviceTotals = useMemo(() => {
    const totals = {}
    SERVICES.forEach(sc => {
      totals[sc] = filtered.reduce((sum, r) => sum + (r.service_breakdown?.[sc] ?? 0), 0)
    })
    return totals
  }, [filtered])

  function toggleSort(key) {
    setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' })
  }

  const colStyle = () => ({
    textAlign: 'left', padding: '10px 14px',
    fontSize: 12, fontWeight: 600, color: '#6e6e6e',
    borderBottom: '2px solid #e8e2d6',
    cursor: 'pointer', userSelect: 'none',
    whiteSpace: 'nowrap', background: '#faf8f3',
  })

  const anyFilter = service || area || fl || user
  const periodEndLabel = metrics?.period_end ? fmtDate(metrics.period_end) : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#141414', margin: 0, letterSpacing: '-0.02em' }}>User Activity</h2>
          {anyFilter && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              {[service, area, fl, user].filter(Boolean).map((v) => (
                <span key={v} style={activeFilterPillStyle}>{v}</span>
              ))}
            </div>
          )}
        </div>
        {periodEndLabel && (
          <span style={{ fontSize: 12, fontWeight: 700, color: '#1450f5', background: '#eef3fe', borderRadius: 8, padding: '5px 12px', fontFamily: INTER }}>
            RECENCY MEASURED FROM {periodEndLabel}
          </span>
        )}
      </div>

      {/* Filters — identical to the Feedback tab */}
      <div style={{ ...stickyFilterCard, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#6e6e6e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Filters</span>
        <select value={service} onChange={e => setService(e.target.value)} style={selStyle}>
          <option value="">All Services</option>
          {(metrics?.services ?? []).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={area} onChange={e => setArea(e.target.value)} style={selStyle}>
          <option value="">All Areas</option>
          {(metrics?.areas ?? []).map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={fl} onChange={e => setFl(e.target.value)} style={selStyle}>
          <option value="">All Frontlines</option>
          {(metrics?.fl_segments ?? []).map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        <select value={user} onChange={e => setUser(e.target.value)} style={selStyle}>
          <option value="">All Specialists</option>
          {(metrics?.users ?? []).map(u => <option key={u} value={u}>{u}</option>)}
        </select>
        <DateRangePicker dateFrom={range.from} dateTo={range.to} onChange={(from, to) => setRange({ from, to })} presets={ALL_TIME_ONLY} />
        {(user || service || area || fl || range.from || range.to) && (
          <button
            onClick={() => { setUser(''); setService(''); setArea(''); setFl(''); setRange({ from: '', to: '' }) }}
            style={{ border: 'none', background: 'none', color: '#c0305a', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: INTER }}
          >
            Reset all
          </button>
        )}
      </div>

      {error && (
        <div style={{ background: '#ffdee5', border: '1px solid #ffcdd7', color: '#8c1a2e', borderRadius: 12, padding: '14px 18px', fontSize: 13 }}>
          <b>Could not load user activity.</b> {String(error)}
        </div>
      )}

      {loading && !metrics && (
        <div style={{ padding: 60, textAlign: 'center', color: '#9c9c9c', fontSize: 13 }}>Loading user activity…</div>
      )}

      {metrics && (<>

        {/* Row 1 — Reach */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <MetricCard label="Global Teams" value={reach.global_teams} sub="Teams in the Global area with ≥1 request" />
          <MetricCard label="Areas"        value={reach.areas}        sub="Distinct areas with ≥1 request" />
          <MetricCard label="Frontlines"   value={reach.frontlines}   sub="Distinct frontlines with ≥1 request" />
        </div>

        {/* Row 2 — Volume */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <MetricCard label="Total Requests" value={volume.total_requests?.toLocaleString()} sub="Requests in the active range" />
          <MetricCard label="Avg Requests / User"    value={fmt1(volume.avg_per_user)}    sub="Skewed upward by heavy requestors" />
          <MetricCard label="Median Requests / User" value={fmt1(volume.median_per_user)} sub="Half of users sit below this" />
        </div>

        {/* Rows 3 + 4 — lifecycle segment + its scrollable roster, one card each */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {LIFECYCLE.map(seg => (
            <SegmentCard key={seg.key} label={seg.label} value={(segments[seg.key] ?? []).length} sub={seg.sub} tone={seg.tone}>
              <ScrollList rows={segments[seg.key] ?? []} columns={BASE_COLUMNS} tone={seg.tone} />
            </SegmentCard>
          ))}
        </div>

        {/* Row 5 — Growth & engagement, KONE Blue accent */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <SegmentCard
            label="New Users"
            value={(growth.new_users ?? []).length}
            sub="First-ever request in the last 90 days"
            tone={KONE_BLUE_TONE}
          >
            <ScrollList
              rows={growth.new_users ?? []}
              tone={KONE_BLUE_TONE}
              emptyText="No new users in this window"
              columns={[
                { key: 'user',      label: 'User',      width: '30%' },
                { key: 'frontline', label: 'Frontline', width: '20%' },
                { key: 'area',      label: 'Area',      width: '15%' },
                { key: 'first_request_date', label: 'First Req', width: '21%', render: r => fmtDate(r.first_request_date) },
                { key: 'count',     label: 'Req',       width: '14%', align: 'right' },
              ]}
            />
          </SegmentCard>

          <SegmentCard
            label="Top Requestors"
            value={pct(growth.top_share_pct)}
            sub={`Share of all requests from the top ${metrics.top_n ?? 10}`}
            tone={KONE_BLUE_TONE}
          >
            <ScrollList
              rows={growth.top_requestors ?? []}
              columns={BASE_COLUMNS}
              tone={KONE_BLUE_TONE}
              emptyText="No requests in this range"
            />
          </SegmentCard>

          <SegmentCard
            label="At-Risk Users"
            value={(growth.at_risk ?? []).length}
            sub="≥3 lifetime requests, silent 60–90 days"
            tone={KONE_BLUE_TONE}
          >
            <ScrollList
              rows={growth.at_risk ?? []}
              tone={KONE_BLUE_TONE}
              emptyText="No users slipping away"
              columns={[
                { key: 'user',      label: 'User',      width: '31%' },
                { key: 'frontline', label: 'Frontline', width: '21%' },
                { key: 'area',      label: 'Area',      width: '16%' },
                { key: 'days_since_last', label: 'Silent', width: '17%', align: 'right', render: r => `${r.days_since_last}d` },
                { key: 'count',     label: 'Req',       width: '15%', align: 'right' },
              ]}
            />
          </SegmentCard>
        </div>

        {/* Row 6 — Rates. Service Adoption lives here with the other rates. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <MetricCard label="Utility Rate"     value={fmt1(rates.utility_rate)} sub="Requests per active user" />
          <MetricCard label="Engagement Rate"  value={pct(rates.engagement_pct)} sub="Active ÷ total users" />
          <MetricCard label="Repeat Usage"     value={pct(rates.repeat_pct)}     sub="Users with ≥2 requests" />
          <MetricCard
            label="Service Adoption"
            value={pct(rates.service_adoption_pct)}
            sub={`${rates.services_used ?? 0} of ${rates.services_offered ?? 0} services used`}
          />
        </div>

        {/* ── Retained user list — page filters applied server-side; search,
             tier and column sort stay local to the table. ─────────────────── */}
        <Card
          title="User List"
          controls={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="text"
                placeholder="Search user…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ ...selStyle, cursor: 'text', width: 170 }}
              />
              <select value={tierFilter} onChange={e => setTierFilter(e.target.value)} style={selStyle}>
                <option value="">All Tiers</option>
                {['Active', 'At Risk', 'Remove Access'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              {(search || tierFilter) && (
                <button
                  onClick={() => { setSearch(''); setTierFilter('') }}
                  style={{ border: 'none', background: 'none', color: '#c0305a', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: INTER }}
                >
                  Reset
                </button>
              )}
              <span style={{ fontSize: 12, color: '#9c9c9c' }}>{filtered.length} of {rows.length} users</span>
            </div>
          }
        >
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#faf8f3' }}>
                  <th colSpan={6} style={{
                    padding: '6px 14px', fontSize: 10, fontWeight: 600, color: '#9c9c9c',
                    borderBottom: '1px solid #e8e2d6', textAlign: 'left', letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                  }} />
                  <th colSpan={5} style={{
                    padding: '6px 14px', fontSize: 10, fontWeight: 700, color: '#1450f5',
                    borderBottom: '1px solid #e8e2d6', textAlign: 'center', letterSpacing: '0.06em',
                    textTransform: 'uppercase', background: '#f5f8fe',
                    borderLeft: '2px solid #dbe6fd',
                  }}>
                    Requests Raised by Service
                  </th>
                  <th style={{
                    padding: '6px 14px', fontSize: 10, fontWeight: 600, color: '#9c9c9c',
                    borderBottom: '1px solid #e8e2d6', textAlign: 'left', letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                  }} />
                </tr>

                <tr style={{ background: '#faf8f3' }}>
                  {[
                    { key: 'creator',          label: 'User' },
                    { key: 'team',             label: 'Frontline' },
                    { key: 'area',             label: 'Area' },
                    { key: 'total_tickets',    label: 'Total Requests' },
                    { key: 'last_ticket_date', label: 'Last Request' },
                    { key: 'days_since_last',  label: 'Days Since' },
                  ].map(({ key, label }) => (
                    <th key={key} style={colStyle()} onClick={() => toggleSort(key)}>
                      {label} <SortIcon dir={sort.key === key ? sort.dir : null} />
                    </th>
                  ))}

                  {SERVICES.map((sc, idx) => {
                    const svcKey = `svc:${sc}`
                    const isActive = sort.key === svcKey
                    return (
                      <th key={sc}
                        onClick={() => toggleSort(svcKey)}
                        style={{
                          padding: '8px 12px', fontSize: 11, fontWeight: 700,
                          color: isActive ? SERVICE_COLORS[idx] : `${SERVICE_COLORS[idx]}cc`,
                          borderBottom: '2px solid #e8e2d6', textAlign: 'center',
                          whiteSpace: 'nowrap', background: isActive ? '#eef3fe' : '#f5f8fe',
                          borderLeft: idx === 0 ? '2px solid #dbe6fd' : undefined,
                          cursor: 'pointer', userSelect: 'none',
                        }}
                      >
                        {SERVICE_SHORT[idx]}
                        <SortIcon dir={isActive ? sort.dir : null} />
                        {serviceTotals[sc] > 0 && (
                          <span style={{ display: 'block', fontSize: 9, color: '#a1b9fb', fontWeight: 500, marginTop: 1 }}>
                            {serviceTotals[sc]} total
                          </span>
                        )}
                      </th>
                    )
                  })}

                  <th style={colStyle()} onClick={() => toggleSort('engagement_tier')}>
                    Status <SortIcon dir={sort.key === 'engagement_tier' ? sort.dir : null} />
                  </th>
                </tr>
              </thead>

              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={12} style={{ padding: 40, textAlign: 'center', color: '#9c9c9c', fontSize: 13 }}>
                      No users match your filters.
                    </td>
                  </tr>
                ) : filtered.map((row, i) => {
                  const sb = row.service_breakdown ?? {}
                  return (
                    <tr
                      key={row.creator}
                      style={{
                        background: i % 2 === 0 ? '#ffffff' : '#faf8f3',
                        borderBottom: '1px solid #f3eee6',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = '#eef3fe'}
                      onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? '#ffffff' : '#faf8f3'}
                    >
                      <td style={{ padding: '10px 14px', fontWeight: 600, color: '#141414', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{
                            width: 28, height: 28, borderRadius: '50%',
                            background: `hsl(${Math.abs(row.creator.charCodeAt(0) * 37) % 360}, 55%, 88%)`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 11, fontWeight: 700, color: '#404040', flexShrink: 0,
                          }}>
                            {row.creator.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                          </div>
                          {row.creator}
                        </div>
                      </td>

                      <td style={{ padding: '10px 14px', color: '#404040' }}>
                        {row.team || <span style={{ color: '#d8d8d8' }}>—</span>}
                      </td>

                      <td style={{ padding: '10px 14px', color: '#404040' }}>
                        {row.area || <span style={{ color: '#d8d8d8' }}>—</span>}
                      </td>

                      <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, color: '#1450f5' }}>
                        {row.total_tickets.toLocaleString()}
                      </td>

                      <td style={{ padding: '10px 14px', color: '#404040', whiteSpace: 'nowrap' }}>
                        {fmtDate(row.last_ticket_date)}
                      </td>

                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                        <span style={{
                          fontWeight: 700,
                          color: row.days_since_last > 56 ? '#c0305a' : row.days_since_last > 27 ? '#b87d00' : '#1e8a5e',
                        }}>
                          {row.days_since_last}d
                        </span>
                      </td>

                      {SERVICES.map((sc, idx) => {
                        const cnt = sb[sc] ?? 0
                        return (
                          <td key={sc} style={{
                            padding: '10px 12px', textAlign: 'center',
                            background: i % 2 === 0 ? 'rgba(99,102,241,0.03)' : 'rgba(99,102,241,0.06)',
                            borderLeft: idx === 0 ? '2px solid #dbe6fd' : undefined,
                          }}>
                            {cnt > 0 ? (
                              <span style={{
                                display: 'inline-block', minWidth: 26,
                                fontWeight: 700, fontSize: 12,
                                color: SERVICE_COLORS[idx],
                                background: `${SERVICE_COLORS[idx]}18`,
                                borderRadius: 5, padding: '2px 7px',
                              }}>{cnt}</span>
                            ) : (
                              <span style={{ color: '#d8d8d8', fontSize: 12 }}>—</span>
                            )}
                          </td>
                        )
                      })}

                      <td style={{ padding: '10px 14px' }}>
                        <TierBadge tier={row.engagement_tier} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>

      </>)}
    </div>
  )
}
