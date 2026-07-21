import { useEffect, useState, useCallback, useRef } from 'react'
import {
  getOverview, getStackedByCreator, getResolvedBySpecialist,
  getWeeklyStacked, getBacklogAge,
} from '../api'
import DashboardFilters from '../components/DashboardFilters'
import StackedBarChart   from '../components/charts/StackedBarChart'
import StackedColumnChart from '../components/charts/StackedColumnChart'
import BacklogAgeChart   from '../components/charts/BacklogAgeChart'

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

// Widgets retired from the main Dashboard during the KPI section overhaul —
// same data, same logic, just relocated here under Experimental Reports.
export default function DashboardExtrasPage({ sessionId, onSessionExpired }) {
  const [overview,    setOverview]    = useState(null)
  const [byCreator,   setByCreator]   = useState({ rows: [], sub_categories: [] })
  const [bySpecialist,setBySpecialist]= useState({ rows: [], sub_categories: [] })
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

  useRefetch(() => getStackedByCreator(sessionId, range.from, range.to, filters, 20), setByCreator,    onErr, fDeps)
  useRefetch(() => getResolvedBySpecialist(sessionId, range.from, range.to, filters), setBySpecialist, onErr, fDeps)
  useRefetch(() => getWeeklyStacked(sessionId, 'created_date', range.from, range.to, filters), setInflow,  onErr, fDeps)
  useRefetch(() => getWeeklyStacked(sessionId, 'closed_date',  range.from, range.to, filters), setOutflow, onErr, fDeps)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      <div>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: '#141414', margin: 0 }}>Dashboard Extras</h2>
        <p style={{ fontSize: 12, color: '#6e6e6e', margin: '4px 0 0' }}>
          Widgets retired from the main Dashboard — Resolved by Specialist, Tickets by Requestor, Weekly Inflow/Outflow, Backlog Age.
        </p>
      </div>

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8e2d6', padding: '12px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <DashboardFilters overview={overview} filters={filters} range={range} onFilter={onFilter} onRange={setRange} />
      </div>

      {/* Resolved by Specialist */}
      <Card title="Resolved by Specialist" subtitle="Closed tickets per team member · stacked by sub-category" accent="#1e8a5e">
        <StackedBarChart
          data={{ ...bySpecialist, rows: bySpecialist.rows.filter((r) => !EXCLUDED.has(r.assigned_to)) }}
          dimKey="assigned_to"
        />
      </Card>

      {/* By Requestor */}
      <Card title="Tickets by Requestor" subtitle="Top 20 ticket creators · stacked by sub-category" accent="#c0305a">
        <StackedBarChart data={byCreator} dimKey="ticket_creator" />
      </Card>

      {/* Weekly Inflow + Outflow */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Card title="Weekly Ticket Inflow" subtitle="Created tickets · last 26 weeks" accent="#1450f5">
          <StackedColumnChart data={inflow} xKey="label" height={300} />
        </Card>
        <Card title="Weekly Ticket Outflow" subtitle="Closed tickets · last 26 weeks" accent="#1e8a5e">
          <StackedColumnChart data={outflow} xKey="label" height={300} />
        </Card>
      </div>

      {/* Backlog Age */}
      <Card title="Backlog Age Distribution" subtitle="How long active tickets have been open" accent="#c0305a">
        <BacklogAgeChart data={backlogAge} />
      </Card>

    </div>
  )
}

function Card({ title, subtitle, accent = '#1450f5', children }) {
  return (
    <div style={{
      background: '#ffffff', borderRadius: 12, border: '1px solid #e8e2d6',
      borderLeft: `3px solid ${accent}`,
      boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.04)',
    }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1ede3' }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: '#141414', margin: 0 }}>{title}</h3>
        {subtitle && <p style={{ fontSize: 11, color: '#9c9c9c', margin: '2px 0 0' }}>{subtitle}</p>}
      </div>
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  )
}
