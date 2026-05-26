import { useEffect, useState, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie, Legend,
} from 'recharts'
import { getBandwidth, updateBandwidthRates } from '../api'

const WEEKLY_CAPACITY = 40

const STATUS = {
  Available:  { color: '#1e8a5e', bg: '#ecfdf5', border: '#6ee7b7', bar: '#1e8a5e' },
  Busy:       { color: '#b87d00', bg: '#fffbeb', border: '#fcd34d', bar: '#f59e0b' },
  Overloaded: { color: '#c0305a', bg: '#fff1f2', border: '#fda4af', bar: '#c0305a' },
}

function StatusBadge({ status }) {
  const cfg = STATUS[status] || STATUS.Available
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, color: cfg.color,
      background: cfg.bg, border: `1px solid ${cfg.border}`,
      borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap',
    }}>
      {status}
    </span>
  )
}

function LoadBar({ pct }) {
  const capped = Math.min(pct, 100)
  const color = pct >= 85 ? STATUS.Overloaded.bar : pct >= 60 ? STATUS.Busy.bar : STATUS.Available.bar
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
      <div style={{ flex: 1, height: 8, background: '#f0f3fa', borderRadius: 4, overflow: 'hidden', minWidth: 80 }}>
        <div style={{
          height: '100%', width: `${capped}%`, borderRadius: 4,
          background: color, transition: 'width 0.3s',
        }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color, minWidth: 38, textAlign: 'right' }}>
        {pct}%
      </span>
    </div>
  )
}

function StatCard({ label, value, sub, color, bg }) {
  return (
    <div style={{
      background: bg || '#fff', border: '1px solid #e5e8ef', borderRadius: 12,
      padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 140,
    }}>
      <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 28, fontWeight: 800, color: color || '#111827', lineHeight: 1 }}>{value}</span>
      {sub && <span style={{ fontSize: 11, color: '#9ca3af' }}>{sub}</span>}
    </div>
  )
}

function RatesModal({ rates, onSave, onClose }) {
  const [local, setLocal] = useState(() => Object.entries(rates).map(([k, v]) => ({ key: k, val: String(v) })))
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    const parsed = Object.fromEntries(local.map(r => [r.key, parseFloat(r.val) || 0]))
    setSaving(true)
    await onSave(parsed)
    setSaving(false)
    onClose()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, width: 480, maxWidth: '95vw',
        boxShadow: '0 20px 60px rgba(0,0,0,0.18)', padding: '28px 28px 24px',
      }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 4 }}>Bandwidth Rates</div>
        <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 20 }}>
          Tickets a specialist can complete per working day (8 h). Used to calculate hours per ticket.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {local.map((row, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ flex: 1, fontSize: 13, color: '#374151' }}>{row.key}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={row.val}
                  onChange={e => setLocal(l => l.map((r, j) => j === i ? { ...r, val: e.target.value } : r))}
                  style={{
                    width: 72, height: 34, border: '1px solid #e5e7eb', borderRadius: 8,
                    fontSize: 13, textAlign: 'center', fontFamily: 'Inter, sans-serif',
                    color: '#111827', outline: 'none',
                  }}
                />
                <span style={{ fontSize: 12, color: '#9ca3af' }}>tickets/day</span>
                <span style={{ fontSize: 11, color: '#d1d5db' }}>
                  = {(8 / (parseFloat(row.val) || 1)).toFixed(1)}h/ticket
                </span>
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            background: 'none', border: '1px solid #e5e7eb', borderRadius: 8,
            fontSize: 13, color: '#6b7280', cursor: 'pointer', padding: '8px 16px',
            fontFamily: 'Inter, sans-serif',
          }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{
            background: '#1450f5', color: '#fff', border: 'none', borderRadius: 8,
            fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '8px 20px',
            fontFamily: 'Inter, sans-serif', opacity: saving ? 0.7 : 1,
          }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

const BarTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e8ef', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
      <div style={{ fontWeight: 700, color: '#111827', marginBottom: 4 }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ color: p.fill || '#374151' }}>
          {p.name}: <strong>{p.value}h</strong>
        </div>
      ))}
    </div>
  )
}

export default function BandwidthPage({ sessionId, onSessionExpired }) {
  const [bw, setBw]             = useState(null)
  const [loading, setLoading]   = useState(true)
  const [showRates, setShowRates] = useState(false)
  const [search, setSearch]     = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  function load() {
    setLoading(true)
    getBandwidth(sessionId)
      .then(setBw)
      .catch(err => { if (err.sessionExpired) onSessionExpired?.() })
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [sessionId])

  async function handleSaveRates(rates) {
    await updateBandwidthRates(rates)
    load()
  }

  const members = bw?.members ?? []
  const hoursPerTicket = bw?.hours_per_ticket ?? {}

  const filtered = useMemo(() => {
    let rows = members
    if (search)       rows = rows.filter(r => r.assigned_to.toLowerCase().includes(search.toLowerCase()))
    if (statusFilter) rows = rows.filter(r => r.status === statusFilter)
    return rows
  }, [members, search, statusFilter])

  const stats = useMemo(() => {
    if (!members.length) return {}
    const totalCommitted = members.reduce((s, m) => s + m.committed_hours, 0)
    const totalAvailable = members.reduce((s, m) => s + m.available_hours, 0)
    const teamCapacity   = members.length * WEEKLY_CAPACITY
    return {
      total:          members.length,
      avgLoad:        Math.round(members.reduce((s, m) => s + m.load_pct, 0) / members.length),
      totalCommitted: Math.round(totalCommitted),
      totalAvailable: Math.round(totalAvailable),
      teamCapacity,
      available:      members.filter(m => m.status === 'Available').length,
      busy:           members.filter(m => m.status === 'Busy').length,
      overloaded:     members.filter(m => m.status === 'Overloaded').length,
    }
  }, [members])

  const chartData = useMemo(() =>
    filtered.slice(0, 20).map(m => ({
      name:      m.assigned_to.split(' ')[0],
      fullName:  m.assigned_to,
      committed: m.committed_hours,
      available: m.available_hours,
      status:    m.status,
      load:      m.load_pct,
    }))
  , [filtered])

  const pieData = useMemo(() => [
    { name: 'Committed', value: stats.totalCommitted || 0, color: '#1450f5' },
    { name: 'Available',  value: stats.totalAvailable || 0, color: '#d2f5ff' },
  ], [stats])

  const rateRows = useMemo(() => Object.entries(bw?.rates ?? {}).map(([sc, rate]) => ({
    sc, rate, hpt: hoursPerTicket[sc] ?? (8 / rate),
  })), [bw])

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300 }}>
      <div style={{ fontSize: 14, color: '#6b7280' }}>Calculating bandwidth…</div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: 0 }}>Bandwidth Tracker</h2>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '4px 0 0' }}>
            Current workload and capacity for each specialist based on active ticket mix.
            Weekly capacity = {WEEKLY_CAPACITY}h (8h × 5 days, Mon–Fri).
          </p>
        </div>
        <button
          onClick={() => setShowRates(true)}
          style={{
            background: 'none', border: '1px solid #e5e7eb', borderRadius: 8,
            padding: '7px 14px', fontSize: 13, fontWeight: 500, color: '#374151',
            cursor: 'pointer', fontFamily: 'Inter, sans-serif', flexShrink: 0,
          }}
        >
          ⚙ Edit Rates
        </button>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <StatCard label="Specialists"      value={stats.total}          sub="with active tickets" />
        <StatCard label="Avg Team Load"    value={`${stats.avgLoad}%`}  sub="of 40h weekly capacity"
          color={stats.avgLoad >= 85 ? '#c0305a' : stats.avgLoad >= 60 ? '#b87d00' : '#1e8a5e'}
          bg={stats.avgLoad >= 85 ? '#fff1f2' : stats.avgLoad >= 60 ? '#fffbeb' : '#ecfdf5'} />
        <StatCard label="Available"        value={stats.available}      sub="< 60% load"  color="#1e8a5e" bg="#ecfdf5" />
        <StatCard label="Busy"             value={stats.busy}           sub="60–85% load" color="#b87d00" bg="#fffbeb" />
        <StatCard label="Overloaded"       value={stats.overloaded}     sub="> 85% load"  color="#c0305a" bg="#fff1f2" />
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16 }}>

        {/* Team capacity donut */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e8ef', padding: '20px 16px' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 2 }}>Team Capacity</div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 4 }}>Total {stats.teamCapacity}h / week</div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="45%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
                {pieData.map(e => <Cell key={e.name} fill={e.color} />)}
              </Pie>
              <Tooltip formatter={(v) => `${v}h`} />
              <Legend iconType="circle" iconSize={9} wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Load per person bar chart */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e8ef', padding: '20px 16px' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 2 }}>Load per Specialist</div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8 }}>Committed vs available hours (40h week)</div>
          <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 36)}>
            <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 60, left: 8, bottom: 0 }} barSize={14}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f3fa" horizontal={false} />
              <XAxis type="number" domain={[0, 40]} tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} unit="h" />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#374151' }} axisLine={false} tickLine={false} width={70} />
              <Tooltip content={<BarTooltip />} cursor={{ fill: '#f0f3fa' }} />
              <Bar dataKey="committed" name="Committed" stackId="a" radius={[0, 0, 0, 0]}>
                {chartData.map((e) => <Cell key={e.fullName} fill={STATUS[e.status]?.bar || '#1e8a5e'} />)}
              </Bar>
              <Bar dataKey="available" name="Available" stackId="a" fill="#e5e8ef" radius={[4, 4, 4, 4]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Rate reference card */}
      <div style={{ background: '#fff', border: '1px solid #e5e8ef', borderRadius: 12, padding: '16px 20px' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 12 }}>Ticket Type Rates</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {rateRows.map(({ sc, rate, hpt }) => (
            <div key={sc} style={{
              background: '#f9fafb', border: '1px solid #e5e8ef', borderRadius: 8,
              padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: 2,
            }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{sc}</span>
              <div style={{ display: 'flex', gap: 10, fontSize: 11 }}>
                <span style={{ color: '#1450f5', fontWeight: 700 }}>{rate} tickets/day</span>
                <span style={{ color: '#9ca3af' }}>{hpt.toFixed(1)}h per ticket</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Filter bar */}
      <div style={{
        background: '#fff', border: '1px solid #e5e8ef', borderRadius: 12,
        padding: '14px 18px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center',
      }}>
        <div style={{ position: 'relative' }}>
          <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
            width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            placeholder="Search specialist…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              paddingLeft: 30, paddingRight: 10, height: 34, border: '1px solid #e5e7eb',
              borderRadius: 8, fontSize: 13, color: '#374151', outline: 'none',
              fontFamily: 'Inter, sans-serif', width: 190,
            }}
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          style={{
            height: 34, border: '1px solid #e5e7eb', borderRadius: 8,
            fontSize: 13, color: '#374151', padding: '0 10px',
            background: '#fff', cursor: 'pointer', fontFamily: 'Inter, sans-serif', minWidth: 140,
          }}
        >
          <option value="">All Statuses</option>
          {['Available', 'Busy', 'Overloaded'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {(search || statusFilter) && (
          <button
            onClick={() => { setSearch(''); setStatusFilter('') }}
            style={{
              background: 'none', border: '1px solid #e5e7eb', borderRadius: 8,
              fontSize: 12, color: '#6b7280', cursor: 'pointer', padding: '0 10px', height: 34,
              fontFamily: 'Inter, sans-serif',
            }}
          >Clear</button>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#9ca3af' }}>
          {filtered.length} of {members.length} specialists
        </span>
      </div>

      {/* Main table */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e8ef', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                {['Specialist', 'Active Tickets', 'Ticket Breakdown', 'Hours Committed', 'Load (40h week)', 'Avail. Hours', 'Can Take (approx)', 'Status'].map(h => (
                  <th key={h} style={{
                    padding: '10px 14px', fontSize: 11, fontWeight: 600, color: '#6b7280',
                    borderBottom: '2px solid #e5e8ef', textAlign: 'left', whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>No specialists found.</td></tr>
              ) : filtered.map((m, i) => (
                <tr
                  key={m.assigned_to}
                  style={{ background: i % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #f0f3fa' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f0f4ff'}
                  onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? '#fff' : '#fafafa'}
                >
                  {/* Specialist */}
                  <td style={{ padding: '10px 14px', fontWeight: 600, color: '#111827', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                        background: `hsl(${Math.abs(m.assigned_to.charCodeAt(0) * 37) % 360}, 55%, 88%)`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 700, color: '#374151',
                      }}>
                        {m.assigned_to.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      {m.assigned_to}
                    </div>
                  </td>

                  {/* Active tickets */}
                  <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                    <span style={{ fontWeight: 700, color: '#1450f5', fontSize: 15 }}>{m.active_tickets}</span>
                    {m.untracked_tickets > 0 && (
                      <div style={{ fontSize: 10, color: '#9ca3af' }}>{m.untracked_tickets} untracked</div>
                    )}
                  </td>

                  {/* Ticket breakdown */}
                  <td style={{ padding: '10px 14px', minWidth: 200 }}>
                    {Object.entries(m.ticket_breakdown).length === 0 ? (
                      <span style={{ color: '#d1d5db', fontSize: 12 }}>—</span>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {Object.entries(m.ticket_breakdown).map(([sc, cnt]) => (
                          <div key={sc} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 11, color: '#6b7280', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180 }}>{sc}</span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#374151', background: '#f0f3fa', borderRadius: 4, padding: '1px 5px' }}>{cnt}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </td>

                  {/* Committed hours */}
                  <td style={{ padding: '10px 14px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                    <span style={{ fontWeight: 700, color: '#111827' }}>{m.committed_hours}h</span>
                    <span style={{ color: '#9ca3af', fontSize: 11 }}> / 40h</span>
                  </td>

                  {/* Load bar */}
                  <td style={{ padding: '10px 14px', minWidth: 160 }}>
                    <LoadBar pct={m.load_pct} />
                  </td>

                  {/* Available hours */}
                  <td style={{ padding: '10px 14px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                    <span style={{
                      fontWeight: 700,
                      color: m.available_hours > 10 ? '#1e8a5e' : m.available_hours > 0 ? '#b87d00' : '#c0305a',
                    }}>
                      {m.available_hours}h
                    </span>
                  </td>

                  {/* Can take */}
                  <td style={{ padding: '10px 14px', minWidth: 180 }}>
                    {m.available_hours <= 0 ? (
                      <span style={{ fontSize: 12, color: '#c0305a', fontWeight: 600 }}>At capacity</span>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {Object.entries(m.capacity_by_type)
                          .filter(([, v]) => v > 0)
                          .sort((a, b) => b[1] - a[1])
                          .slice(0, 3)
                          .map(([sc, n]) => (
                            <div key={sc} style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                              <span style={{ fontSize: 10, color: '#6b7280', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 130 }}>{sc}</span>
                              <span style={{ fontSize: 11, fontWeight: 700, color: '#1e8a5e' }}>+{Math.floor(n)}</span>
                            </div>
                          ))}
                      </div>
                    )}
                  </td>

                  {/* Status */}
                  <td style={{ padding: '10px 14px' }}>
                    <StatusBadge status={m.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Tickets Raised by Service ─────────────────────────────────────── */}
      {(() => {
        const services = Object.keys(bw?.rates ?? {})
        if (!services.length || !filtered.length) return null

        // Short display labels for column headers
        const shortLabel = (s) => {
          if (s.includes('Website Content')) return 'Web Content Mgmt'
          if (s.includes('Demand Creation')) return 'Demand Creation'
          if (s.includes('Email')) return 'Email – Local'
          if (s.includes('Retention')) return 'Retention'
          if (s.includes('Graphic Design')) return 'Graphic Design'
          return s
        }

        const colColor = [
          '#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444',
        ]

        return (
          <div style={{ marginTop: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#111827' }}>
                Tickets Raised by Service
              </h2>
              <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 400 }}>
                — tickets created / raised by each specialist
              </span>
            </div>
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e8ef', overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f9fafb' }}>
                      <th style={{
                        padding: '10px 16px', fontSize: 11, fontWeight: 600, color: '#6b7280',
                        borderBottom: '2px solid #e5e8ef', textAlign: 'left', whiteSpace: 'nowrap',
                      }}>Specialist</th>
                      {services.map((sc, idx) => (
                        <th key={sc} style={{
                          padding: '10px 14px', fontSize: 11, fontWeight: 600, color: colColor[idx % colColor.length],
                          borderBottom: '2px solid #e5e8ef', textAlign: 'center', whiteSpace: 'nowrap',
                        }}>
                          {shortLabel(sc)}
                        </th>
                      ))}
                      <th style={{
                        padding: '10px 14px', fontSize: 11, fontWeight: 600, color: '#374151',
                        borderBottom: '2px solid #e5e8ef', textAlign: 'center', whiteSpace: 'nowrap',
                      }}>Total Raised</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((m, i) => {
                      const rb = m.raised_breakdown ?? {}
                      const total = Object.values(rb).reduce((a, v) => a + v, 0)
                      return (
                        <tr
                          key={m.assigned_to}
                          style={{ background: i % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #f0f3fa' }}
                          onMouseEnter={e => e.currentTarget.style.background = '#f0f4ff'}
                          onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? '#fff' : '#fafafa'}
                        >
                          <td style={{ padding: '10px 16px', fontWeight: 600, color: '#111827', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{
                                width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                                background: `hsl(${Math.abs(m.assigned_to.charCodeAt(0) * 37) % 360}, 55%, 88%)`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 10, fontWeight: 700, color: '#374151',
                              }}>
                                {m.assigned_to.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                              </div>
                              {m.assigned_to}
                            </div>
                          </td>
                          {services.map((sc, idx) => {
                            const cnt = rb[sc] ?? 0
                            return (
                              <td key={sc} style={{ padding: '10px 14px', textAlign: 'center' }}>
                                {cnt > 0 ? (
                                  <span style={{
                                    display: 'inline-block', minWidth: 28,
                                    fontWeight: 700, fontSize: 13,
                                    color: colColor[idx % colColor.length],
                                    background: `${colColor[idx % colColor.length]}14`,
                                    borderRadius: 6, padding: '2px 8px',
                                  }}>{cnt}</span>
                                ) : (
                                  <span style={{ color: '#d1d5db', fontSize: 12 }}>—</span>
                                )}
                              </td>
                            )
                          })}
                          <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                            {total > 0 ? (
                              <span style={{
                                display: 'inline-block', minWidth: 28,
                                fontWeight: 700, fontSize: 13, color: '#374151',
                                background: '#f0f3fa', borderRadius: 6, padding: '2px 8px',
                              }}>{total}</span>
                            ) : (
                              <span style={{ color: '#d1d5db', fontSize: 12 }}>—</span>
                            )}
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
      })()}

      {showRates && (
        <RatesModal
          rates={bw?.rates ?? {}}
          onSave={handleSaveRates}
          onClose={() => setShowRates(false)}
        />
      )}
    </div>
  )
}
