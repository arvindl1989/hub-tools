import { useEffect, useState, useCallback, useRef } from 'react'
import {
  getOverview, getHubHealth,
  getByArea, getByAssignee,
  getStackedByTeam, getStackedByCreator,
  getMonthlyStacked, getInflowOutflow,
} from '../api'
import HubHealthBar     from '../components/HubHealthBar'
import DashboardFilters from '../components/DashboardFilters'
import { PeriodPickerButton, labelForRange } from '../components/DateRangePicker'
import DeltaBadge        from '../components/DeltaBadge'
import StackedColumnChart from '../components/charts/StackedColumnChart'
import InflowOutflowChart from '../components/charts/InflowOutflowChart'
import InflowOutflowTable from '../components/charts/InflowOutflowTable'
import MiniPieChart      from '../components/charts/MiniPieChart'
import ComparisonBarChart from '../components/charts/ComparisonBarChart'
import PeriodOverlayChart from '../components/charts/PeriodOverlayChart'

function useRefetch(fn, set, onErr, deps) {
  const ref = useRef(0)
  useEffect(() => {
    const id = ++ref.current
    fn().then((d) => { if (id === ref.current) set(d) }).catch(onErr)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

// Sum a stacked row's sub-category columns into one total.
const rowTotal = (row, subCats) => subCats.reduce((s, sc) => s + (row[sc] || 0), 0)

const INIT_FILTERS = { assigned_to: '', team: '', area: '', sub_category: '' }
const EMPTY_STACK = { rows: [], sub_categories: [] }

export default function DashboardPage({ sessionId, onSessionExpired, onOpenExperimental }) {
  const [overview,    setOverview]    = useState(null)
  const [hubHealth,   setHubHealth]   = useState(null)
  const [byArea,      setByArea]      = useState([])
  const [byAssignee,  setByAssignee]  = useState([])
  const [byTeam,      setByTeam]      = useState(EMPTY_STACK)
  const [byCreator,   setByCreator]   = useState(EMPTY_STACK)
  const [monthly,     setMonthly]     = useState(EMPTY_STACK)
  const [inflowOutflow, setInflowOutflow] = useState([])

  const [filters, setFilters] = useState(INIT_FILTERS)
  const [range,   setRange]   = useState({ from: '', to: '' })
  const [groupBy, setGroupBy] = useState('week')

  // ── Period comparison (opt-in; everything above works unchanged when off) ──
  const [compareEnabled, setCompareEnabled] = useState(false)
  const [compareRange,   setCompareRange]   = useState({ from: '', to: '' })
  const [hubHealthB,   setHubHealthB]   = useState(null)
  const [byAreaB,      setByAreaB]      = useState([])
  const [byAssigneeB,  setByAssigneeB]  = useState([])
  const [byTeamB,      setByTeamB]      = useState(EMPTY_STACK)
  const [byCreatorB,   setByCreatorB]   = useState(EMPTY_STACK)
  const [monthlyB,     setMonthlyB]     = useState(EMPTY_STACK)
  const [inflowOutflowB, setInflowOutflowB] = useState([])

  const onErr = useCallback((err) => { if (err.sessionExpired) onSessionExpired() }, [onSessionExpired])

  const onFilter = useCallback((key, val) => {
    if (key === '__reset__') { setFilters(INIT_FILTERS); return }
    setFilters((f) => ({ ...f, [key]: val }))
  }, [])

  useEffect(() => {
    getOverview(sessionId).then(setOverview).catch(onErr)
  }, [sessionId, onErr])

  const fDeps = [range.from, range.to, JSON.stringify(filters)]

  useRefetch(() => getHubHealth(sessionId, range.from, range.to, filters),   setHubHealth,   onErr, fDeps)
  useRefetch(() => getByArea(sessionId, range.from, range.to, filters),      setByArea,      onErr, fDeps)
  useRefetch(() => getByAssignee(sessionId, range.from, range.to, filters),  setByAssignee,  onErr, fDeps)
  useRefetch(() => getStackedByTeam(sessionId, range.from, range.to, filters),          setByTeam,    onErr, fDeps)
  useRefetch(() => getStackedByCreator(sessionId, range.from, range.to, filters, 15),   setByCreator, onErr, fDeps)
  useRefetch(() => getMonthlyStacked(sessionId, range.from, range.to, filters), setMonthly,  onErr, fDeps)
  useRefetch(() => getInflowOutflow(sessionId, range.from, range.to, groupBy, filters), setInflowOutflow, onErr,
    [...fDeps, groupBy])

  // Comparison-period fetches — only hit the API while comparison is on
  const cDeps = [compareEnabled, compareRange.from, compareRange.to, JSON.stringify(filters)]
  useRefetch(() => compareEnabled ? getHubHealth(sessionId, compareRange.from, compareRange.to, filters) : Promise.resolve(null),
    setHubHealthB, onErr, cDeps)
  useRefetch(() => compareEnabled ? getByArea(sessionId, compareRange.from, compareRange.to, filters) : Promise.resolve([]),
    setByAreaB, onErr, cDeps)
  useRefetch(() => compareEnabled ? getByAssignee(sessionId, compareRange.from, compareRange.to, filters) : Promise.resolve([]),
    setByAssigneeB, onErr, cDeps)
  useRefetch(() => compareEnabled ? getStackedByTeam(sessionId, compareRange.from, compareRange.to, filters) : Promise.resolve(EMPTY_STACK),
    setByTeamB, onErr, cDeps)
  useRefetch(() => compareEnabled ? getStackedByCreator(sessionId, compareRange.from, compareRange.to, filters, 15) : Promise.resolve(EMPTY_STACK),
    setByCreatorB, onErr, cDeps)
  useRefetch(() => compareEnabled ? getMonthlyStacked(sessionId, compareRange.from, compareRange.to, filters) : Promise.resolve(EMPTY_STACK),
    setMonthlyB, onErr, cDeps)
  useRefetch(() => compareEnabled ? getInflowOutflow(sessionId, compareRange.from, compareRange.to, groupBy, filters) : Promise.resolve([]),
    setInflowOutflowB, onErr, [...cDeps, groupBy])

  const closedCompleted = hubHealth?.closed_completed ?? 0
  const closedRejected  = hubHealth?.closed_rejected  ?? 0
  const totalAll      = hubHealth?.total       ?? overview?.total_all ?? 0
  const inPipeline    = hubHealth?.in_pipeline ?? overview?.total_active ?? 0
  const uniqueTickets = hubHealth?.unique      ?? totalAll
  const dependency    = hubHealth?.dependency  ?? 0

  const closedCompletedB = hubHealthB?.closed_completed ?? 0
  const closedRejectedB  = hubHealthB?.closed_rejected  ?? 0
  const totalAllB      = hubHealthB?.total       ?? 0
  const inPipelineB    = hubHealthB?.in_pipeline ?? 0
  const uniqueTicketsB = hubHealthB?.unique      ?? totalAllB
  const dependencyB    = hubHealthB?.dependency  ?? 0

  const labelA = compareEnabled ? labelForRange(range.from, range.to) : null
  const labelB = compareEnabled ? labelForRange(compareRange.from, compareRange.to) : null
  const comparing = compareEnabled && (compareRange.from || compareRange.to)

  // Inflow/Outflow aggregate comparison stats
  const sumField = (arr, f) => arr.reduce((s, r) => s + (r[f] || 0), 0)
  const totalInA = sumField(inflowOutflow, 'inflow')
  const totalOutA = sumField(inflowOutflow, 'outflow')
  const totalInB = sumField(inflowOutflowB, 'inflow')
  const totalOutB = sumField(inflowOutflowB, 'outflow')
  const rateA = totalInA > 0 ? Math.round(totalOutA / totalInA * 1000) / 10 : null
  const rateB = totalInB > 0 ? Math.round(totalOutB / totalInB * 1000) / 10 : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Filters — govern every component on this page */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8e2d6', padding: '12px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <DashboardFilters overview={overview} filters={filters} range={range} onFilter={onFilter} onRange={setRange} />
      </div>

      {/* Period comparison toggle */}
      <div style={{
        background: comparing ? '#eef3fe' : '#fff', borderRadius: 12,
        border: `1px solid ${comparing ? '#c7d7fd' : '#e8e2d6'}`, padding: '10px 16px',
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      }}>
        <button
          onClick={() => setCompareEnabled((v) => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            borderRadius: 8, border: `1px solid ${compareEnabled ? '#1450f5' : '#e8e2d6'}`,
            background: compareEnabled ? '#1450f5' : '#fff',
            color: compareEnabled ? '#fff' : '#404040',
            fontFamily: 'Inter, sans-serif',
          }}
        >
          <CompareIcon />
          {compareEnabled ? 'Comparing periods' : 'Compare periods'}
        </button>

        {compareEnabled && (<>
          <span style={{ fontSize: 12, color: '#6e6e6e', fontWeight: 600 }}>
            {labelForRange(range.from, range.to)} <span style={{ color: '#9c9c9c', fontWeight: 400 }}>vs</span>
          </span>
          <PeriodPickerButton
            dateFrom={compareRange.from} dateTo={compareRange.to}
            onChange={(from, to) => setCompareRange({ from, to })}
            placeholder="Pick a period to compare"
          />
          {comparing && (
            <span style={{ fontSize: 11, color: '#1450f5', fontWeight: 600 }}>
              Every card and chart below now shows both periods.
            </span>
          )}
        </>)}
      </div>

      {/* Hub Health */}
      <Card title="Hub Health" subtitle="Live ticket state distribution" accent="#1450f5" icon={<PulseIcon />}>
        {comparing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <PeriodTag color="#1450f5" label={labelA} />
              <div style={{ marginTop: 8 }}><HubHealthBar data={hubHealth} /></div>
            </div>
            <div style={{ borderTop: '1px solid #f1ede3', paddingTop: 16 }}>
              <PeriodTag color="#e86427" label={labelB} />
              <div style={{ marginTop: 8 }}><HubHealthBar data={hubHealthB} /></div>
            </div>
          </div>
        ) : (
          <HubHealthBar data={hubHealth} />
        )}
      </Card>

      {/* KPI Row — flat KONE accent surfaces */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <KpiTile label="Total Tickets"  value={totalAll}       compareValue={comparing ? totalAllB : null}       icon={<TicketIcon />}   surface="#1450f5" ink="#ffffff" labelColor="rgba(255,255,255,0.75)" iconBg="rgba(255,255,255,0.18)" iconColor="#ffffff" span={2} />
        <ClosedKpiTile completed={closedCompleted} rejected={closedRejected} compareCompleted={comparing ? closedCompletedB : null} compareRejected={comparing ? closedRejectedB : null} />
        <KpiTile label="In Pipeline"    value={inPipeline}     compareValue={comparing ? inPipelineB : null}     icon={<PipeIcon />}     surface="#d2f5ff" ink="#141414" labelColor="#005f86" iconBg="rgba(255,255,255,0.6)" iconColor="#005f86" />
        <KpiTile label="Unique Tickets" value={uniqueTickets}  compareValue={comparing ? uniqueTicketsB : null}  icon={<StarIcon />}     surface="#ffcdd7" ink="#141414" labelColor="#8c1a2e" iconBg="rgba(255,255,255,0.6)" iconColor="#8c1a2e" />
        <KpiTile label="Dependency"     value={dependency}     compareValue={comparing ? dependencyB : null}     icon={<LinkIcon />}     surface="#ffe141" ink="#141414" labelColor="#7a5400" iconBg="rgba(255,255,255,0.55)" iconColor="#7a5400" />
      </div>

      {/* Inflow vs Outflow */}
      <Card title="Inflow vs Outflow" subtitle="Ticket creation vs resolution — positive net means backlog is growing" accent="#1450f5" icon={<TrendIcon />}
        controls={!comparing && (
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
        )}>
        {comparing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              <CompareStat label="Total Inflow"  valueA={totalInA}  valueB={totalInB}  labelA={labelA} labelB={labelB} />
              <CompareStat label="Total Outflow" valueA={totalOutA} valueB={totalOutB} labelA={labelA} labelB={labelB} />
              <CompareStat label="Resolution Rate" valueA={rateA} valueB={rateB} unit="%" labelA={labelA} labelB={labelB} />
            </div>
            <div>
              <SectionLabel>Inflow (Created) — aligned by week within period</SectionLabel>
              <PeriodOverlayChart
                seriesA={inflowOutflow.map(p => ({ label: p.label, value: p.inflow }))}
                seriesB={inflowOutflowB.map(p => ({ label: p.label, value: p.inflow }))}
                labelA={labelA} labelB={labelB} unitLabel="Week"
              />
            </div>
            <div>
              <SectionLabel>Outflow (Closed) — aligned by week within period</SectionLabel>
              <PeriodOverlayChart
                seriesA={inflowOutflow.map(p => ({ label: p.label, value: p.outflow }))}
                seriesB={inflowOutflowB.map(p => ({ label: p.label, value: p.outflow }))}
                labelA={labelA} labelB={labelB} unitLabel="Week"
              />
            </div>
          </div>
        ) : (<>
          <InflowOutflowChart data={inflowOutflow} noDateCols={overview != null && inflowOutflow.length === 0} />
          <InflowOutflowTable data={inflowOutflow} filters={filters} />
        </>)}
      </Card>

      {/* Row 1: Tickets by User + Tickets by Area */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Card title="Tickets by User" subtitle={comparing ? `${labelA} vs ${labelB}` : 'Volume per specialist'} accent="#1450f5" icon={<UserIcon />}>
          {comparing
            ? <ComparisonBarChart dataA={byAssignee} dataB={byAssigneeB} labelKey="assigned_to" labelA={labelA} labelB={labelB} />
            : <MiniPieChart data={byAssignee} labelKey="assigned_to" />}
        </Card>
        <Card title="Tickets by Area" subtitle={comparing ? `${labelA} vs ${labelB}` : 'Volume per area'} accent="#c0305a" icon={<MapIcon />}>
          {comparing
            ? <ComparisonBarChart dataA={byArea} dataB={byAreaB} labelKey="area" labelA={labelA} labelB={labelB} />
            : <MiniPieChart data={byArea} labelKey="area" />}
        </Card>
      </div>

      {/* Row 2: Tickets by Team + Tickets by Requested By */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Card title="Tickets by Team" subtitle={comparing ? `${labelA} vs ${labelB}` : 'Ticket volume over time · stacked by sub-category'} accent="#b87d00" icon={<TeamIcon />}>
          {comparing
            ? <ComparisonBarChart
                dataA={byTeam.rows.map(r => ({ team: r.team, count: rowTotal(r, byTeam.sub_categories) }))}
                dataB={byTeamB.rows.map(r => ({ team: r.team, count: rowTotal(r, byTeamB.sub_categories) }))}
                labelKey="team" labelA={labelA} labelB={labelB} />
            : <StackedColumnChart data={byTeam} xKey="team" height={300} />}
        </Card>
        <Card title="Tickets by Requested By" subtitle={comparing ? `${labelA} vs ${labelB}` : 'Top 15 requestors · stacked by sub-category'} accent="#0aa08f" icon={<InboxIcon />}>
          {comparing
            ? <ComparisonBarChart
                dataA={byCreator.rows.map(r => ({ ticket_creator: r.ticket_creator, count: rowTotal(r, byCreator.sub_categories) }))}
                dataB={byCreatorB.rows.map(r => ({ ticket_creator: r.ticket_creator, count: rowTotal(r, byCreatorB.sub_categories) }))}
                labelKey="ticket_creator" labelA={labelA} labelB={labelB} />
            : <StackedColumnChart data={byCreator} xKey="ticket_creator" height={300} />}
        </Card>
      </div>

      {/* Row 3: Monthly Trend */}
      <Card title="Monthly Inflow Trend" subtitle={comparing ? `${labelA} vs ${labelB} — aligned by month within period` : 'Ticket creation over time · stacked by sub-category'} accent="#0077a8" icon={<TrendIcon />}>
        {comparing
          ? <PeriodOverlayChart
              seriesA={monthly.rows.map(r => ({ label: r.label, value: rowTotal(r, monthly.sub_categories) }))}
              seriesB={monthlyB.rows.map(r => ({ label: r.label, value: rowTotal(r, monthlyB.sub_categories) }))}
              labelA={labelA} labelB={labelB} unitLabel="Month" height={320} />
          : <StackedColumnChart data={monthly} xKey="label" height={320} />}
      </Card>

      {/* Experimental Reports */}
      <div style={{
        background: '#f3eee6', borderRadius: 12, padding: '18px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
      }}>
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#141414', margin: 0 }}>Experimental Reports</h3>
          <p style={{ fontSize: 12, color: '#6e6e6e', margin: '4px 0 0' }}>
            Priority Tracker, Analytics, Bandwidth, Insights, Utility Rate and other legacy widgets — moved out of the main navigation.
          </p>
        </div>
        <button
          onClick={onOpenExperimental}
          style={{
            background: '#1450f5', color: '#fff', border: 'none', borderRadius: 8,
            padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          Open Experimental Reports
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
          </svg>
        </button>
      </div>

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

// ── Comparison helpers ──────────────────────────────────────────────────

function PeriodTag({ color, label }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700,
      color, background: `${color}15`, borderRadius: 6, padding: '3px 9px',
    }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: color }} />
      {label}
    </span>
  )
}

function SectionLabel({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 700, color: '#6e6e6e', marginBottom: 6 }}>{children}</div>
}

function CompareStat({ label, valueA, valueB, unit = '', labelA, labelB }) {
  return (
    <div style={{ background: '#faf8f3', border: '1px solid #f1ede3', borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#6e6e6e', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
        <span style={{ fontSize: 20, fontWeight: 800, color: '#1450f5' }}>{valueA ?? '—'}{valueA != null ? unit : ''}</span>
        <span style={{ fontSize: 12, color: '#9c9c9c' }}>vs</span>
        <span style={{ fontSize: 20, fontWeight: 800, color: '#e86427' }}>{valueB ?? '—'}{valueB != null ? unit : ''}</span>
        <DeltaBadge current={valueB} previous={valueA} size="sm" />
      </div>
      <div style={{ fontSize: 10, color: '#9c9c9c', marginTop: 4 }}>{labelA} → {labelB}</div>
    </div>
  )
}

// ── KPI Tile ──────────────────────────────────────────────────────────

function KpiTile({ label, value, compareValue, icon, surface = '#ffffff', ink = '#141414', labelColor = '#6e6e6e', iconBg = '#f1ede3', iconColor = '#141414', span = 1 }) {
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
      {compareValue != null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: labelColor }}>vs {compareValue}</span>
          <DeltaBadge current={value} previous={compareValue} size="sm" />
        </div>
      )}
    </div>
  )
}

// ── Closed KPI Tile (Completed + Rejected coupled, KONE mint surface) ─

function ClosedKpiTile({ completed, rejected, compareCompleted, compareRejected }) {
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
          {compareCompleted != null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4 }}>
              <span style={{ fontSize: 10, color: '#0f5132' }}>vs {compareCompleted}</span>
              <DeltaBadge current={completed} previous={compareCompleted} size="sm" />
            </div>
          )}
        </div>
        <div style={{ width: 1, background: 'rgba(20,20,20,0.15)' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 28, fontWeight: 800, color: '#8c1a2e', lineHeight: 1, letterSpacing: '-0.02em', margin: 0 }}>
            {rejected ?? '—'}
          </p>
          <p style={{ fontSize: 10, fontWeight: 700, color: '#8c1a2e', margin: '4px 0 0' }}>Rejected</p>
          {compareRejected != null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4 }}>
              <span style={{ fontSize: 10, color: '#8c1a2e' }}>vs {compareRejected}</span>
              <DeltaBadge current={rejected} previous={compareRejected} size="sm" />
            </div>
          )}
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
const TrendIcon   = I(<><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></>)
const InboxIcon   = I(<><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/></>)
const CompareIcon = I(<><path d="M8 3L4 7l4 4"/><path d="M4 7h16"/><path d="M16 21l4-4-4-4"/><path d="M20 17H4"/></>)
