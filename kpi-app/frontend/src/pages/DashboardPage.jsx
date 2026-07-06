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

  const closedCompleted = hubHealth?.closed_completed ?? 0
  const closedRejected  = hubHealth?.closed_rejected  ?? 0
  const totalAll      = hubHealth?.total       ?? overview?.total_all ?? 0
  const inPipeline    = hubHealth?.in_pipeline ?? overview?.total_active ?? 0
  const uniqueTickets = hubHealth?.unique      ?? totalAll
  const dependency    = hubHealth?.dependency  ?? 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Filters */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8e2d6', padding: '12px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <DashboardFilters overview={overview} filters={filters} range={range} onFilter={onFilter} onRange={setRange} />
      </div>

      {/* Hub Health */}
      <Card title="Hub Health" subtitle="Live ticket state distribution" accent="#1450f5" icon={<PulseIcon />}>
        <HubHealthBar data={hubHealth} />
      </Card>

      {/* KPI Row — flat KONE accent surfaces */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <KpiTile label="Total Tickets"  value={totalAll}       icon={<TicketIcon />}   surface="#1450f5" ink="#ffffff" labelColor="rgba(255,255,255,0.75)" iconBg="rgba(255,255,255,0.18)" iconColor="#ffffff" span={2} />
        <ClosedKpiTile completed={closedCompleted} rejected={closedRejected} />
        <KpiTile label="In Pipeline"    value={inPipeline}     icon={<PipeIcon />}     surface="#d2f5ff" ink="#141414" labelColor="#005f86" iconBg="rgba(255,255,255,0.6)" iconColor="#005f86" />
        <KpiTile label="Unique Tickets" value={uniqueTickets}  icon={<StarIcon />}     surface="#ffcdd7" ink="#141414" labelColor="#8c1a2e" iconBg="rgba(255,255,255,0.6)" iconColor="#8c1a2e" />
        <KpiTile label="Dependency"     value={dependency}     icon={<LinkIcon />}     surface="#ffe141" ink="#141414" labelColor="#7a5400" iconBg="rgba(255,255,255,0.55)" iconColor="#7a5400" />
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
      border: '1px solid #e8e2d6',
      borderLeft: `3px solid ${accent}`,
      boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.04)',
    }}>
      <div style={{
        padding: '14px 20px',
        borderBottom: '1px solid #f1ede3',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          {icon && (
            <div style={{ width: 30, height: 30, borderRadius: 8, background: `${accent}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: accent }}>
              {icon}
            </div>
          )}
          <div style={{ minWidth: 0 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: '#141414', margin: 0, lineHeight: 1.3 }}>{title}</h3>
            {subtitle && <p style={{ fontSize: 11, color: '#9c9c9c', margin: '2px 0 0', lineHeight: 1.3 }}>{subtitle}</p>}
          </div>
        </div>
        {controls && <div style={{ flexShrink: 0 }}>{controls}</div>}
      </div>
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  )
}

// ── KPI Tile ──────────────────────────────────────────────────────────

function KpiTile({ label, value, icon, surface = '#ffffff', ink = '#141414', labelColor = '#6e6e6e', iconBg = '#f1ede3', iconColor = '#141414', span = 1 }) {
  return (
    <div style={{
      background: surface,
      borderRadius: 12,
      padding: '16px 18px',
      boxShadow: '0 1px 3px rgba(20,20,20,0.06)',
      gridColumn: `span ${span}`,
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: labelColor, textTransform: 'uppercase', margin: 0 }}>
          {label}
        </p>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: iconColor, flexShrink: 0 }}>
          {icon}
        </div>
      </div>
      <p style={{ fontSize: 34, fontWeight: 800, color: ink, lineHeight: 1, letterSpacing: '-0.02em', margin: 0 }}>
        {value ?? '—'}
      </p>
    </div>
  )
}

// ── Closed KPI Tile (Completed + Rejected coupled, KONE mint surface) ─

function ClosedKpiTile({ completed, rejected }) {
  return (
    <div style={{
      background: '#aae1c8',
      borderRadius: 12,
      padding: '16px 18px',
      boxShadow: '0 1px 3px rgba(20,20,20,0.06)',
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: '#0f5132', textTransform: 'uppercase', margin: 0 }}>
          Closed
        </p>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0f5132', flexShrink: 0 }}>
          <CheckIcon />
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 14 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 28, fontWeight: 800, color: '#141414', lineHeight: 1, letterSpacing: '-0.02em', margin: 0 }}>
            {completed ?? '—'}
          </p>
          <p style={{ fontSize: 10, fontWeight: 700, color: '#0f5132', margin: '4px 0 0' }}>Completed</p>
        </div>
        <div style={{ width: 1, background: 'rgba(20,20,20,0.15)' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 28, fontWeight: 800, color: '#8c1a2e', lineHeight: 1, letterSpacing: '-0.02em', margin: 0 }}>
            {rejected ?? '—'}
          </p>
          <p style={{ fontSize: 10, fontWeight: 700, color: '#8c1a2e', margin: '4px 0 0' }}>Rejected</p>
        </div>
      </div>
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
const PulseIcon   = I(<><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></>)
const MapIcon     = I(<><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></>)
const TeamIcon    = I(<><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></>)
const UserIcon    = I(<><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></>)
const InboxIcon   = I(<><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/></>)
const TrendIcon   = I(<><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></>)
const ArrowDownIcon = I(<><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></>)
const ArrowUpIcon   = I(<><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></>)
const HourglassIcon = I(<><path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.172a2 2 0 00-.586-1.414L12 12l-4.414 4.414A2 2 0 007 17.828V22"/><path d="M7 2v4.172a2 2 0 00.586 1.414L12 12l4.414-4.414A2 2 0 0017 6.172V2"/></>)
