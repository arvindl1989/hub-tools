import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { getUserActivity, getUserMetrics } from '../api'
import DateRangePicker, { ALL_TIME_ONLY } from '../components/DateRangePicker'
import {
  INTER, cardHeadingStyle, selStyle, activeFilterPillStyle, fmt1,
  NPS_BUCKET_STYLES, KONE_BLUE_TONE, WHITE_TONE, Card, MetricCard, SegmentCard, ScrollList,
  stickyFilterCard,
} from '../components/KoneUI'
import ServiceUtilityRate from '../components/ServiceUtilityRate'
import ListModal from '../components/ListModal'
import ActivityBreakdown from '../components/ActivityBreakdown'
import ServiceAdoptionHeatmap from '../components/ServiceAdoptionHeatmap'

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
  'Review Access': { color: '#c0305a', bg: '#fff0f3', border: '#f28ba0' },
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
      {tier === 'Review Access' && (
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
  // Tickets or estimated hours. Counts stay the default: they are what the
  // data actually records. Hours are a standard per-ticket estimate from the
  // Rates & SLA panel, so they answer "what was this planned to cost", never
  // "what did it take" — there is no logged time in the export.
  const [effort, setEffort] = useState(false)

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
  const cfg      = metrics?.config ?? {}
  // ── What is behind each headline ────────────────────────────────────────
  // A count is a question half-answered, so every card on the first two rows
  // opens the list it counted. The two rate cards open the population their
  // rate is of, which is the same list read for a different reason.
  const [listKey, setListKey] = useState(null)
  const openList = (key) => setListKey(key)

  const REQ_COLS = [
    { key: 'name', label: 'Name' },
    { key: 'requests', label: 'Requests', align: 'right' },
    { key: 'users', label: 'Users', align: 'right' },
  ]
  const USER_COLS = [
    { key: 'name', label: 'User' },
    { key: 'frontline', label: 'Frontline' },
    { key: 'area', label: 'Area' },
    { key: 'requests', label: 'Requests', align: 'right' },
    { key: 'days_since_last', label: 'Last seen', align: 'right',
      render: r => `${r.days_since_last}d ago` },
  ]
  // Engagement Rate counts Active plus Regular, so its drill-down is those two
  // buckets read as one list — the same people the lifecycle cards show,
  // joined because the rate joins them.
  const engaged = [...(segments.active ?? []), ...(segments.regular ?? [])]
    .map(u => ({ name: u.user, frontline: u.frontline, area: u.area,
                 requests: u.count, days_since_last: u.days_since_last }))
    .sort((a, b) => b.requests - a.requests)

  const LISTS = {
    global: {
      title: 'Global teams',
      subtitle: 'Teams inside the Global area, busiest first',
      columns: REQ_COLS, rows: reach.global_team_list ?? [],
    },
    areas: {
      title: 'Areas',
      subtitle: 'Areas with at least one request. Global is the hub\'s own area and is counted on its own card',
      columns: REQ_COLS, rows: reach.area_list ?? [],
    },
    frontlines: {
      title: 'Frontlines',
      subtitle: 'Frontlines outside Global with at least one request, busiest first',
      columns: [{ key: 'name', label: 'Frontline' }, { key: 'area', label: 'Area' },
                { key: 'requests', label: 'Requests', align: 'right' },
                { key: 'users', label: 'Users', align: 'right' }],
      rows: reach.frontline_list ?? [],
    },
    users: {
      title: 'Everyone who raised a request',
      subtitle: `${metrics?.total_users ?? 0} users, most requests first`,
      columns: USER_COLS, rows: metrics?.user_list ?? [],
    },
    engaged: {
      title: 'Engaged users',
      subtitle: `${segments.active?.length ?? 0} Active and `
                + `${segments.regular?.length ?? 0} Regular, out of `
                + `${metrics?.total_users ?? 0} users — everyone whose last request was `
                + `within ${cfg.lifecycle_dormant_days ?? 90} days`,
      columns: USER_COLS, rows: engaged,
    },
  }
  const openModal = listKey ? LISTS[listKey] : null

  const groups = metrics?.activity_groups
    ?? { services: [], areas: [], by_area: [], by_frontline: [], by_service: [], by_specialist: [] }
  const serviceKeys = (groups.services ?? []).map(s => s.name)
  const serviceLabels = Object.fromEntries((groups.services ?? []).map(s => [s.name, s.short]))
  const areaKeys = groups.areas ?? []
  const areaLabels = Object.fromEntries(areaKeys.map(a => [a, a]))

  const flUtility = metrics?.fl_utility
    ?? { rows: [], leader: null, leader_pct: null, services: [] }

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
        <div style={{ display: 'inline-flex', border: '1px solid #e8e2d6', borderRadius: 8, overflow: 'hidden' }}
             title={`Estimated hours are standard per-ticket figures from Rates & SLA (${cfg.effort_label ?? 'Estimated hours'}), not logged time`}>
          {[[false, 'Tickets'], [true, 'Est. hours']].map(([id, label]) => (
            <button key={label} onClick={() => setEffort(id)}
              style={{
                border: 'none', cursor: 'pointer', padding: '6px 12px', fontSize: 12,
                fontFamily: INTER, fontWeight: effort === id ? 700 : 500,
                background: effort === id ? '#1450f5' : '#fff',
                color: effort === id ? '#fff' : '#6e6e6e',
              }}>{label}</button>
          ))}
        </div>
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

        {/* Rows 1 and 2 — every card opens the list behind its number. Global
             is the hub's own area rather than a market, so it is counted by
             its own card and left out of the other two. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <MetricCard label="Global Teams" value={reach.global_teams}
            sub="Teams in the Global area with ≥1 request"
            onClick={() => openList('global')} />
          <MetricCard label="Areas"        value={reach.areas}
            sub="Areas with ≥1 request, excluding Global"
            onClick={() => openList('areas')} />
          <MetricCard label="Frontlines"   value={reach.frontlines}
            sub="Frontlines with ≥1 request, outside Global"
            onClick={() => openList('frontlines')} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <MetricCard label="Total Users" value={metrics.total_users?.toLocaleString()}
            sub={effort
              ? `${Math.round(volume.est_hours ?? 0).toLocaleString()} estimated hours in the active range`
              : `${volume.total_requests?.toLocaleString() ?? 0} requests in the active range`}
            onClick={() => openList('users')} />
          {/* The mean, as asked for. A handful of heavy requestors pull it
              above what a typical user does — the median is in the payload as
              volume.median_per_user if the two are ever wanted side by side. */}
          {effort ? (
            <MetricCard label="Est. hours / User" value={fmt1(volume.est_hours_per_user)}
              sub={`${Math.round(volume.est_hours ?? 0).toLocaleString()} estimated hours over ${volume.users_in_window ?? 0} users who raised something`}
              onClick={() => openList('users')} />
          ) : (
            <MetricCard label="Avg Requests / User" value={fmt1(volume.avg_per_user)}
              sub="Skewed upward by heavy requestors"
              onClick={() => openList('users')} />
          )}
          <MetricCard label="Engagement Rate (%)" value={pct(rates.engagement_pct)}
            sub="Active + Regular ÷ total users"
            onClick={() => openList('engaged')} />
        </div>

        {/* Rows 3 + 4 — lifecycle segment + its scrollable roster, one card each.
             Each count carries its share of the user base, so the three read as
             a split of one number rather than three unrelated figures. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {LIFECYCLE.map(seg => {
            const list = segments[seg.key] ?? []
            const share = metrics.total_users
              ? Math.round((list.length / metrics.total_users) * 100)
              : null
            return (
              <SegmentCard
                key={seg.key}
                label={seg.label}
                value={
                  <span>
                    {list.length}
                    {share != null && (
                      <span style={{ fontSize: 17, fontWeight: 600, opacity: 0.7, marginLeft: 7 }}>
                        ({share}%)
                      </span>
                    )}
                  </span>
                }
                sub={seg.sub}
                tone={seg.tone}
              >
                <ScrollList rows={list} columns={BASE_COLUMNS} tone={seg.tone} />
              </SegmentCard>
            )
          })}
        </div>

        {/* Row 5 — Growth & engagement, KONE Blue accent */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <SegmentCard
            label={`New in last ${cfg.new_user_window_days ?? 90} days`}
            value={growth.new_users_censored ? '—' : (growth.new_users ?? []).length}
            sub={growth.new_users_censored
              ? `Not enough history — the data starts ${growth.history_days ?? 0} days before this date, so everyone would look new`
              : 'First-ever request in the window'}
            tone={WHITE_TONE}
          >
            <ScrollList
              rows={growth.new_users ?? []}
              tone={WHITE_TONE}
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
            label={effort ? 'Top Requestors (hours)' : 'Top Requestors'}
            value={pct(effort ? growth.top_share_hours_pct : growth.top_share_pct)}
            sub={`Share of all ${effort ? 'estimated hours' : 'requests'} from the busiest `
              + `${Math.round((cfg.top_requestor_share ?? 0.1) * 100)}% of users by `
              + `${effort ? 'hours' : 'count'} — ${growth.top_n_effective ?? 0} of ${growth.top_share_basis ?? 0}`}
            tone={WHITE_TONE}
          >
            <ScrollList
              rows={(effort ? growth.top_requestors_by_hours : growth.top_requestors) ?? []}
              columns={BASE_COLUMNS}
              tone={WHITE_TONE}
              emptyText="No requests in this range"
            />
          </SegmentCard>

          {/* The utility rate asked one frontline at a time: of the people in
              this frontline who raise anything, what share have used each
              service. One row per frontline so it reads across, best covered
              first — a small frontline that has taken the services up is not
              hidden behind a big one, which a volume ranking would do. */}
          <SegmentCard
            label="Service Utility Rate by FL"
            value={flUtility.leader ?? '—'}
            sub={flUtility.leader
              ? `Best covered — ${flUtility.leader_pct}% of its users across the services`
              : 'No frontline requests in this selection'}
            tone={WHITE_TONE}
          >
            <ScrollList
              rows={flUtility.rows}
              tone={WHITE_TONE}
              emptyText="No requests in this range"
              columns={[
                { key: 'frontline', label: 'FL',    width: '34%' },
                { key: 'users',     label: 'Users', width: '16%', align: 'right' },
                // Two rates, one above the other: the share of the
                // frontline's people who have used the service, and the share
                // of its requests that went to it. A service half the team has
                // touched once is not where the frontline's demand goes, and
                // the pair says which of the two is happening.
                ...(flUtility.services ?? []).map(s => ({
                  key: `rate:${s.name}`,
                  label: s.short,
                  width: `${50 / Math.max(1, (flUtility.services ?? []).length)}%`,
                  align: 'right',
                  render: r => {
                    const byUser = r.rates?.[s.name]
                    // The utility rate stays a share of people whichever mode is
                    // on — effort has nothing to say about how many used a
                    // thing.
                    // Only the second line switches.
                    const byReq = effort ? r.hours_rates?.[s.name] : r.request_rates?.[s.name]
                    return (
                      <span title={`${r.users_used?.[s.name] ?? 0} of ${r.users} users · `
                                 + (effort
                                   ? `${Math.round(r.service_hours?.[s.name] ?? 0)} of ${Math.round(r.est_hours ?? 0)} estimated hours`
                                   : `${r.service_requests?.[s.name] ?? 0} of ${r.requests} requests`)}>
                        {byUser == null ? '—' : `${byUser}%`}
                        <span style={{ display: 'block', fontSize: 10, fontWeight: 400, color: '#9c9c9c' }}
                              title={effort
                                ? "Hours mix: this service's share of the frontline's estimated hours"
                                : "Request mix: this service's share of the frontline's requests"}>
                          {byReq == null ? '' : `${byReq}% mix`}
                        </span>
                      </span>
                    )
                  },
                })),
              ]}
            />
          </SegmentCard>
        </div>

        {/* ── Service Utility Rate and Service Adoption stand where the four
             rate boxes used to: the same questions, answered per service and
             per frontline instead of as one number for the whole hub. ─────── */}
        <ServiceUtilityRate rows={metrics.service_utility ?? []}
          ignoresServiceFilter={!!metrics.reach_ignores_service_filter} />

        {/* ── The same four cuts the Feedback page makes, asked of activity:
             utility rate in place of the response rate, and the requests
             behind it per service in place of the ratings. ───────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <ActivityBreakdown
            title="By Area" headerLabel="Area"
            subtitle={effort ? "Utility rate and estimated hours per area, busiest first"
                             : "Utility rate and requests per area, busiest first"}
            rows={groups.by_area} keys={serviceKeys} labels={serviceLabels} effort={effort}
            ignoresServiceFilter={!!metrics.reach_ignores_service_filter} />
          <ActivityBreakdown
            title="By Frontlines" headerLabel="Frontline"
            subtitle={effort ? "Utility rate and estimated hours per frontline, busiest first"
                             : "Utility rate and requests per frontline, busiest first"}
            rows={groups.by_frontline} keys={serviceKeys} labels={serviceLabels} effort={effort}
            ignoresServiceFilter={!!metrics.reach_ignores_service_filter} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <ActivityBreakdown
            title="By Service" headerLabel="Service"
            subtitle="Utility rate across the whole user base, and where each service's demand comes from"
            rows={groups.by_service} keys={areaKeys} labels={areaLabels} rateOfWholeBase effort={effort}
            ignoresServiceFilter={!!metrics.reach_ignores_service_filter} />
          <ActivityBreakdown
            title="By Specialist" headerLabel="Specialist"
            subtitle="Throughput per specialist — the utility rate belongs to the people who ask, not to who handled it"
            throughput
            rows={groups.by_specialist} keys={serviceKeys} labels={serviceLabels} effort={effort}
            hoursPerDay={cfg.hours_per_day ?? 8}
            ignoresServiceFilter={!!metrics.reach_ignores_service_filter} />
        </div>

        <ServiceAdoptionHeatmap data={metrics.service_adoption} effort={effort} />

        {/* ── Retained user list — page filters applied server-side; search,
             tier and column sort stay local to the table. ─────────────────── */}
        <Card
          title="User List"
          subtitle="Lifetime — every user this filter allows, however long ago they last asked. Not limited by the date range above."
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
                {['Active', 'At Risk', 'Review Access'].map(t => <option key={t} value={t}>{t}</option>)}
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

      {openModal && (
        <ListModal
          title={openModal.title}
          subtitle={openModal.subtitle}
          columns={openModal.columns}
          rows={openModal.rows}
          onClose={() => setListKey(null)}
          width={720}
        />
      )}
    </div>
  )
}
