import { useEffect, useState, useCallback, useRef } from 'react'
import {
  getOverview, getMonthlyCreated,
  getWeeklyComparison, getWeeklyByAssignee,
  getByArea, getByTeam, getByCreator,
  getInflowOutflow, getInflowOutflowProjections, getSlaPerformance, getResolutionTime,
  getTeamPerformance, getBacklogAge, getInflowOutflowExportUrl,
  getSessionDebug,
} from '../api'

import MonthlyChart        from '../components/charts/MonthlyChart'
import WeeklyChart         from '../components/charts/WeeklyChart'
import WeeklyAssigneeChart from '../components/charts/WeeklyAssigneeChart'
import AreaChartComp       from '../components/charts/AreaChart'
import TeamChart           from '../components/charts/TeamChart'
import CreatorChart        from '../components/charts/CreatorChart'
import InflowOutflowChart  from '../components/charts/InflowOutflowChart'
import InflowOutflowProjections from '../components/charts/InflowOutflowProjections'
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
  violet: '#0077a8',
  pink:   '#c0305a',
  teal:   '#0aa08f',
  slate:  '#9c9c9c',
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

  const kpiCards  = useSection(['assigned_to', 'team', 'area', 'sub_category'])
  const inflow    = useSection(['assigned_to', 'team', 'area', 'sub_category'])
  const slaperf   = useSection(['assigned_to', 'team', 'area', 'sub_category'])
  const restime   = useSection(['assigned_to', 'team', 'area', 'sub_category'])
  const byArea    = useSection(['team', 'sub_category', 'assigned_to'])
  const byTeam    = useSection(['area', 'sub_category', 'assigned_to'])
  const byCreator = useSection(['team', 'area', 'sub_category'])

  const [inflowData,      setInflowData]      = useState([])
  const [projectionData,  setProjectionData]  = useState(null)
  const [forecastPeriods, setForecastPeriods] = useState(12)
  const [slaData,         setSlaData]         = useState([])
  const [resData,         setResData]         = useState(null)
  const [kpiSlaData,      setKpiSlaData]      = useState([])
  const [kpiResData,      setKpiResData]      = useState(null)
  const [areaData,        setAreaData]        = useState([])
  const [teamData,        setTeamData]        = useState([])
  const [creatorData,     setCreatorData]     = useState([])
  const [teamPerf,        setTeamPerf]        = useState([])
  const [inflowGroupBy,   setInflowGroupBy]   = useState('week')
  const [areaView,        setAreaView]        = useState('bar')
  const [loadError,       setLoadError]       = useState(null)
  const [loading,         setLoading]         = useState(true)

  const onErr = useCallback((err) => {
    if (err.sessionExpired) { onSessionExpired(); return }
    setLoadError(err?.response?.data?.detail || err?.message || 'Unknown error')
  }, [onSessionExpired])

  useEffect(() => {
    setLoading(true)
    setLoadError(null)
    Promise.all([
      getOverview(sessionId), getMonthlyCreated(sessionId),
      getWeeklyComparison(sessionId), getWeeklyByAssignee(sessionId),
      getBacklogAge(sessionId),
    ]).then(([ov, mo, wk, wa, ba]) => {
      setOverview(ov); setMonthly(mo); setWeekly(wk); setWeeklyAss(wa); setBacklogAge(ba)
      setLoading(false)
    }).catch(err => {
      setLoading(false)
      onErr(err)
    })
  }, [sessionId, onErr])

  useRefetch(() => getTeamPerformance(sessionId, teamPerfRange.from, teamPerfRange.to),
    setTeamPerf, onErr, [sessionId, teamPerfRange.from, teamPerfRange.to])

  useRefetch(() => getOverview(sessionId, kpiCards.filters.assigned_to, kpiCards.filters.team, kpiCards.filters.area, kpiCards.filters.sub_category, kpiCards.range.from, kpiCards.range.to),
    setOverview, onErr, [sessionId, JSON.stringify(kpiCards.filters), kpiCards.range.from, kpiCards.range.to])

  useRefetch(() => getInflowOutflow(sessionId, inflow.range.from, inflow.range.to, inflowGroupBy, inflow.filters),
    setInflowData, onErr, [sessionId, inflow.range.from, inflow.range.to, inflowGroupBy, JSON.stringify(inflow.filters)])

  useRefetch(() => getInflowOutflowProjections(sessionId, inflowGroupBy, forecastPeriods, inflow.filters),
    setProjectionData, onErr, [sessionId, inflowGroupBy, forecastPeriods, JSON.stringify(inflow.filters)])

  useRefetch(() => getSlaPerformance(sessionId, slaperf.range.from, slaperf.range.to, slaperf.filters),
    setSlaData, onErr, [sessionId, slaperf.range.from, slaperf.range.to, JSON.stringify(slaperf.filters)])

  useRefetch(() => getResolutionTime(sessionId, restime.range.from, restime.range.to, restime.filters),
    setResData, onErr, [sessionId, restime.range.from, restime.range.to, JSON.stringify(restime.filters)])

  useRefetch(() => getSlaPerformance(sessionId, kpiCards.range.from, kpiCards.range.to, kpiCards.filters),
    setKpiSlaData, onErr, [sessionId, kpiCards.range.from, kpiCards.range.to, JSON.stringify(kpiCards.filters)])

  useRefetch(() => getResolutionTime(sessionId, kpiCards.range.from, kpiCards.range.to, kpiCards.filters),
    setKpiResData, onErr, [sessionId, kpiCards.range.from, kpiCards.range.to, JSON.stringify(kpiCards.filters)])

  useRefetch(() => getByArea(sessionId, byArea.range.from, byArea.range.to, byArea.filters),
    setAreaData, onErr, [sessionId, byArea.range.from, byArea.range.to, JSON.stringify(byArea.filters)])

  useRefetch(() => getByTeam(sessionId, byTeam.range.from, byTeam.range.to, byTeam.filters),
    setTeamData, onErr, [sessionId, byTeam.range.from, byTeam.range.to, JSON.stringify(byTeam.filters)])

  useRefetch(() => getByCreator(sessionId, byCreator.range.from, byCreator.range.to, byCreator.filters),
    setCreatorData, onErr, [sessionId, byCreator.range.from, byCreator.range.to, JSON.stringify(byCreator.filters)])

  // ── Derived KPIs ────────────────────────────────────────────────────────────
  const totalOnTime = kpiSlaData.reduce((s, d) => s + (d.closed_on_time || 0), 0)
  const totalClosed = kpiSlaData.reduce((s, d) => s + (d.total_closed  || 0), 0)
  const slaRate     = totalClosed > 0 ? Math.round(totalOnTime / totalClosed * 100) : null

  const resRows  = kpiResData?.by_sub_category ?? []
  const resCases = resRows.reduce((s, r) => s + r.count, 0)
  const avgRes   = resCases > 0
    ? Math.round(resRows.reduce((s, r) => s + r.avg_days * r.count, 0) / resCases * 10) / 10
    : null

  const filteredTeamPerf = teamPerf.filter((r) => !EXCLUDED_MEMBERS.has(r.assigned_to))

  if (loadError) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 300, gap: 12 }}>
        <div style={{ fontSize: 13, color: '#c0305a', background: '#fff0f3', border: '1px solid #ffcdd7', borderRadius: 10, padding: '12px 20px', maxWidth: 500, textAlign: 'center' }}>
          <strong>Could not load analytics data</strong><br />
          <span style={{ fontSize: 12, color: '#6e6e6e' }}>{loadError}</span>
        </div>
        <button
          onClick={() => { setLoadError(null); setLoading(true); onSessionExpired() }}
          style={{ fontSize: 13, fontWeight: 600, color: '#1450f5', background: '#eef3fe', border: '1px solid #c7d7fd', borderRadius: 8, padding: '8px 18px', cursor: 'pointer' }}
        >
          Refresh data
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 48 }}>

      {/* ── Page header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#141414', margin: 0 }}>Analytics</h2>
          <p style={{ fontSize: 13, color: '#9c9c9c', margin: '3px 0 0' }}>Executive overview · all figures based on uploaded data</p>
        </div>
        <button onClick={() => window.print()} className="btn-secondary print:hidden">
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          Print
        </button>
      </div>

      {/* ── Data quality banner (shown when overview loaded but no inflow data) ── */}
      {!loading && overview != null && inflowData.length === 0 && (
        <DataDiagnosticBanner sessionId={sessionId} />
      )}

      {/* ── KPI Filters ── */}
      <div style={{ background: '#ffffff', borderRadius: 12, border: '1px solid #e8e2d6', padding: '12px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#6e6e6e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Filter KPI Cards</span>
          <ChartFilters show={['assigned_to', 'team', 'area', 'sub_category']}
            overview={overview} filters={kpiCards.filters} onChange={kpiCards.setFilters} />
          <DateRangePicker dateFrom={kpiCards.range.from} dateTo={kpiCards.range.to}
            onChange={(from, to) => kpiCards.setRange({ from, to })} />
        </div>
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

      {/* ── 2. Inflow vs Outflow ── */}
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
                border: '1px solid #aae1c8', borderRadius: 7,
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
        <InflowOutflowChart data={inflowData} noDateCols={!loading && overview != null && inflowData.length === 0} />
        <InflowOutflowTable data={inflowData} filters={inflow.filters} />
      </Section>

      {/* ── Inflow vs Outflow Projections ── */}
      <Section
        color={COLOR.blue}
        title="Inflow vs Outflow - Growth Projections"
        subtitle="Forecasted trends based on historical data — realistic growth projections"
        controls={
          <Controls>
            <TogglePill
              options={[['week','Weekly'],['month','Monthly']]}
              value={inflowGroupBy}
              onChange={setInflowGroupBy}
            />
            <ChartFilters show={['assigned_to','team','area','sub_category']}
              overview={overview} filters={inflow.filters} onChange={inflow.setFilters} />
          </Controls>
        }
      >
        <InflowOutflowProjections
          data={projectionData}
          groupBy={inflowGroupBy}
          onForecastChange={setForecastPeriods}
        />
      </Section>

      {/* ── 3. Team Performance ── */}
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

// ── Data diagnostic banner ────────────────────────────────────────────────────

function DataDiagnosticBanner({ sessionId }) {
  const [info, setInfo] = useState(null)
  const [open, setOpen] = useState(false)

  const load = () => {
    if (info) { setOpen(o => !o); return }
    getSessionDebug(sessionId).then(d => { setInfo(d); setOpen(true) }).catch(() => {})
  }

  const dateColsWithData = info?.date_columns_with_data ?? []
  const dateColsFound    = info?.date_columns_found ?? []

  return (
    <div style={{ background: '#fffae3', border: '1px solid #ffea82', borderRadius: 10, padding: '12px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ fontSize: 13, color: '#7a5400', fontWeight: 600 }}>
          ⚠ Charts are empty — your data was loaded but no date values could be read
        </span>
        <button
          onClick={load}
          style={{ fontSize: 12, fontWeight: 600, color: '#1450f5', background: '#eef3fe', border: '1px solid #c7d7fd', borderRadius: 7, padding: '5px 12px', cursor: 'pointer', flexShrink: 0 }}
        >
          {open ? 'Hide details' : 'Diagnose'}
        </button>
      </div>
      {open && info && (
        <div style={{ marginTop: 10, fontSize: 12, color: '#404040', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div><strong>Total rows:</strong> {info.total_rows}</div>
          <div><strong>Date columns found:</strong> {dateColsFound.length ? dateColsFound.join(', ') : 'None — check column names in your Google Sheet'}</div>
          <div><strong>Date columns with data:</strong> {dateColsWithData.length ? dateColsWithData.join(', ') : 'None — dates may not have parsed correctly'}</div>
          {dateColsFound.map(col => {
            const ci = info.columns[col]
            return (
              <div key={col} style={{ background: '#faf8f3', border: '1px solid #e8e2d6', borderRadius: 6, padding: '6px 10px' }}>
                <strong>{col}</strong>: {ci.non_null} rows with data
                {ci.sample?.length ? <> · sample: <code style={{ background: '#f1ede3', padding: '1px 4px', borderRadius: 4 }}>{ci.sample[0]}</code></> : ' · (all empty)'}
              </div>
            )
          })}
          <div style={{ color: '#6e6e6e', marginTop: 4 }}>
            Expected column names: <em>Created, Closed, Due date, Preferred Live Date</em> (or similar — see COLUMN_ALIASES)
          </div>
        </div>
      )}
    </div>
  )
}

// ── Section card ───────────────────────────────────────────────────────────────

function Section({ color, title, subtitle, controls, children }) {
  return (
    <div style={{
      background: '#ffffff',
      borderRadius: 12,
      border: '1px solid #e8e2d6',
      borderLeft: `3px solid ${color}`,
      boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.04)',
      overflow: 'hidden',
    }}>
      {/* Title row — compact, never crowded */}
      <div style={{
        padding: '12px 20px',
        borderBottom: '1px solid #f1ede3',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 7,
          background: `${color}18`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: color }} />
        </div>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: '#141414', lineHeight: 1.3, margin: 0 }}>{title}</h3>
          {subtitle && <p style={{ fontSize: 11, color: '#9c9c9c', margin: '2px 0 0' }}>{subtitle}</p>}
        </div>
      </div>

      {/* Controls toolbar — full width, wraps cleanly */}
      {controls && (
        <div style={{
          padding: '10px 20px',
          borderBottom: '1px solid #f1ede3',
          background: '#f5f8fe',
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        }}>
          {controls}
        </div>
      )}

      <div style={{ padding: 20 }}>{children}</div>
    </div>
  )
}

// ── Toolbar helpers ────────────────────────────────────────────────────────────

function Controls({ children }) {
  return <>{children}</>
}

const TIER = {
  good:    { bar: '#1e8a5e', numColor: '#141414', bg: '#edf8f2', border: '#aae1c8' },
  warn:    { bar: '#b87d00', numColor: '#141414', bg: '#fffde8', border: '#ffe141' },
  bad:     { bar: '#c0305a', numColor: '#141414', bg: '#fff0f3', border: '#ffcdd7' },
  neutral: { bar: '#1450f5', numColor: '#1450f5', bg: '#eef3fe', border: '#d2f5ff' },
}

function KpiCard({ label, value, detail, tier = 'neutral', icon }) {
  const t = TIER[tier] ?? TIER.neutral
  return (
    <div style={{
      borderRadius: 12,
      border: '1px solid #e8e2d6',
      borderTop: `3px solid ${t.bar}`,
      background: '#ffffff',
      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
    }}>
      <div style={{ padding: '16px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 14 }}>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: '#6e6e6e', textTransform: 'uppercase', margin: 0 }}>{label}</p>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: t.bg, border: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.bar, flexShrink: 0 }}>
            {icon}
          </div>
        </div>
        <p style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-0.02em', color: '#141414', lineHeight: 1, margin: '0 0 10px' }}>{value}</p>
        <p style={{ fontSize: 12, color: '#9c9c9c', margin: 0, lineHeight: 1.4 }}>{detail}</p>
      </div>
    </div>
  )
}

function TogglePill({ options, value, onChange }) {
  return (
    <div style={{
      display: 'flex', borderRadius: 8,
      border: '1px solid #e8e2d6', overflow: 'hidden',
      background: '#fff', flexShrink: 0, height: 30,
    }}>
      {options.map(([v, label], i) => {
        const active = value === v
        return (
          <button
            key={v}
            onClick={() => onChange(v)}
            style={{
              padding: '0 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              border: 'none', fontFamily: 'Inter, sans-serif',
              borderRight: i < options.length - 1 ? '1px solid #e8e2d6' : 'none',
              background: active ? '#1450f5' : '#fff',
              color:      active ? '#fff'    : '#6e6e6e',
              transition: 'background 0.12s, color 0.12s',
            }}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

// ── Inflow / Outflow table ─────────────────────────────────────────────────────

function _rateStyle(rate) {
  if (rate === null || rate === undefined) return {}
  if (rate < 50)   return { background: '#ffdee5', color: '#8c1a2e' }
  if (rate < 80)   return { background: '#ffd4dd', color: '#c0305a' }
  if (rate < 100)  return { background: '#fff6c4', color: '#7a5400' }
  if (rate <= 150) return { background: '#d3efe0', color: '#147a50' }
  return { background: '#aae1c8', color: '#0f5132' }
}

function _filterName(filters) {
  if (!filters) return 'All'
  if (filters.assigned_to) return filters.assigned_to
  if (filters.team)        return `Team: ${filters.team}`
  if (filters.area)        return `Area: ${filters.area}`
  if (filters.sub_category) return filters.sub_category
  return 'All'
}

function _pipelineStyle(val, prev) {
  if (val == null) return {}
  if (prev != null && val < prev)  return { background: '#d3efe0', color: '#147a50' }  // shrinking — good
  if (prev != null && val > prev)  return { background: '#ffdee5', color: '#8c1a2e' }  // growing — bad
  return { background: '#fff6c4', color: '#7a5400' }                                  // no change / first period
}

function InflowOutflowTable({ data = [], filters = {} }) {
  if (!data.length) return null

  const name     = _filterName(filters)
  const totalIn  = data.reduce((s, r) => s + r.inflow,  0)
  const totalOut = data.reduce((s, r) => s + r.outflow, 0)
  const totalRate = (totalIn > 0 || totalOut > 0) ? Math.round(totalOut / Math.max(totalIn, 1) * 1000) / 10 : null

  // Pipeline snapshot comes from backend (created_date <= period_end AND no closed_date yet)
  const pipelines = data.map(r => r.open_pipeline ?? null)

  // Union of pipeline stages across all periods, sorted by latest-period count
  // (descending). "Resolved Later" always sinks to the bottom.
  const latestStages = data[data.length - 1]?.pipeline_stages ?? {}
  const stageNames = [...new Set(data.flatMap(r => Object.keys(r.pipeline_stages ?? {})))]
    .sort((a, b) => {
      if (a === 'Resolved Later') return 1
      if (b === 'Resolved Later') return -1
      return (latestStages[b] ?? 0) - (latestStages[a] ?? 0)
    })

  const NAME_W   = 150
  const METRIC_W = 140

  const stickyBase = (left, bg) => ({
    position: 'sticky', left, zIndex: 1,
    background: bg, whiteSpace: 'nowrap',
  })

  const hdrCell = (extra = {}) => ({
    padding: '8px 12px', fontSize: 11, fontWeight: 700,
    background: '#1450f5', color: '#fff',
    borderRight: '1px solid #3b70f7',
    textAlign: 'center', whiteSpace: 'nowrap',
    ...extra,
  })

  const numCell = (bg = '#fff') => ({
    padding: '7px 12px', textAlign: 'center',
    fontSize: 12, color: '#404040',
    borderRight: '1px solid #f3eee6',
    background: bg,
  })

  return (
    <div style={{ marginTop: 16, overflowX: 'auto', borderRadius: 8, border: '1px solid #e8e2d6' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: '100%' }}>
        <thead>
          <tr>
            <th style={{ ...hdrCell({ textAlign: 'left', minWidth: NAME_W }), ...stickyBase(0, '#1450f5') }}>
              Name
            </th>
            <th style={{ ...hdrCell({ textAlign: 'left', minWidth: METRIC_W }), ...stickyBase(NAME_W, '#1450f5') }}>
              Metric
            </th>
            <th style={hdrCell({ minWidth: 72 })}>Total</th>
            {data.map(r => (
              <th key={r.period} style={hdrCell({ minWidth: 110 })}>{r.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>

          {/* ── Assigned ── */}
          <tr>
            <td style={{ ...numCell(), ...stickyBase(0, '#fff'), padding: '8px 12px', fontWeight: 700, color: '#141414', borderRight: '1px solid #e8e2d6' }}>
              {name}
            </td>
            <td style={{ ...numCell(), ...stickyBase(NAME_W, '#fff'), padding: '8px 12px', fontWeight: 600, color: '#404040', borderRight: '2px solid #e8e2d6' }}>
              Assigned
            </td>
            <td style={{ ...numCell('#eef3fe'), fontWeight: 700, color: '#1450f5' }}>
              {totalIn.toLocaleString()}
            </td>
            {data.map(r => (
              <td key={r.period} style={numCell()}>{r.inflow || '—'}</td>
            ))}
          </tr>

          {/* ── Resolved ── */}
          <tr>
            <td style={{ ...numCell('#faf8f3'), ...stickyBase(0, '#faf8f3'), padding: '8px 12px', borderRight: '1px solid #e8e2d6' }} />
            <td style={{ ...numCell('#faf8f3'), ...stickyBase(NAME_W, '#faf8f3'), padding: '8px 12px', fontWeight: 600, color: '#404040', borderRight: '2px solid #e8e2d6' }}>
              Resolved
            </td>
            <td style={{ ...numCell('#eef3fe'), fontWeight: 700, color: '#1450f5' }}>
              {totalOut.toLocaleString()}
            </td>
            {data.map(r => (
              <td key={r.period} style={numCell('#faf8f3')}>{r.outflow || '—'}</td>
            ))}
          </tr>

          {/* ── Resolution Rate ── */}
          <tr>
            <td style={{ ...numCell(), ...stickyBase(0, '#fff'), padding: '8px 12px', borderRight: '1px solid #e8e2d6' }} />
            <td style={{ ...numCell(), ...stickyBase(NAME_W, '#fff'), padding: '8px 12px', fontWeight: 600, color: '#404040', borderRight: '2px solid #e8e2d6' }}>
              Resolution Rate
            </td>
            <td style={{ ...numCell(), ..._rateStyle(totalRate), fontWeight: 700, textAlign: 'center' }}>
              {totalRate != null ? `${totalRate}%` : '—'}
            </td>
            {data.map(r => {
              const rate = (r.inflow > 0 || r.outflow > 0) ? Math.round(r.outflow / Math.max(r.inflow, 1) * 1000) / 10 : null
              return (
                <td key={r.period} style={{ ...numCell(), ..._rateStyle(rate), fontWeight: rate != null ? 600 : 400 }}>
                  {rate != null ? `${rate}%` : '—'}
                </td>
              )
            })}
          </tr>

          {/* ── Open Pipeline ── */}
          <tr style={{ borderTop: '2px solid #e8e2d6' }}>
            <td style={{ ...numCell('#fffae3'), ...stickyBase(0, '#fffae3'), padding: '8px 12px', borderRight: '1px solid #e8e2d6' }} />
            <td style={{ ...numCell('#fffae3'), ...stickyBase(NAME_W, '#fffae3'), padding: '8px 12px', fontWeight: 700, color: '#8a5f00', borderRight: '2px solid #e8e2d6' }}>
              Open Pipeline
            </td>
            <td style={{ ...numCell('#fffae3'), fontSize: 11, color: '#9c9c9c', fontStyle: 'italic' }}>
              latest →
            </td>
            {pipelines.map((pl, i) => {
              const prev = i > 0 ? pipelines[i - 1] : null
              return (
                <td key={data[i].period} style={{ ...numCell(), ..._pipelineStyle(pl, prev), fontWeight: 700 }}>
                  {pl ?? '—'}
                </td>
              )
            })}
          </tr>

          {/* ── Pipeline stages (breakdown of the open pipeline snapshot) ── */}
          {stageNames.map(stage => {
            const muted = stage === 'Resolved Later'
            return (
              <tr key={stage}>
                <td style={{ ...numCell('#fffdf5'), ...stickyBase(0, '#fffdf5'), padding: '6px 12px', borderRight: '1px solid #e8e2d6' }} />
                <td style={{ ...numCell('#fffdf5'), ...stickyBase(NAME_W, '#fffdf5'), padding: '6px 12px 6px 24px', fontSize: 11, fontWeight: 500, color: muted ? '#9c9c9c' : '#7a5400', fontStyle: muted ? 'italic' : 'normal', borderRight: '2px solid #e8e2d6' }}>
                  {stage}
                </td>
                <td style={{ ...numCell('#fffae3'), fontSize: 11, fontWeight: 700, color: muted ? '#9c9c9c' : '#8a5f00' }}>
                  {latestStages[stage] ?? '—'}
                </td>
                {data.map(r => {
                  const v = r.pipeline_stages?.[stage] ?? 0
                  return (
                    <td key={r.period} style={{ ...numCell('#fffdf5'), fontSize: 11, color: muted ? '#9c9c9c' : '#5c4200', fontWeight: v ? 600 : 400 }}>
                      {v || '—'}
                    </td>
                  )
                })}
              </tr>
            )
          })}

          {/* ── Closed Break Up (by closed date) ── */}
          <tr style={{ borderTop: '2px solid #e8e2d6' }}>
            <td style={{ ...numCell('#edf8f2'), ...stickyBase(0, '#edf8f2'), padding: '8px 12px', borderRight: '1px solid #e8e2d6' }} />
            <td style={{ ...numCell('#edf8f2'), ...stickyBase(NAME_W, '#edf8f2'), padding: '8px 12px', fontWeight: 700, color: '#147a50', borderRight: '2px solid #e8e2d6' }}>
              Closed Break Up
            </td>
            <td style={{ ...numCell('#edf8f2') }} />
            {data.map(r => (
              <td key={r.period} style={numCell('#edf8f2')} />
            ))}
          </tr>
          {[
            { key: 'closed_completed', label: 'Closed Completed', color: '#147a50' },
            { key: 'closed_rejected',  label: 'Closed Rejected',  color: '#8c1a2e' },
          ].map(({ key, label, color }) => (
            <tr key={key}>
              <td style={{ ...numCell('#fbfefc'), ...stickyBase(0, '#fbfefc'), padding: '6px 12px', borderRight: '1px solid #e8e2d6' }} />
              <td style={{ ...numCell('#fbfefc'), ...stickyBase(NAME_W, '#fbfefc'), padding: '6px 12px 6px 24px', fontSize: 11, fontWeight: 500, color, borderRight: '2px solid #e8e2d6' }}>
                {label}
              </td>
              <td style={{ ...numCell('#edf8f2'), fontSize: 11, fontWeight: 700, color }}>
                {data.reduce((s, r) => s + (r[key] || 0), 0).toLocaleString()}
              </td>
              {data.map(r => {
                const v = r[key] ?? 0
                return (
                  <td key={r.period} style={{ ...numCell('#fbfefc'), fontSize: 11, color, fontWeight: v ? 600 : 400 }}>
                    {v || '—'}
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

// ── Minimal icons ──────────────────────────────────────────────────────────────

const CheckIcon  = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
const TicketIcon = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" /></svg>
const AlertIcon  = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
const ClockIcon  = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
