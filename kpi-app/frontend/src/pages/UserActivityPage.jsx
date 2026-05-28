import { useEffect, useState, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { getUserActivity } from '../api'

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
const SERVICE_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444']

function DateInput({ label, value, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 500 }}>{label}</span>
      <input
        type="date"
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          height: 34, border: '1px solid #e5e7eb', borderRadius: 8,
          fontSize: 12, color: '#374151', padding: '0 8px',
          background: '#fff', fontFamily: 'Inter, sans-serif',
          cursor: 'pointer', outline: 'none',
        }}
      />
    </div>
  )
}

const TIER_CONFIG = {
  Active:          { color: '#1e8a5e', bg: '#ecfdf5', border: '#6ee7b7' },
  'At Risk':       { color: '#b87d00', bg: '#fffbeb', border: '#fcd34d' },
  'Remove Access': { color: '#c0305a', bg: '#fff1f2', border: '#fda4af' },
}

const BUCKETS = [
  { label: '< 2 weeks',   min: 0,   max: 13  },
  { label: '2–4 weeks',   min: 14,  max: 27  },
  { label: '4–8 weeks',   min: 28,  max: 56  },
  { label: '8–12 weeks',  min: 57,  max: 84  },
  { label: '3–6 months',  min: 85,  max: 180 },
  { label: '6+ months',   min: 181, max: null },
]

const BUCKET_COLORS = ['#1e8a5e', '#4ade80', '#fcd34d', '#fb923c', '#f87171', '#c0305a']

function TierBadge({ tier }) {
  const cfg = TIER_CONFIG[tier] || { color: '#6b7280', bg: '#f3f4f6', border: '#e5e7eb' }
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
  if (!dir) return <span style={{ color: '#d1d5db', fontSize: 10, marginLeft: 2 }}>↕</span>
  return <span style={{ color: '#1450f5', fontSize: 10, marginLeft: 2 }}>{dir === 'asc' ? '↑' : '↓'}</span>
}

function StatCard({ label, value, sub, color, bg }) {
  return (
    <div style={{
      background: bg || '#ffffff',
      border: '1px solid #e5e8ef',
      borderRadius: 12,
      padding: '18px 22px',
      display: 'flex', flexDirection: 'column', gap: 4,
      minWidth: 140,
      flex: 1,
    }}>
      <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 28, fontWeight: 800, color: color || '#111827', lineHeight: 1 }}>{value}</span>
      {sub && <span style={{ fontSize: 11, color: '#9ca3af' }}>{sub}</span>}
    </div>
  )
}

const CustomPieTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null
  const { name, value } = payload[0]
  const cfg = TIER_CONFIG[name] || {}
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e8ef', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
      <span style={{ color: cfg.color || '#111827', fontWeight: 700 }}>{name}</span>
      <span style={{ color: '#374151', marginLeft: 8 }}>{value} users</span>
    </div>
  )
}

const CustomBarTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e8ef', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
      <div style={{ fontWeight: 600, color: '#111827', marginBottom: 4 }}>{label}</div>
      <div style={{ color: '#6b7280' }}>{payload[0].value} tickets</div>
    </div>
  )
}

const HorizBarTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e8ef', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
      <div style={{ fontWeight: 600, color: '#111827', marginBottom: 2 }}>{label}</div>
      <div style={{ color: '#6b7280' }}>{payload[0].value.toLocaleString()} tickets</div>
    </div>
  )
}

export default function UserActivityPage({ sessionId, onSessionExpired }) {
  const [data, setData]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [teamFilter, setTeamFilter] = useState('')
  const [areaFilter, setAreaFilter] = useState('')
  const [tierFilter, setTierFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo,   setDateTo]   = useState('')
  const [sort, setSort]         = useState({ key: 'days_since_last', dir: 'desc' })

  useEffect(() => {
    setLoading(true)
    getUserActivity(sessionId)
      .then(setData)
      .catch((err) => { if (err.sessionExpired) onSessionExpired?.() })
      .finally(() => setLoading(false))
  }, [sessionId])

  const teams = useMemo(() => [...new Set(data.map(d => d.team).filter(Boolean))].sort(), [data])
  const areas = useMemo(() => [...new Set(data.map(d => d.area).filter(Boolean))].sort(), [data])

  // ── Summary charts: tickets by team & area ────────────────────────────────
  const teamChartData = useMemo(() => {
    const map = {}
    data.forEach(d => { if (d.team) map[d.team] = (map[d.team] || 0) + d.total_tickets })
    return Object.entries(map)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15)
  }, [data])

  const areaChartData = useMemo(() => {
    const map = {}
    data.forEach(d => { if (d.area) map[d.area] = (map[d.area] || 0) + d.total_tickets })
    return Object.entries(map)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15)
  }, [data])

  // ── Filtered rows ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let rows = data
    if (search)     rows = rows.filter(r => r.creator.toLowerCase().includes(search.toLowerCase()))
    if (teamFilter) rows = rows.filter(r => r.team === teamFilter)
    if (areaFilter) rows = rows.filter(r => r.area === areaFilter)
    if (tierFilter) rows = rows.filter(r => r.engagement_tier === tierFilter)
    if (dateFrom)   rows = rows.filter(r => r.last_ticket_date && r.last_ticket_date >= dateFrom)
    if (dateTo)     rows = rows.filter(r => r.last_ticket_date && r.last_ticket_date <= dateTo + 'T23:59:59')
    return [...rows].sort((a, b) => {
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
  }, [data, search, teamFilter, areaFilter, tierFilter, sort, dateFrom, dateTo])

  const stats = useMemo(() => ({
    total:         data.length,
    active:        data.filter(d => d.engagement_tier === 'Active').length,
    atRisk:        data.filter(d => d.engagement_tier === 'At Risk').length,
    removeAccess:  data.filter(d => d.engagement_tier === 'Remove Access').length,
  }), [data])

  const pieData = useMemo(() => [
    { name: 'Active',         value: stats.active },
    { name: 'At Risk',        value: stats.atRisk },
    { name: 'Remove Access',  value: stats.removeAccess },
  ].filter(d => d.value > 0), [stats])

  const bucketData = useMemo(() => BUCKETS.map((b, i) => ({
    label: b.label,
    count: data.filter(d => d.days_since_last >= b.min && (b.max === null || d.days_since_last <= b.max)).length,
    color: BUCKET_COLORS[i],
  })), [data])

  // ── Service totals for summary strip + table header (driven by filtered) ────
  const serviceTotals = useMemo(() => {
    const totals = {}
    SERVICES.forEach(sc => {
      totals[sc] = filtered.reduce((sum, r) => sum + (r.service_breakdown?.[sc] ?? 0), 0)
    })
    return totals
  }, [filtered])

  const filteredTotalTickets = useMemo(
    () => filtered.reduce((sum, r) => sum + r.total_tickets, 0),
    [filtered],
  )

  function toggleSort(key) {
    setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' })
  }

  function fmt(dateStr) {
    if (!dateStr) return '—'
    try { return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) }
    catch { return '—' }
  }

  const colStyle = (key) => ({
    textAlign: 'left', padding: '10px 14px',
    fontSize: 12, fontWeight: 600, color: '#6b7280',
    borderBottom: '2px solid #e5e8ef',
    cursor: 'pointer', userSelect: 'none',
    whiteSpace: 'nowrap',
    background: '#f9fafb',
  })

  const chartPanelStyle = {
    background: '#fff', borderRadius: 12, border: '1px solid #e5e8ef', padding: '20px 16px',
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300 }}>
        <div style={{ fontSize: 14, color: '#6b7280' }}>Loading user activity…</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Page header */}
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: 0 }}>User Ticket Activity</h2>
        <p style={{ fontSize: 13, color: '#6b7280', margin: '4px 0 0' }}>
          Track when each user last raised a ticket and flag accounts that may need access review.
          Users with no ticket activity in over 8 weeks are marked <strong style={{ color: '#c0305a' }}>Remove Access</strong>.
        </p>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <StatCard label="Total Users"    value={stats.total}        sub="unique ticket creators" />
        <StatCard label="Active"         value={stats.active}       sub="< 4 weeks since last ticket"  color="#1e8a5e" bg="#ecfdf5" />
        <StatCard label="At Risk"        value={stats.atRisk}       sub="4–8 weeks since last ticket"  color="#b87d00" bg="#fffbeb" />
        <StatCard label="Remove Access"  value={stats.removeAccess} sub="> 8 weeks since last ticket"   color="#c0305a" bg="#fff1f2" />
      </div>

      {/* ── Row 1: Engagement status + Days since last ticket ─────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.8fr', gap: 16 }}>

        {/* Engagement status donut */}
        <div style={chartPanelStyle}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 4 }}>Engagement Status</div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 12 }}>User distribution by activity tier</div>
          {pieData.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#9ca3af', padding: 40, fontSize: 13 }}>No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={230}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="45%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {pieData.map((entry) => (
                    <Cell key={entry.name} fill={TIER_CONFIG[entry.name]?.color || '#94a3b8'} />
                  ))}
                </Pie>
                <Tooltip content={<CustomPieTooltip />} />
                <Legend iconType="circle" iconSize={9} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Days since last ticket distribution */}
        <div style={chartPanelStyle}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 4 }}>Days Since Last Ticket</div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 12 }}>How long ago users last raised a ticket</div>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={bucketData} margin={{ top: 4, right: 12, left: 0, bottom: 4 }} barSize={32}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f3fa" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<CustomBarTooltip />} cursor={{ fill: '#f0f3fa' }} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {bucketData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Row 2: Tickets by Team + Tickets by Area ─────────────────────── */}
      {(teamChartData.length > 0 || areaChartData.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

          {/* Tickets by Team */}
          <div style={chartPanelStyle}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 4 }}>Tickets by Team</div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 12 }}>Total tickets raised per team</div>
            {teamChartData.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#9ca3af', padding: 32, fontSize: 13 }}>No team data</div>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(160, teamChartData.length * 34)}>
                <BarChart
                  data={teamChartData}
                  layout="vertical"
                  margin={{ top: 2, right: 40, left: 0, bottom: 2 }}
                  barSize={16}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f3fa" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: '#9ca3af' }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={130}
                    tick={{ fontSize: 11, fill: '#374151' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={v => v.length > 18 ? v.slice(0, 17) + '…' : v}
                  />
                  <Tooltip content={<HorizBarTooltip />} cursor={{ fill: '#f0f3fa' }} />
                  <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Tickets by Area */}
          <div style={chartPanelStyle}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 4 }}>Tickets by Area</div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 12 }}>Total tickets raised per area / region</div>
            {areaChartData.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#9ca3af', padding: 32, fontSize: 13 }}>No area data</div>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(160, areaChartData.length * 34)}>
                <BarChart
                  data={areaChartData}
                  layout="vertical"
                  margin={{ top: 2, right: 40, left: 0, bottom: 2 }}
                  barSize={16}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f3fa" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: '#9ca3af' }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={130}
                    tick={{ fontSize: 11, fill: '#374151' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={v => v.length > 18 ? v.slice(0, 17) + '…' : v}
                  />
                  <Tooltip content={<HorizBarTooltip />} cursor={{ fill: '#f0f3fa' }} />
                  <Bar dataKey="count" fill="#0ea5e9" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{
        background: '#fff', border: '1px solid #e5e8ef', borderRadius: 12,
        padding: '14px 18px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end',
      }}>
        <div style={{ position: 'relative', flexShrink: 0, alignSelf: 'flex-end' }}>
          <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
            width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            placeholder="Search user…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              paddingLeft: 30, paddingRight: 10, height: 34, border: '1px solid #e5e7eb',
              borderRadius: 8, fontSize: 13, color: '#374151', outline: 'none',
              fontFamily: 'Inter, sans-serif', width: 180,
            }}
          />
        </div>

        <DateInput label="Last ticket from" value={dateFrom} onChange={setDateFrom} />
        <DateInput label="Last ticket to"   value={dateTo}   onChange={setDateTo} />

        <div style={{ width: 1, height: 34, background: '#e5e7eb', alignSelf: 'flex-end' }} />

        {[
          { label: 'All Teams',  value: teamFilter, set: setTeamFilter, options: teams },
          { label: 'All Areas',  value: areaFilter, set: setAreaFilter, options: areas },
          { label: 'All Tiers',  value: tierFilter, set: setTierFilter, options: ['Active', 'At Risk', 'Remove Access'] },
        ].map(({ label, value, set, options }) => (
          <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 500 }}>{label.replace('All ', '')}</span>
            <select
              value={value}
              onChange={e => set(e.target.value)}
              style={{
                height: 34, border: '1px solid #e5e7eb', borderRadius: 8,
                fontSize: 13, color: '#374151', padding: '0 10px',
                background: '#fff', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                minWidth: 130,
              }}
            >
              <option value="">{label}</option>
              {options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        ))}

        {(search || teamFilter || areaFilter || tierFilter || dateFrom || dateTo) && (
          <button
            onClick={() => { setSearch(''); setTeamFilter(''); setAreaFilter(''); setTierFilter(''); setDateFrom(''); setDateTo('') }}
            style={{
              background: 'none', border: '1px solid #e5e7eb', borderRadius: 8,
              fontSize: 12, color: '#6b7280', cursor: 'pointer', padding: '0 10px', height: 34,
              fontFamily: 'Inter, sans-serif', alignSelf: 'flex-end',
            }}
          >
            Clear all
          </button>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#9ca3af', alignSelf: 'flex-end' }}>
          {filtered.length} of {data.length} users
        </span>
      </div>

      {/* ── Dynamic summary strip ────────────────────────────────────────────── */}
      <div style={{
        background: '#fff', border: '1px solid #e5e8ef', borderRadius: 12,
        padding: '14px 18px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center',
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', flexShrink: 0 }}>
          {teamFilter || areaFilter ? 'Filtered summary' : 'Summary'}
        </span>
        <div style={{ width: 1, height: 20, background: '#e5e7eb', flexShrink: 0 }} />

        {/* Total tickets chip */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: '#f0f4ff', border: '1px solid #c7d7fd', borderRadius: 8,
          padding: '4px 12px', fontSize: 12,
        }}>
          <span style={{ color: '#6b7280' }}>Total tickets</span>
          <strong style={{ color: '#1450f5', fontSize: 14 }}>{filteredTotalTickets.toLocaleString()}</strong>
          {filtered.length > 0 && (
            <span style={{ color: '#9ca3af', fontSize: 11 }}>· {filtered.length} users</span>
          )}
        </div>

        {/* Per-service chips */}
        {SERVICES.map((sc, idx) => {
          const count = serviceTotals[sc]
          if (!count) return null
          return (
            <div key={sc} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: `${SERVICE_COLORS[idx]}12`,
              border: `1px solid ${SERVICE_COLORS[idx]}40`,
              borderRadius: 8, padding: '4px 12px', fontSize: 12,
            }}>
              <span style={{ color: '#6b7280' }}>{SERVICE_SHORT[idx]}</span>
              <strong style={{ color: SERVICE_COLORS[idx], fontSize: 14 }}>{count.toLocaleString()}</strong>
            </div>
          )
        })}

        {filteredTotalTickets === 0 && (
          <span style={{ fontSize: 12, color: '#9ca3af', fontStyle: 'italic' }}>No tickets in current filter</span>
        )}
      </div>

      {/* ── Unified user + service table ─────────────────────────────────────── */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e8ef', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              {/* Group label row */}
              <tr style={{ background: '#f9fafb' }}>
                {/* Span the 6 identity/activity columns */}
                <th colSpan={6} style={{
                  padding: '6px 14px', fontSize: 10, fontWeight: 600, color: '#9ca3af',
                  borderBottom: '1px solid #e5e8ef', textAlign: 'left', letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                }} />
                {/* Service group label */}
                <th colSpan={5} style={{
                  padding: '6px 14px', fontSize: 10, fontWeight: 700, color: '#6366f1',
                  borderBottom: '1px solid #e5e8ef', textAlign: 'center', letterSpacing: '0.06em',
                  textTransform: 'uppercase', background: '#f5f5ff',
                  borderLeft: '2px solid #e0e0ff',
                }}>
                  Tickets Raised by Service
                </th>
                {/* Status column */}
                <th style={{
                  padding: '6px 14px', fontSize: 10, fontWeight: 600, color: '#9ca3af',
                  borderBottom: '1px solid #e5e8ef', textAlign: 'left', letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                }} />
              </tr>

              {/* Column header row */}
              <tr style={{ background: '#f9fafb' }}>
                {/* Sortable identity columns */}
                {[
                  { key: 'creator',          label: 'User' },
                  { key: 'team',             label: 'Team' },
                  { key: 'area',             label: 'Area' },
                  { key: 'total_tickets',    label: 'Total Tickets' },
                  { key: 'last_ticket_date', label: 'Last Ticket' },
                  { key: 'days_since_last',  label: 'Days Since' },
                ].map(({ key, label }) => (
                  <th key={key} style={colStyle(key)} onClick={() => toggleSort(key)}>
                    {label} <SortIcon dir={sort.key === key ? sort.dir : null} />
                  </th>
                ))}

                {/* Service columns — sortable */}
                {SERVICES.map((sc, idx) => {
                  const svcKey = `svc:${sc}`
                  const isActive = sort.key === svcKey
                  return (
                    <th key={sc}
                      onClick={() => toggleSort(svcKey)}
                      style={{
                        padding: '8px 12px', fontSize: 11, fontWeight: 700,
                        color: isActive ? SERVICE_COLORS[idx] : `${SERVICE_COLORS[idx]}cc`,
                        borderBottom: '2px solid #e5e8ef', textAlign: 'center',
                        whiteSpace: 'nowrap', background: isActive ? '#eef0ff' : '#f5f5ff',
                        borderLeft: idx === 0 ? '2px solid #e0e0ff' : undefined,
                        cursor: 'pointer', userSelect: 'none',
                      }}
                    >
                      {SERVICE_SHORT[idx]}
                      <SortIcon dir={isActive ? sort.dir : null} />
                      {serviceTotals[sc] > 0 && (
                        <span style={{ display: 'block', fontSize: 9, color: '#a5b4fc', fontWeight: 500, marginTop: 1 }}>
                          {serviceTotals[sc]} total
                        </span>
                      )}
                    </th>
                  )
                })}

                {/* Status */}
                <th style={colStyle('engagement_tier')} onClick={() => toggleSort('engagement_tier')}>
                  Status <SortIcon dir={sort.key === 'engagement_tier' ? sort.dir : null} />
                </th>
              </tr>
            </thead>

            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={12} style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
                    No users match your filters.
                  </td>
                </tr>
              ) : filtered.map((row, i) => {
                const sb = row.service_breakdown ?? {}
                return (
                  <tr
                    key={row.creator}
                    style={{
                      background: i % 2 === 0 ? '#ffffff' : '#fafafa',
                      borderBottom: '1px solid #f0f3fa',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f0f4ff'}
                    onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? '#ffffff' : '#fafafa'}
                  >
                    {/* User */}
                    <td style={{ padding: '10px 14px', fontWeight: 600, color: '#111827', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: '50%',
                          background: `hsl(${Math.abs(row.creator.charCodeAt(0) * 37) % 360}, 55%, 88%)`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, fontWeight: 700, color: '#374151', flexShrink: 0,
                        }}>
                          {row.creator.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        {row.creator}
                      </div>
                    </td>

                    {/* Team */}
                    <td style={{ padding: '10px 14px', color: '#374151' }}>
                      {row.team || <span style={{ color: '#d1d5db' }}>—</span>}
                    </td>

                    {/* Area */}
                    <td style={{ padding: '10px 14px', color: '#374151' }}>
                      {row.area || <span style={{ color: '#d1d5db' }}>—</span>}
                    </td>

                    {/* Total tickets */}
                    <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, color: '#1450f5' }}>
                      {row.total_tickets.toLocaleString()}
                    </td>

                    {/* Last ticket */}
                    <td style={{ padding: '10px 14px', color: '#374151', whiteSpace: 'nowrap' }}>
                      {fmt(row.last_ticket_date)}
                    </td>

                    {/* Days since */}
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                      <span style={{
                        fontWeight: 700,
                        color: row.days_since_last > 56 ? '#c0305a' : row.days_since_last > 27 ? '#b87d00' : '#1e8a5e',
                      }}>
                        {row.days_since_last}d
                      </span>
                    </td>

                    {/* Per-service ticket counts */}
                    {SERVICES.map((sc, idx) => {
                      const cnt = sb[sc] ?? 0
                      return (
                        <td key={sc} style={{
                          padding: '10px 12px', textAlign: 'center',
                          background: i % 2 === 0 ? 'rgba(99,102,241,0.03)' : 'rgba(99,102,241,0.06)',
                          borderLeft: idx === 0 ? '2px solid #e0e0ff' : undefined,
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
                            <span style={{ color: '#d1d5db', fontSize: 12 }}>—</span>
                          )}
                        </td>
                      )
                    })}

                    {/* Status */}
                    <td style={{ padding: '10px 14px' }}>
                      <TierBadge tier={row.engagement_tier} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}
