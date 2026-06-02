import { useEffect, useState, useMemo } from 'react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend,
  ReferenceLine,
} from 'recharts'
import { getUtilityRate } from '../api'
import DateRangePicker from '../components/DateRangePicker'

/* ── Constants ──────────────────────────────────────────────────────────────── */
const SERVICES = [
  'Website Content Management',
  'Content Production – Graphic Design',
  'Demand Creation – Global',
  'Email – Local',
  'Retention – Activations',
]
const SERVICE_SHORT = {
  'Website Content Management':          'Web Content',
  'Content Production – Graphic Design': 'Graphic Design',
  'Demand Creation – Global':            'Demand Creation',
  'Email – Local':                       'Email – Local',
  'Retention – Activations':             'Retention',
}
const SERVICE_COLORS = {
  'Website Content Management':          '#3b82f6',
  'Content Production – Graphic Design': '#ef4444',
  'Demand Creation – Global':            '#8b5cf6',
  'Email – Local':                       '#10b981',
  'Retention – Activations':             '#f59e0b',
}

const STATUS_CFG = {
  Available:  { color: '#1e8a5e', bg: '#ecfdf5', border: '#6ee7b7' },
  Busy:       { color: '#b87d00', bg: '#fffbeb', border: '#fcd34d' },
  Overloaded: { color: '#c0305a', bg: '#fff1f2', border: '#fda4af' },
}

function utilColor(pct) {
  if (pct >= 85) return '#c0305a'
  if (pct >= 60) return '#b87d00'
  return '#1e8a5e'
}

/* ── Tiny shared components ─────────────────────────────────────────────────── */
function StatCard({ label, value, sub, color, bg, border }) {
  return (
    <div style={{
      background: bg || '#fff', border: `1px solid ${border || '#e5e8ef'}`, borderRadius: 12,
      padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 150,
    }}>
      <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      <span style={{ fontSize: 30, fontWeight: 800, color: color || '#111827', lineHeight: 1 }}>{value}</span>
      {sub && <span style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{sub}</span>}
    </div>
  )
}

function LoadBar({ pct, showLabel = true }) {
  const capped = Math.min(pct, 100)
  const col = utilColor(pct)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
      <div style={{ flex: 1, height: 7, background: '#f0f3fa', borderRadius: 4, overflow: 'hidden', minWidth: 60 }}>
        <div style={{ height: '100%', width: `${capped}%`, background: col, borderRadius: 4, transition: 'width 0.3s' }} />
      </div>
      {showLabel && <span style={{ fontSize: 12, fontWeight: 700, color: col, minWidth: 42, textAlign: 'right' }}>{pct}%</span>}
    </div>
  )
}

function SectionCard({ title, subtitle, children, accent = '#1450f5' }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 12, border: '1px solid #e5e8ef',
      borderLeft: `3px solid ${accent}`,
      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      overflow: 'hidden',
    }}>
      <div style={{ padding: '12px 20px', borderBottom: '1px solid #f3f4f6' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{subtitle}</div>}
      </div>
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  )
}

const CustomTT = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e8ef', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
      <div style={{ fontWeight: 700, color: '#111827', marginBottom: 4 }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ color: p.color || '#374151', marginBottom: 2 }}>
          {p.name}: <strong>{p.value}{p.name === 'Utility %' ? '%' : ' hrs'}</strong>
        </div>
      ))}
    </div>
  )
}

const PieTT = ({ active, payload }) => {
  if (!active || !payload?.length) return null
  const { name, value, payload: p } = payload[0]
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e8ef', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
      <div style={{ color: p.fill, fontWeight: 700 }}>{SERVICE_SHORT[name] || name}</div>
      <div style={{ color: '#374151' }}>{value} hrs · {p.pct}%</div>
    </div>
  )
}

/* ── Main page ──────────────────────────────────────────────────────────────── */
export default function UtilityRatePage({ sessionId, onSessionExpired }) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo,   setDateTo]   = useState('')
  const [teamF,    setTeamF]    = useState('')
  const [areaF,    setAreaF]    = useState('')
  const [assigneeF, setAssigneeF] = useState('')
  const [ticketSearch, setTicketSearch] = useState('')
  const [showTickets, setShowTickets]   = useState(false)
  const [sortCol, setSortCol] = useState('utility_pct')
  const [sortDir, setSortDir] = useState('desc')

  useEffect(() => {
    setLoading(true)
    getUtilityRate(sessionId, dateFrom, dateTo, {
      team: teamF, area: areaF, assigned_to: assigneeF,
    })
      .then(setData)
      .catch(err => { if (err.sessionExpired) onSessionExpired?.() })
      .finally(() => setLoading(false))
  }, [sessionId, dateFrom, dateTo, teamF, areaF, assigneeF])

  const teams     = data?.filter_options?.teams     ?? []
  const areas     = data?.filter_options?.areas     ?? []
  const assignees = data?.filter_options?.assignees ?? []

  // Pie chart data — service mix by committed hours
  const servicePieData = useMemo(() => {
    if (!data) return []
    const totalH = data.total_committed_h || 1
    return (data.by_service || [])
      .filter(r => r.committed_hours > 0)
      .map(r => ({
        name: r.service,
        value: r.committed_hours,
        fill: SERVICE_COLORS[r.service] || '#94a3b8',
        pct: Math.round(r.committed_hours / totalH * 100),
      }))
  }, [data])

  // Sorted assignees
  const sortedAssignees = useMemo(() => {
    if (!data?.by_assignee) return []
    return [...data.by_assignee].sort((a, b) => {
      const av = a[sortCol] ?? 0, bv = b[sortCol] ?? 0
      return sortDir === 'asc' ? av - bv : bv - av
    })
  }, [data, sortCol, sortDir])

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('desc') }
  }

  const filteredTickets = useMemo(() => {
    if (!data?.by_ticket) return []
    const q = ticketSearch.toLowerCase()
    if (!q) return data.by_ticket
    return data.by_ticket.filter(t =>
      t.ticket_number?.toLowerCase().includes(q) ||
      t.short_description?.toLowerCase().includes(q) ||
      t.assigned_to?.toLowerCase().includes(q) ||
      t.sub_category?.toLowerCase().includes(q)
    )
  }, [data, ticketSearch])

  const SortIcon = ({ col }) => {
    if (sortCol !== col) return <span style={{ color: '#d1d5db', marginLeft: 3 }}>↕</span>
    return <span style={{ color: '#1450f5', marginLeft: 3 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  const hasFilter = teamF || areaF || assigneeF || dateFrom || dateTo

  /* ── Render ──────────────────────────────────────────────────────────────── */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: 0 }}>Utility Rate</h2>
        <p style={{ fontSize: 13, color: '#6b7280', margin: '4px 0 0' }}>
          Capacity utilisation across services, assignees and time — based on estimated hours per ticket type.
        </p>
      </div>

      {/* Filter bar */}
      <div style={{
        background: '#fff', border: '1px solid #e5e8ef', borderRadius: 12,
        padding: '12px 18px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center',
      }}>
        <DateRangePicker dateFrom={dateFrom} dateTo={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t) }} />

        <div style={{ width: 1, height: 28, background: '#e5e7eb', flexShrink: 0 }} />

        {[
          { label: 'All Teams',    val: teamF,    set: setTeamF,    opts: teams },
          { label: 'All Areas',    val: areaF,    set: setAreaF,    opts: areas },
          { label: 'All Assignees',val: assigneeF,set: setAssigneeF,opts: assignees },
        ].map(({ label, val, set, opts }) => (
          <select key={label} value={val} onChange={e => set(e.target.value)} style={{
            height: 30, padding: '0 8px', fontSize: 12, border: '1px solid #e5e7eb',
            borderRadius: 7, background: '#fff', color: val ? '#111827' : '#9ca3af',
            fontFamily: 'Inter, sans-serif', cursor: 'pointer', outline: 'none',
            borderColor: val ? '#a5b4fc' : '#e5e7eb',
          }}>
            <option value="">{label}</option>
            {opts.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        ))}

        {hasFilter && (
          <button onClick={() => { setTeamF(''); setAreaF(''); setAssigneeF(''); setDateFrom(''); setDateTo('') }}
            style={{ height: 30, padding: '0 10px', fontSize: 12, cursor: 'pointer', background: 'none', color: '#6b7280', border: '1px solid #e5e7eb', borderRadius: 7, fontFamily: 'Inter, sans-serif' }}>
            Clear
          </button>
        )}
      </div>

      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 }}>
          <div style={{ width: 36, height: 36, border: '3px solid #e5e7eb', borderTopColor: '#1450f5', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      )}

      {data && !loading && (<>

        {/* KPI cards */}
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <StatCard
            label="Team Utility Rate"
            value={`${data.team_util_pct}%`}
            sub={`${data.total_committed_h} h committed of ${data.total_capacity_h} h capacity`}
            color={utilColor(data.team_util_pct)}
            bg={data.team_util_pct >= 85 ? '#fff1f2' : data.team_util_pct >= 60 ? '#fffbeb' : '#ecfdf5'}
            border={data.team_util_pct >= 85 ? '#fda4af' : data.team_util_pct >= 60 ? '#fcd34d' : '#6ee7b7'}
          />
          <StatCard label="Committed Hours" value={`${data.total_committed_h}h`} sub="estimated hours in tracked tickets" color="#1450f5" bg="#eff6ff" border="#c7d7fd" />
          <StatCard label="Available Capacity" value={`${Math.max(0, data.total_capacity_h - data.total_committed_h)}h`} sub={`${data.team_size} people × 40h × ${data.span_weeks}w`} />
          <StatCard label="Time Span" value={`${data.span_weeks}w`} sub={`${data.span_days} calendar days`} />
          <StatCard label="Team Size" value={data.team_size} sub="assignees with tracked tickets" />
        </div>

        {/* Team gauge + service mix */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 16 }}>

          {/* Gauge */}
          <SectionCard title="Overall Team Utilisation" accent="#1450f5">
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <div style={{
                width: 140, height: 140, borderRadius: '50%', margin: '0 auto 16px',
                background: `conic-gradient(${utilColor(data.team_util_pct)} 0% ${Math.min(data.team_util_pct, 100)}%, #f0f3fa ${Math.min(data.team_util_pct, 100)}% 100%)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                position: 'relative',
              }}>
                <div style={{
                  width: 100, height: 100, borderRadius: '50%', background: '#fff',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{ fontSize: 26, fontWeight: 800, color: utilColor(data.team_util_pct) }}>{data.team_util_pct}%</span>
                  <span style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600 }}>UTILISED</span>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
                {Object.entries(STATUS_CFG).map(([s, cfg]) => {
                  const cnt = data.by_assignee.filter(a => a.status === s).length
                  if (!cnt) return null
                  return (
                    <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.color }} />
                      <span style={{ fontSize: 12, color: '#374151' }}>{s}: <strong>{cnt}</strong></span>
                    </div>
                  )
                })}
              </div>
              <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                {[['< 60%', '#1e8a5e', 'Available'], ['60–84%', '#b87d00', 'Busy'], ['≥ 85%', '#c0305a', 'Overloaded']].map(([range, col, label]) => (
                  <div key={label} style={{ fontSize: 11, color: col, background: col + '15', border: `1px solid ${col}40`, borderRadius: 20, padding: '2px 10px' }}>
                    {range} = {label}
                  </div>
                ))}
              </div>
            </div>
          </SectionCard>

          {/* Service mix donut */}
          <SectionCard title="Capacity Mix by Service" subtitle="Share of committed hours per service" accent="#7c3aed">
            {servicePieData.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#9ca3af', padding: 40, fontSize: 13 }}>No tracked data</div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={servicePieData} dataKey="value" nameKey="name" cx="40%" cy="50%"
                    innerRadius={60} outerRadius={95} paddingAngle={2}>
                    {servicePieData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                  </Pie>
                  <Tooltip content={<PieTT />} />
                  <Legend
                    layout="vertical" align="right" verticalAlign="middle"
                    formatter={(val) => <span style={{ fontSize: 11, color: '#374151' }}>{SERVICE_SHORT[val] || val}</span>}
                    iconType="circle" iconSize={8}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </SectionCard>
        </div>

        {/* By Service */}
        <SectionCard title="Utility Rate by Service" subtitle="Tickets · estimated hours · share of team capacity" accent="#0077a8">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

            {/* Bar chart */}
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={data.by_service.map(r => ({
                  name: SERVICE_SHORT[r.service] || r.service,
                  hours: r.committed_hours,
                  pct:   r.team_util_pct,
                  fill:  SERVICE_COLORS[r.service] || '#94a3b8',
                }))}
                layout="vertical" margin={{ top: 4, right: 60, left: 0, bottom: 4 }} barSize={14}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f3fa" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11, fill: '#374151' }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTT />} cursor={{ fill: '#f5f7ff' }} />
                <Bar dataKey="hours" name="Committed hrs" radius={[0, 4, 4, 0]}>
                  {data.by_service.map((r, i) => <Cell key={i} fill={SERVICE_COLORS[r.service] || '#94a3b8'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            {/* Table */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f9fafb' }}>
                    {['Service', 'Tickets', 'H/Ticket', 'Hours', '% of Capacity'].map(h => (
                      <th key={h} style={{ padding: '8px 10px', fontWeight: 700, color: '#6b7280', fontSize: 11, textAlign: h === 'Service' ? 'left' : 'center', borderBottom: '2px solid #e5e8ef', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.by_service.map((r, i) => (
                    <tr key={r.service} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #f0f3fa' }}>
                      <td style={{ padding: '8px 10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: SERVICE_COLORS[r.service], flexShrink: 0 }} />
                          <span style={{ color: '#111827', fontWeight: 500 }}>{SERVICE_SHORT[r.service] || r.service}</span>
                        </div>
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'center', color: '#374151' }}>{r.tickets}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'center', color: '#6b7280' }}>{r.hours_per_ticket}h</td>
                      <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700, color: '#1450f5' }}>{r.committed_hours}h</td>
                      <td style={{ padding: '8px 10px', minWidth: 120 }}>
                        <LoadBar pct={r.team_util_pct} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </SectionCard>

        {/* Weekly trend */}
        {data.weekly_trend.length > 0 && (
          <SectionCard title="Weekly Utility Rate Trend" subtitle="Committed hours vs team capacity week by week" accent="#b87d00">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={data.weekly_trend} margin={{ top: 8, right: 20, left: 0, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f3fa" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#6b7280' }} angle={-35} textAnchor="end" interval={0} />
                <YAxis yAxisId="h" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="p" orientation="right" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} unit="%" />
                <Tooltip content={<CustomTT />} />
                <ReferenceLine yAxisId="p" y={85} stroke="#c0305a" strokeDasharray="4 4" label={{ value: '85%', position: 'insideTopRight', fontSize: 10, fill: '#c0305a' }} />
                <ReferenceLine yAxisId="p" y={60} stroke="#b87d00" strokeDasharray="4 4" label={{ value: '60%', position: 'insideTopRight', fontSize: 10, fill: '#b87d00' }} />
                <Bar yAxisId="h" dataKey="committed_hours" name="Committed hrs" fill="#6366f133" radius={[3,3,0,0]} />
                <Line yAxisId="p" type="monotone" dataKey="utility_pct" name="Utility %" stroke="#1450f5" strokeWidth={2.5} dot={{ r: 3, fill: '#1450f5' }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </SectionCard>
        )}

        {/* By Assignee */}
        <SectionCard title="Utility Rate by Assignee" subtitle="Individual utilisation · committed vs available hours" accent="#1e8a5e">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  {[
                    { label: 'Assignee',         col: 'assigned_to'  },
                    { label: 'Tracked Tickets',  col: 'tracked_tickets' },
                    { label: 'Committed',        col: 'committed_hours' },
                    { label: 'Capacity',         col: 'capacity_hours' },
                    { label: 'Utility Rate',     col: 'utility_pct' },
                    { label: 'Status',           col: 'status' },
                  ].map(({ label, col }) => (
                    <th key={col} onClick={() => toggleSort(col)} style={{
                      padding: '9px 12px', fontWeight: 700, color: '#6b7280', fontSize: 11,
                      textAlign: label === 'Assignee' ? 'left' : 'center',
                      borderBottom: '2px solid #e5e8ef', cursor: 'pointer', userSelect: 'none',
                      whiteSpace: 'nowrap', background: '#f9fafb',
                    }}>
                      {label} <SortIcon col={col} />
                    </th>
                  ))}
                  {/* Service breakdown columns */}
                  {SERVICES.map(sc => (
                    <th key={sc} style={{
                      padding: '9px 10px', fontWeight: 700, fontSize: 10,
                      color: SERVICE_COLORS[sc], textAlign: 'center',
                      borderBottom: '2px solid #e5e8ef', whiteSpace: 'nowrap',
                      background: '#f5f5ff', borderLeft: sc === SERVICES[0] ? '2px solid #e0e0ff' : undefined,
                    }}>
                      {SERVICE_SHORT[sc]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedAssignees.length === 0 ? (
                  <tr><td colSpan={6 + SERVICES.length} style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>No data</td></tr>
                ) : sortedAssignees.map((row, i) => {
                  const sCfg = STATUS_CFG[row.status] || STATUS_CFG.Available
                  const bg = i % 2 === 0 ? '#fff' : '#fafafa'
                  return (
                    <tr key={row.assigned_to} style={{ background: bg, borderBottom: '1px solid #f0f3fa' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f0f4ff'}
                      onMouseLeave={e => e.currentTarget.style.background = bg}
                    >
                      <td style={{ padding: '9px 12px', fontWeight: 600, color: '#111827', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <div style={{
                            width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                            background: `hsl(${Math.abs(row.assigned_to.charCodeAt(0) * 37) % 360},55%,88%)`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700,
                          }}>{row.assigned_to.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}</div>
                          {row.assigned_to}
                        </div>
                      </td>
                      <td style={{ padding: '9px 12px', textAlign: 'center', color: '#374151' }}>{row.tracked_tickets}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 700, color: '#1450f5' }}>{row.committed_hours}h</td>
                      <td style={{ padding: '9px 12px', textAlign: 'center', color: '#6b7280' }}>{row.capacity_hours}h</td>
                      <td style={{ padding: '9px 12px', minWidth: 130 }}><LoadBar pct={row.utility_pct} /></td>
                      <td style={{ padding: '9px 12px', textAlign: 'center' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: sCfg.color, background: sCfg.bg, border: `1px solid ${sCfg.border}`, borderRadius: 20, padding: '3px 9px', whiteSpace: 'nowrap' }}>
                          {row.status}
                        </span>
                      </td>
                      {SERVICES.map((sc, idx) => {
                        const cnt = row.breakdown[sc] ?? 0
                        return (
                          <td key={sc} style={{
                            padding: '9px 10px', textAlign: 'center',
                            background: idx % 2 === 0 ? `${SERVICE_COLORS[sc]}08` : `${SERVICE_COLORS[sc]}12`,
                            borderLeft: idx === 0 ? '2px solid #e0e0ff' : undefined,
                          }}>
                            {cnt > 0 ? (
                              <span style={{ fontWeight: 700, fontSize: 12, color: SERVICE_COLORS[sc], background: `${SERVICE_COLORS[sc]}20`, borderRadius: 5, padding: '2px 7px' }}>{cnt}</span>
                            ) : <span style={{ color: '#d1d5db' }}>—</span>}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
              {/* Totals footer */}
              {sortedAssignees.length > 0 && (
                <tfoot>
                  <tr style={{ background: '#f0f4ff', borderTop: '2px solid #c7d7fd' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 700, color: '#1450f5' }}>Team Total</td>
                    <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: '#1450f5' }}>
                      {sortedAssignees.reduce((s, r) => s + r.tracked_tickets, 0)}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: '#1450f5' }}>{data.total_committed_h}h</td>
                    <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: '#6b7280' }}>{data.total_capacity_h}h</td>
                    <td style={{ padding: '8px 12px', minWidth: 130 }}><LoadBar pct={data.team_util_pct} /></td>
                    <td />
                    {SERVICES.map((sc, idx) => {
                      const tot = sortedAssignees.reduce((s, r) => s + (r.breakdown[sc] ?? 0), 0)
                      return (
                        <td key={sc} style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700, color: SERVICE_COLORS[sc], borderLeft: idx === 0 ? '2px solid #e0e0ff' : undefined }}>
                          {tot > 0 ? tot : '—'}
                        </td>
                      )
                    })}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </SectionCard>

        {/* By Ticket */}
        <SectionCard title={`By Ticket (${data.by_ticket.length} tracked)`} subtitle="Individual ticket estimated hours — sorted by most recent" accent="#94a3b8">
          <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1, maxWidth: 300 }}>
              <svg style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input value={ticketSearch} onChange={e => setTicketSearch(e.target.value)} placeholder="Search ticket, assignee, service…"
                style={{ width: '100%', boxSizing: 'border-box', paddingLeft: 28, height: 32, border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 12, color: '#374151', outline: 'none', fontFamily: 'Inter, sans-serif' }} />
            </div>
            <button onClick={() => setShowTickets(v => !v)} style={{ height: 32, padding: '0 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: showTickets ? '#f0f4ff' : '#fff', color: '#1450f5', border: '1px solid #c7d7fd', borderRadius: 7, fontFamily: 'Inter, sans-serif' }}>
              {showTickets ? '▲ Collapse' : '▼ Show tickets'}
            </button>
            <span style={{ fontSize: 12, color: '#9ca3af' }}>{filteredTickets.length} tickets</span>
          </div>

          {showTickets && (
            <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #e5e8ef' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f9fafb' }}>
                    {['Ticket #', 'Description', 'Service', 'Assignee', 'Created', 'Status', 'Est. Hours'].map(h => (
                      <th key={h} style={{ padding: '8px 10px', fontWeight: 700, color: '#6b7280', fontSize: 11, textAlign: h === 'Description' ? 'left' : 'center', borderBottom: '2px solid #e5e8ef', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredTickets.slice(0, 200).map((t, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #f0f3fa' }}>
                      <td style={{ padding: '7px 10px', textAlign: 'center', fontWeight: 600, color: '#1450f5', whiteSpace: 'nowrap' }}>{t.ticket_number || '—'}</td>
                      <td style={{ padding: '7px 10px', color: '#374151', maxWidth: 280 }}>{t.short_description || '—'}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: SERVICE_COLORS[t.sub_category] || '#6b7280', background: (SERVICE_COLORS[t.sub_category] || '#94a3b8') + '18', borderRadius: 5, padding: '2px 7px' }}>
                          {SERVICE_SHORT[t.sub_category] || t.sub_category}
                        </span>
                      </td>
                      <td style={{ padding: '7px 10px', textAlign: 'center', color: '#374151', whiteSpace: 'nowrap' }}>{t.assigned_to || '—'}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'center', color: '#6b7280', whiteSpace: 'nowrap' }}>{t.created_date ? t.created_date.slice(0, 10) : '—'}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                        <span style={{ fontSize: 10, color: '#6b7280', background: '#f3f4f6', borderRadius: 4, padding: '2px 6px' }}>{t.state || '—'}</span>
                      </td>
                      <td style={{ padding: '7px 10px', textAlign: 'center', fontWeight: 700, color: '#1450f5' }}>{t.estimated_hours}h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

      </>)}

    </div>
  )
}
