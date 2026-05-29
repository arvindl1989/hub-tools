import { useEffect, useState, useCallback, useRef } from 'react'
import {
  getOverview, getMonthlyCreated,
  getWeeklyComparison, getWeeklyByAssignee,
  getByArea, getByTeam, getByCreator,
  getInflowOutflow, getSlaPerformance, getResolutionTime,
  getTeamPerformance, getBacklogAge, getInflowOutflowExportUrl,
} from '../api'

import MonthlyChart        from '../components/charts/MonthlyChart'
import WeeklyChart         from '../components/charts/WeeklyChart'
import WeeklyAssigneeChart from '../components/charts/WeeklyAssigneeChart'
import AreaChartComp       from '../components/charts/AreaChart'
import TeamChart           from '../components/charts/TeamChart'
import CreatorChart        from '../components/charts/CreatorChart'
import InflowOutflowChart  from '../components/charts/InflowOutflowChart'
import SlaPerformanceChart from '../components/charts/SlaPerformanceChart'
import ResolutionTimeChart from '../components/charts/ResolutionTimeChart'
import TeamPerformanceTable from '../components/charts/TeamPerformanceTable'
import BacklogAgeChart     from '../components/charts/BacklogAgeChart'
import DateRangePicker     from '../components/DateRangePicker'
import ChartFilters        from '../components/ChartFilters'

// Names excluded from team performance view
const EXCLUDED_MEMBERS = new Set(['Dheera Sameera', 'Pooja V', 'Suresh Karthik'])

// Section accent colours — brand palette
const COLOR = {
  indigo: '#1450f5',
  blue:   '#0077a8',
  green:  '#1e8a5e',
  amber:  '#b87d00',
  red:    '#c0305a',
  violet: '#7c3aed',
  pink:   '#c0305a',
  teal:   '#0f766e',
  slate:  '#94a3b8',
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

function useSection(dimKeys = []) {
  const [range,   setRange]   = useState({ from: '', to: '' })
  const [filters, setFilters] = useState(Object.fromEntries(dimKeys.map((k) => [k, ''])))
  return { range, setRange, filters, setFilters }
}

function useRefetch(fn, set, onErr, deps) {
  const ref = useRef(0)
  useEffect(() => {
    const id = ++ref.current
    fn().then((d) => { if (id === ref.current) set(d) }).catch(onErr)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AnalyticsPage({ sessionId, onSessionExpired }) {
  const [overview,      setOverview]      = useState(null)
  const [monthly,       setMonthly]       = useState([])
  const [weekly,        setWeekly]        = useState([])
  const [weeklyAss,     setWeeklyAss]     = useState({ weeks: [], assignees: [] })
  const [backlogAge,    setBacklogAge]    = useState([])
  const [teamPerfRange, setTeamPerfRange] = useState({ from: '', to: '' })

  const inflow    = useSection(['assigned_to', 'team', 'area', 'sub_category'])
  const slaperf   = useSection(['assigned_to', 'team', 'area', 'sub_category'])
  const restime   = useSection(['assigned_to', 'team', 'area', 'sub_category'])
  const byArea    = useSection(['team', 'sub_category', 'assigned_to'])
  const byTeam    = useSection(['area', 'sub_category', 'assigned_to'])
  const byCreator = useSection(['team', 'area', 'sub_category'])

  const [inflowData,    setInflowData]    = useState([])
  const [slaData,       setSlaData]       = useState([])
  const [resData,       setResData]       = useState(null)
  const [areaData,      setAreaData]      = useState([])
  const [teamData,      setTeamData]      = useState([])
  const [creatorData,   setCreatorData]   = useState([])
  const [teamPerf,      setTeamPerf]      = useState([])
  const [inflowGroupBy, setInflowGroupBy] = useState('week')
  const [areaView,      setAreaView]      = useState('bar')

  const onErr = useCallback((err) => { if (err.sessionExpired) onSessionExpired() }, [onSessionExpired])

  useEffect(() => {
    Promise.all([
      getOverview(sessionId), getMonthlyCreated(sessionId),
      getWeeklyComparison(sessionId), getWeeklyByAssignee(sessionId),
      getBacklogAge(sessionId),
    ]).then(([ov, mo, wk, wa, ba]) => {
      setOverview(ov); setMonthly(mo); setWeekly(wk); setWeeklyAss(wa); setBacklogAge(ba)
    }).catch(onErr)
  }, [sessionId, onErr])

  useRefetch(() => getTeamPerformance(sessionId, teamPerfRange.from, teamPerfRange.to),
    setTeamPerf, onErr, [teamPerfRange.from, teamPerfRange.to])

  useRefetch(() => getInflowOutflow(sessionId, inflow.range.from, inflow.range.to, inflowGroupBy, inflow.filters),
    setInflowData, onErr, [inflow.range.from, inflow.range.to, inflowGroupBy, JSON.stringify(inflow.filters)])

  useRefetch(() => getSlaPerformance(sessionId, slaperf.range.from, slaperf.range.to, slaperf.filters),
    setSlaData, onErr, [slaperf.range.from, slaperf.range.to, JSON.stringify(slaperf.filters)])

  useRefetch(() => getResolutionTime(sessionId, restime.range.from, restime.range.to, restime.filters),
    setResData, onErr, [restime.range.from, restime.range.to, JSON.stringify(restime.filters)])

  useRefetch(() => getByArea(sessionId, byArea.range.from, byArea.range.to, byArea.filters),
    setAreaData, onErr, [byArea.range.from, byArea.range.to, JSON.stringify(byArea.filters)])

  useRefetch(() => getByTeam(sessionId, byTeam.range.from, byTeam.range.to, byTeam.filters),
    setTeamData, onErr, [byTeam.range.from, byTeam.range.to, JSON.stringify(byTeam.filters)])

  useRefetch(() => getByCreator(sessionId, byCreator.range.from, byCreator.range.to, byCreator.filters),
    setCreatorData, onErr, [byCreator.range.from, byCreator.range.to, JSON.stringify(byCreator.filters)])

  // ── Derived KPIs ────────────────────────────────────────────────────────────
  const totalOnTime = slaData.reduce((s, d) => s + (d.closed_on_time || 0), 0)
  const totalClosed = slaData.reduce((s, d) => s + (d.total_closed  || 0), 0)
  const slaRate     = totalClosed > 0 ? Math.round(totalOnTime / totalClosed * 100) : null

  const resRows  = resData?.by_sub_category ?? []
  const resCases = resRows.reduce((s, r) => s + r.count, 0)
  const avgRes   = resCases > 0
    ? Math.round(resRows.reduce((s, r) => s + r.avg_days * r.count, 0) / resCases * 10) / 10
    : null

  const filteredTeamPerf = teamPerf.filter((r) => !EXCLUDED_MEMBERS.has(r.assigned_to))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 48 }}>

      {/* ── Page header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111827', margin: 0 }}>Analytics</h2>
          <p style={{ fontSize: 13, color: '#9ca3af', margin: '3px 0 0' }}>Executive overview · all figures based on uploaded data</p>
        </div>
        <button onClick={() => window.print()} className="btn-secondary print:hidden">
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          Print
        </button>
      </div>

      {/* ── 1. KPI row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <KpiCard
          label="SLA Compliance"
          value={slaRate != null ? `${slaRate}%` : '—'}
          detail={totalClosed > 0 ? `${totalOnTime} of ${totalClosed} closed on time` : 'No closed tickets'}
          tier={slaRate == null ? 'neutral' : slaRate >= 80 ? 'good' : slaRate >= 60 ? 'warn' : 'bad'}
          icon={<CheckIcon />}
        />
        <KpiCard
          label="Active Tickets"
          value={overview?.total_active ?? '—'}
          detail={`${overview?.overdue_sla ?? 0} overdue · ${overview?.due_within_5 ?? 0} due ≤5d`}
          tier={overview?.overdue_sla > 0 ? 'warn' : 'good'}
          icon={<TicketIcon />}
        />
        <KpiCard
          label="SLA Breaches"
          value={overview?.overdue_sla ?? '—'}
          detail="active tickets past SLA date"
          tier={!overview?.overdue_sla ? 'good' : overview.overdue_sla > 10 ? 'bad' : 'warn'}
          icon={<AlertIcon />}
        />
        <KpiCard
          label="Avg Resolution"
          value={avgRes != null ? `${avgRes}d` : '—'}
          detail="calendar days · closed tickets"
          tier={avgRes == null ? 'neutral' : avgRes <= 10 ? 'good' : avgRes <= 20 ? 'warn' : 'bad'}
          icon={<ClockIcon />}
        />
      </div>

      {/* ── 2. Team Performance ── */}
      <Section
        color={COLOR.indigo}
        title="Team Performance"
        subtitle="Workload, SLA compliance and delivery speed per team member"
        controls={
          <DateRangePicker
            dateFrom={teamPerfRange.from}
            dateTo={teamPerfRange.to}
            onChange={(from, to) => setTeamPerfRange({ from, to })}
          />
        }
      >
        <TeamPerformanceTable data={filteredTeamPerf} />
      </Section>

      {/* ── 3. Inflow vs Outflow ── */}
      <Section
        color={COLOR.blue}
        title="Inflow vs Outflow"
        subtitle="Ticket creation vs resolution — positive net means backlog is growing"
        controls={
          <Controls>
            <TogglePill
              options={[['week','Weekly'],['month','Monthly']]}
              value={inflowGroupBy}
              onChange={setInflowGroupBy}
            />
            <ChartFilters show={['assigned_to','team','area','sub_category']}
              overview={overview} filters={inflow.filters} onChange={inflow.setFilters} />
            <DateRangePicker dateFrom={inflow.range.from} dateTo={inflow.range.to}
              onChange={(from, to) => inflow.setRange({ from, to })} />
            <a
              href={getInflowOutflowExportUrl(sessionId, inflow.range.from, inflow.range.to, inflowGroupBy, inflow.filters)}
              download
              style={{ textDecoration: 'none' }}
            >
              <button style={{
                display: 'flex', alignItems: 'center', gap: 5,
                height: 30, padding: '0 12px',
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                background: '#fff', color: '#1e8a5e',
                border: '1px solid #6ee7b7', borderRadius: 7,
                fontFamily: 'Inter, sans-serif',
                whiteSpace: 'nowrap',
              }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Export
              </button>
            </a>
          </Controls>
        }
      >
        <InflowOutflowChart data={inflowData} />
      </Section>

      {/* ── 4. SLA Compliance ── */}
      <Section
        color={COLOR.green}
        title="SLA Compliance by Sub-Category"
        subtitle="On-time vs late delivery for closed tickets · active breach status"
        controls={
          <Controls>
            <ChartFilters show={['assigned_to','team','area','sub_category']}
              overview={overview} filters={slaperf.filters} onChange={slaperf.setFilters} />
            <DateRangePicker dateFrom={slaperf.range.from} dateTo={slaperf.range.to}
              onChange={(from, to) => slaperf.setRange({ from, to })} />
          </Controls>
        }
      >
        <SlaPerformanceChart data={slaData} />
      </Section>

      {/* ── 5. Resolution Speed ── */}
      <Section
        color={COLOR.amber}
        title="Resolution Speed"
        subtitle="Average calendar days from creation to closure"
        controls={
          <Controls>
            <ChartFilters show={['assigned_to','team','area','sub_category']}
              overview={overview} filters={restime.filters} onChange={restime.setFilters} />
            <DateRangePicker dateFrom={restime.range.from} dateTo={restime.range.to}
              onChange={(from, to) => restime.setRange({ from, to })} />
          </Controls>
        }
      >
        <ResolutionTimeChart data={resData} />
      </Section>

      {/* ── 6. Backlog + Area (side by side) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Section color={COLOR.red} title="Backlog Age" subtitle="How long active tickets have been open">
          <BacklogAgeChart data={backlogAge} />
        </Section>

        <Section
          color={COLOR.violet}
          title="Volume by Area"
          controls={
            <Controls>
              <TogglePill
                options={[['bar','Bar'],['pie','Pie']]}
                value={areaView}
                onChange={setAreaView}
              />
              <ChartFilters show={['team','sub_category']} overview={overview}
                filters={byArea.filters} onChange={byArea.setFilters} />
              <DateRangePicker dateFrom={byArea.range.from} dateTo={byArea.range.to}
                onChange={(from, to) => byArea.setRange({ from, to })} />
            </Controls>
          }
        >
          <AreaChartComp data={areaData} view={areaView} />
        </Section>
      </div>

      {/* ── 7. Volume by Team ── */}
      <Section
        color={COLOR.pink}
        title="Volume by Team"
        subtitle="Ticket creation split across business teams"
        controls={
          <Controls>
            <ChartFilters show={['area','sub_category']} overview={overview}
              filters={byTeam.filters} onChange={byTeam.setFilters} />
            <DateRangePicker dateFrom={byTeam.range.from} dateTo={byTeam.range.to}
              onChange={(from, to) => byTeam.setRange({ from, to })} />
          </Controls>
        }
      >
        <TeamChart data={teamData} />
      </Section>

      {/* ── 8. Volume by Requestor ── */}
      <Section
        color={COLOR.teal}
        title="Volume by Requestor"
        subtitle="Top ticket creators"
        controls={
          <Controls>
            <ChartFilters show={['team','area','sub_category']} overview={overview}
              filters={byCreator.filters} onChange={byCreator.setFilters} />
            <DateRangePicker dateFrom={byCreator.range.from} dateTo={byCreator.range.to}
              onChange={(from, to) => byCreator.setRange({ from, to })} />
          </Controls>
        }
      >
        <CreatorChart data={creatorData} limit={20} />
      </Section>

      {/* ── 9. Historical trends ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Section color={COLOR.slate} title="Monthly Volume Trend" subtitle="All-time ticket creation by month">
          <MonthlyChart data={monthly} />
        </Section>
        <Section color={COLOR.slate} title="Weekly Created vs Closed" subtitle="All-time weekly flow">
          <WeeklyChart data={weekly} limit={weekly.length} />
        </Section>
      </div>

      {/* ── 10. Weekly by assignee ── */}
      <Section
        color={COLOR.slate}
        title="Weekly Created by Assignee"
        subtitle="Stacked — toggle individuals using the legend"
      >
        <WeeklyAssigneeChart data={weeklyAss} assignees={weeklyAss.assignees} limit={weeklyAss.weeks?.length} />
      </Section>
    </div>
  )
}

// ── Section card ───────────────────────────────────────────────────────────────

function Section({ color, title, subtitle, controls, children }) {
  return (
    <div style={{
      background: '#ffffff',
      borderRadius: 12,
      border: '1px solid #e5e8ef',
      borderLeft: `3px solid ${color}`,
      boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.04)',
    }}>
      <div style={{
        padding: '14px 20px',
        borderBottom: '1px solid #f3f4f6',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: '#111827', lineHeight: 1.3, margin: 0 }}>{title}</h3>
            {subtitle && <p style={{ fontSize: 11, color: '#9ca3af', margin: '2px 0 0' }}>{subtitle}</p>}
          </div>
        </div>
        {controls && <div style={{ flexShrink: 0 }}>{controls}</div>}
      </div>
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  )
}

// ── KPI card ───────────────────────────────────────────────────────────────────

const TIER = {
  good:    { bar: '#1e8a5e', numColor: '#141414', bg: '#f0fff8', border: '#aae1c8' },
  warn:    { bar: '#b87d00', numColor: '#141414', bg: '#fffde8', border: '#ffe141' },
  bad:     { bar: '#c0305a', numColor: '#141414', bg: '#fff0f4', border: '#ffcdd7' },
  neutral: { bar: '#1450f5', numColor: '#1450f5', bg: '#eef3ff', border: '#d2f5ff' },
}

function KpiCard({ label, value, detail, tier = 'neutral', icon }) {
  const t = TIER[tier] ?? TIER.neutral
  return (
    <div style={{
      borderRadius: 12,
      border: '1px solid #e5e8ef',
      borderTop: `3px solid ${t.bar}`,
      background: '#ffffff',
      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
    }}>
      <div style={{ padding: '16px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 14 }}>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: '#6b7280', textTransform: 'uppercase', margin: 0 }}>{label}</p>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: t.bg, border: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.bar, flexShrink: 0 }}>
            {icon}
          </div>
        </div>
        <p style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-0.02em', color: '#111827', lineHeight: 1, margin: '0 0 10px' }}>{value}</p>
        <p style={{ fontSize: 12, color: '#9ca3af', margin: 0, lineHeight: 1.4 }}>{detail}</p>
      </div>
    </div>
  )
}

// ── Toolbar helpers ────────────────────────────────────────────────────────────

function Controls({ children }) {
  return <div className="flex flex-wrap gap-2 items-center">{children}</div>
}

function TogglePill({ options, value, onChange }) {
  return (
    <div className="flex rounded-lg border border-gray-200 overflow-hidden bg-white">
      {options.map(([v, label]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className="px-3 py-1 text-xs font-medium transition-colors"
          style={value === v
            ? { backgroundColor: '#1450f5', color: '#ffffff' }
            : { color: '#6b7280' }
          }
        >
          {label}
        </button>
      ))}
    </div>
  )
}

// ── Minimal icons ──────────────────────────────────────────────────────────────

const CheckIcon  = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
const TicketIcon = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" /></svg>
const AlertIcon  = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
const ClockIcon  = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
