import { useEffect, useState, useCallback, useRef } from 'react'
import {
  getOverview, getHubHealth,
  getStackedByArea, getStackedByTeam, getStackedByCreator,
  getResolvedBySpecialist, getMonthlyStacked, getWeeklyStacked,
  getBacklogAge,
} from '../api'
import HubHealthBar    from '../components/HubHealthBar'
import DashboardFilters from '../components/DashboardFilters'
import StackedBarChart  from '../components/charts/StackedBarChart'
import StackedColumnChart from '../components/charts/StackedColumnChart'
import BacklogAgeChart  from '../components/charts/BacklogAgeChart'

const EXCLUDED = new Set(['Dheera Sameera', 'Pooja V', 'Suresh Karthik'])

function useRefetch(fn, set, onErr, deps) {
  const ref = useRef(0)
  useEffect(() => {
    const id = ++ref.current
    fn().then((d) => { if (id === ref.current) set(d) }).catch(onErr)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

const INIT_FILTERS = { assigned_to: '', team: '', area: '', sub_category: '' }

export default function DashboardPage({ sessionId, onSessionExpired }) {
  const [overview,    setOverview]    = useState(null)
  const [hubHealth,   setHubHealth]   = useState(null)
  const [byArea,      setByArea]      = useState({ rows: [], sub_categories: [] })
  const [byTeam,      setByTeam]      = useState({ rows: [], sub_categories: [] })
  const [byCreator,   setByCreator]   = useState({ rows: [], sub_categories: [] })
  const [bySpecialist,setBySpecialist]= useState({ rows: [], sub_categories: [] })
  const [monthly,     setMonthly]     = useState({ rows: [], sub_categories: [] })
  const [inflow,      setInflow]      = useState({ rows: [], sub_categories: [] })
  const [outflow,     setOutflow]     = useState({ rows: [], sub_categories: [] })
  const [backlogAge,  setBacklogAge]  = useState([])

  const [filters, setFilters] = useState(INIT_FILTERS)
  const [range,   setRange]   = useState({ from: '', to: '' })

  const onErr = useCallback((err) => { if (err.sessionExpired) onSessionExpired() }, [onSessionExpired])

  const onFilter = useCallback((key, val) => {
    if (key === '__reset__') { setFilters(INIT_FILTERS); return }
    setFilters((f) => ({ ...f, [key]: val }))
  }, [])

  useEffect(() => {
    getOverview(sessionId).then(setOverview).catch(onErr)
    getBacklogAge(sessionId).then(setBacklogAge).catch(onErr)
  }, [sessionId, onErr])

  const fDeps = [range.from, range.to, JSON.stringify(filters)]

  useRefetch(() => getHubHealth(sessionId, range.from, range.to, filters),            setHubHealth,    onErr, fDeps)
  useRefetch(() => getStackedByArea(sessionId, range.from, range.to, filters),        setByArea,       onErr, fDeps)
  useRefetch(() => getStackedByTeam(sessionId, range.from, range.to, filters),        setByTeam,       onErr, fDeps)
  useRefetch(() => getStackedByCreator(sessionId, range.from, range.to, filters, 20), setByCreator,    onErr, fDeps)
  useRefetch(() => getResolvedBySpecialist(sessionId, range.from, range.to, filters), setBySpecialist, onErr, fDeps)
  useRefetch(() => getMonthlyStacked(sessionId, range.from, range.to, filters),       setMonthly,      onErr, fDeps)
  useRefetch(() => getWeeklyStacked(sessionId, 'created_date', range.from, range.to, filters), setInflow,  onErr, fDeps)
  useRefetch(() => getWeeklyStacked(sessionId, 'closed_date',  range.from, range.to, filters), setOutflow, onErr, fDeps)

  const resolvedCount = hubHealth?.resolved    ?? 0
  const totalAll      = hubHealth?.total       ?? overview?.total_all ?? 0
  const inPipeline    = hubHealth?.in_pipeline ?? overview?.total_active ?? 0
  const uniqueTickets = hubHealth?.unique      ?? totalAll
  const dependency    = hubHealth?.dependency  ?? 0
  const overdueSla    = overview?.overdue_sla  ?? 0
  const due5          = overview?.due_within_5 ?? 0
  const avgAge        = overview?.avg_age      ?? 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Filters */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e8ef', padding: '12px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <DashboardFilters overview={overview} filters={filters} range={range} onFilter={onFilter} onRange={setRange} />
      </div>

      {/* Hub Health */}
      <Card title="Hub Health" subtitle="Live ticket state distribution" accent="#1450f5" icon={<PulseIcon />}>
        <HubHealthBar data={hubHealth} />
      </Card>

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <KpiTile label="Total Tickets"  value={totalAll}       icon={<TicketIcon />}   color="#1450f5" bg="#eff4ff" span={2} />
        <KpiTile label="Resolved"       value={resolvedCount}  icon={<CheckIcon />}    color="#1e8a5e" bg="#f0fdf4" />
        <KpiTile label="In Pipeline"    value={inPipeline}     icon={<PipeIcon />}     color="#0077a8" bg="#f0faff" />
        <KpiTile label="Unique Tickets" value={uniqueTickets}  icon={<StarIcon />}     color="#7c3aed" bg="#faf5ff" />
        <KpiTile label="Dependency"     value={dependency}     icon={<LinkIcon />}     color="#b87d00" bg="#fffbeb" />
        <KpiTile label="Overdue SLA"    value={overdueSla}     icon={<AlertIcon />}    color={overdueSla > 0 ? '#c0305a' : '#1e8a5e'} bg={overdueSla > 0 ? '#fff0f4' : '#f0fdf4'} />
        <KpiTile label="Due within 5d"  value={due5}           icon={<ClockIcon />}    color={due5 > 0 ? '#b87d00' : '#1e8a5e'} bg={due5 > 0 ? '#fffbeb' : '#f0fdf4'} />
        <KpiTile label="Avg Ticket Age" value={`${avgAge}d`}   icon={<CalIcon />}      color="#6b7280" bg="#f9fafb" />
      </div>

      {/* By Area + By Team */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Card title="Tickets by Area" subtitle="Stacked by sub-category" accent="#1450f5" icon={<MapIcon />}>
          <StackedBarChart data={byArea} dimKey="area" />
        </Card>
        <Card title="Tickets by Team" subtitle="Stacked by sub-category" accent="#b87d00" icon={<TeamIcon />}>
          <StackedBarChart data={byTeam} dimKey="team" />
        </Card>
      </div>

      {/* Resolved by Specialist */}
      <Card title="Resolved by Specialist" subtitle="Closed tickets per team member · stacked by sub-category" accent="#1e8a5e" icon={<UserIcon />}>
        <StackedBarChart
          data={{ ...bySpecialist, rows: bySpecialist.rows.filter((r) => !EXCLUDED.has(r.assigned_to)) }}
          dimKey="assigned_to"
        />
      </Card>

      {/* By Requestor */}
      <Card title="Tickets by Requestor" subtitle="Top 20 ticket creators · stacked by sub-category" accent="#c0305a" icon={<InboxIcon />}>
        <StackedBarChart data={byCreator} dimKey="ticket_creator" />
      </Card>

      {/* Monthly Trend */}
      <Card title="Monthly Inflow Trend" subtitle="Ticket creation over time · stacked by sub-category" accent="#0077a8" icon={<TrendIcon />}>
        <StackedColumnChart data={monthly} xKey="label" height={320} />
      </Card>

      {/* Weekly Inflow + Outflow */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Card title="Weekly Ticket Inflow" subtitle="Created tickets · last 26 weeks" accent="#1450f5" icon={<ArrowDownIcon />}>
          <StackedColumnChart data={inflow} xKey="label" height={300} />
        </Card>
        <Card title="Weekly Ticket Outflow" subtitle="Closed tickets · last 26 weeks" accent="#1e8a5e" icon={<ArrowUpIcon />}>
          <StackedColumnChart data={outflow} xKey="label" height={300} />
        </Card>
      </div>

      {/* Backlog Age */}
      <Card title="Backlog Age Distribution" subtitle="How long active tickets have been open" accent="#c0305a" icon={<HourglassIcon />}>
        <BacklogAgeChart data={backlogAge} />
      </Card>

    </div>
  )
}

// ── Card ──────────────────────────────────────────────────────────────

function Card({ title, subtitle, accent = '#1450f5', icon, controls, children }) {
  return (
    <div style={{
      background: '#ffffff',
      borderRadius: 12,
      border: '1px solid #e5e8ef',
      borderLeft: `3px solid ${accent}`,
      boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.04)',
    }}>
      <div style={{
        padding: '14px 20px',
        borderBottom: '1px solid #f3f4f6',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          {icon && (
            <div style={{ width: 30, height: 30, borderRadius: 8, background: `${accent}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: accent }}>
              {icon}
            </div>
          )}
          <div style={{ minWidth: 0 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: '#111827', margin: 0, lineHeight: 1.3 }}>{title}</h3>
            {subtitle && <p style={{ fontSize: 11, color: '#9ca3af', margin: '2px 0 0', lineHeight: 1.3 }}>{subtitle}</p>}
          </div>
        </div>
        {controls && <div style={{ flexShrink: 0 }}>{controls}</div>}
      </div>
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  )
}

// ── KPI Tile ──────────────────────────────────────────────────────────

function KpiTile({ label, value, icon, color, bg, span = 1 }) {
  return (
    <div style={{
      background: '#ffffff',
      borderRadius: 12,
      border: '1px solid #e5e8ef',
      borderTop: `3px solid ${color}`,
      padding: '16px 18px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      gridColumn: `span ${span}`,
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: '#6b7280', textTransform: 'uppercase', margin: 0 }}>
          {label}
        </p>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color, flexShrink: 0 }}>
          {icon}
        </div>
      </div>
      <p style={{ fontSize: 34, fontWeight: 800, color: '#111827', lineHeight: 1, letterSpacing: '-0.02em', margin: 0 }}>
        {value ?? '—'}
      </p>
    </div>
  )
}

// ── Icons (14×14 SVG) ─────────────────────────────────────────────────

const I = (d) => () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>

const TicketIcon  = I(<><path d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z"/></>)
const CheckIcon   = I(<><path d="M20 6L9 17l-5-5"/></>)
const PipeIcon    = I(<><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></>)
const StarIcon    = I(<><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></>)
const LinkIcon    = I(<><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></>)
const AlertIcon   = I(<><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>)
const ClockIcon   = I(<><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>)
const CalIcon     = I(<><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>)
const PulseIcon   = I(<><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></>)
const MapIcon     = I(<><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></>)
const TeamIcon    = I(<><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></>)
const UserIcon    = I(<><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></>)
const InboxIcon   = I(<><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/></>)
const TrendIcon   = I(<><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></>)
const ArrowDownIcon = I(<><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></>)
const ArrowUpIcon   = I(<><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></>)
const HourglassIcon = I(<><path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.172a2 2 0 00-.586-1.414L12 12l-4.414 4.414A2 2 0 007 17.828V22"/><path d="M7 2v4.172a2 2 0 00.586 1.414L12 12l4.414-4.414A2 2 0 0017 6.172V2"/></>)
