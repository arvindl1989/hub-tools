import { useEffect, useState, useMemo, useRef } from 'react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend,
  ReferenceLine,
} from 'recharts'
import {
  getUtilityRate, getCapacitySettings, updateCapacitySettings,
  getBandwidthRates, updateBandwidthRates, getSlaRules, updateSlaRules,
  getCadenceSettings, updateCadenceSettings, getTrainingSettings, updateTrainingSettings,
} from '../api'
import DateRangePicker from '../components/DateRangePicker'

const DEFAULT_PEOPLE = ['Ajith', 'Akshaya P', 'Akshayaa R', 'Arvind', 'Nitish', 'Ranjith']

const BAU_SERVICES = [
  'Website Content Management',
  'Demand Engagement Activations',
  'Content Production – Graphic Design',
]
const BAU_SHORT = {
  'Website Content Management':          'Web Content',
  'Demand Engagement Activations':       'Demand Engagement',
  'Content Production – Graphic Design': 'Graphic Design',
}
const BAU_COLORS = {
  'Website Content Management':          '#3b82f6',
  'Demand Engagement Activations':       '#8b5cf6',
  'Content Production – Graphic Design': '#ef4444',
}

// Original sub-category colors (used in ticket detail rows)
const SUBCAT_COLORS = {
  'Website Content Management':          '#3b82f6',
  'Content Production – Graphic Design': '#ef4444',
  'Demand Creation – Global':            '#8b5cf6',
  'Email – Local':                       '#10b981',
  'Retention – Activations':             '#f59e0b',
}
const SUBCAT_SHORT = {
  'Website Content Management':          'Web Content',
  'Content Production – Graphic Design': 'Graphic Design',
  'Demand Creation – Global':            'Demand Creation',
  'Email – Local':                       'Email Local',
  'Retention – Activations':             'Retention',
}

const STATUS_CFG = {
  Available:  { color: '#1e8a5e', bg: '#ecfdf5', border: '#6ee7b7' },
  Busy:       { color: '#b87d00', bg: '#fffbeb', border: '#fcd34d' },
  Overloaded: { color: '#c0305a', bg: '#fff1f2', border: '#fda4af' },
}

const NON_BAU = ['Performance Analytics', 'Local SEO', 'PWR', 'Adhoc/Others']
const NON_BAU_COLORS = {
  'Performance Analytics': '#14b8a6',
  'Local SEO':             '#f97316',
  'PWR':                   '#6366f1',
  'Adhoc/Others':          '#ec4899',
}

function utilColor(pct) {
  if (pct >= 85) return '#c0305a'
  if (pct >= 60) return '#b87d00'
  return '#1e8a5e'
}
function dtcColor(d) {
  if (d == null) return '#9ca3af'
  if (d <= 7)  return '#1e8a5e'
  if (d <= 14) return '#b87d00'
  if (d <= 30) return '#e86427'
  return '#c0305a'
}
function attStyle(pct) {
  if (pct == null) return { color: '#9ca3af', bg: 'transparent' }
  if (pct >= 100) return { color: '#0369a1', bg: '#e0f2fe' }
  if (pct >= 80)  return { color: '#15803d', bg: '#dcfce7' }
  if (pct >= 50)  return { color: '#854d0e', bg: '#fef9c3' }
  return { color: '#991b1b', bg: '#fee2e2' }
}

/* ── Shared primitives ──────────────────────────────────────────────────────── */
function StatCard({ label, value, sub, color, bg, border }) {
  return (
    <div style={{ background: bg || '#fff', border: `1px solid ${border || '#e5e8ef'}`, borderRadius: 12, padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 150 }}>
      <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      <span style={{ fontSize: 30, fontWeight: 800, color: color || '#111827', lineHeight: 1 }}>{value}</span>
      {sub && <span style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{sub}</span>}
    </div>
  )
}
function LoadBar({ pct }) {
  const col = utilColor(pct)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
      <div style={{ flex: 1, height: 7, background: '#f0f3fa', borderRadius: 4, overflow: 'hidden', minWidth: 60 }}>
        <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: col, borderRadius: 4 }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color: col, minWidth: 42, textAlign: 'right' }}>{pct}%</span>
    </div>
  )
}
function SectionCard({ title, subtitle, children, accent = '#1450f5' }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e8ef', borderLeft: `3px solid ${accent}`, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
      <div style={{ padding: '12px 20px', borderBottom: '1px solid #f3f4f6' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{subtitle}</div>}
      </div>
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  )
}
const NumInput = ({ value, onChange, min, max, step, width = 70, placeholder }) => (
  <input type="number" value={value ?? ''} placeholder={placeholder} step={step} min={min} max={max}
    onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
    style={{ width, height: 30, padding: '0 6px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 6, textAlign: 'center', fontFamily: 'Inter, sans-serif', outline: 'none', boxSizing: 'border-box' }} />
)

/* ── Pie tooltip ────────────────────────────────────────────────────────────── */
const PieTT = ({ active, payload }) => {
  if (!active || !payload?.length) return null
  const p = payload[0]
  const value = typeof p.value === 'number' ? p.value.toFixed(1) : p.value
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e8ef', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
      <div style={{ fontWeight: 700, color: '#111827', marginBottom: 4 }}>{BAU_SHORT[p.name] || p.name}</div>
      <div style={{ color: '#374151' }}>{value} hrs · {p.payload.pct}%</div>
    </div>
  )
}
const DtcTT = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e8ef', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
      <div style={{ fontWeight: 700, color: '#111827', marginBottom: 4 }}>{label}</div>
      <div style={{ color: dtcColor(d.avg_days_to_close) }}>Avg: <strong>{d.avg_days_to_close}d</strong></div>
      {d.min_days_to_close != null && d.min_days_to_close !== d.max_days_to_close && (
        <div style={{ color: '#9ca3af', fontSize: 11 }}>Range: {d.min_days_to_close}d – {d.max_days_to_close}d</div>
      )}
      <div style={{ color: '#1450f5', marginTop: 2 }}>Tickets: <strong>{d.tracked_tickets}</strong></div>
    </div>
  )
}

/* ── Allocated / Utilized summary widgets ────────────────────────────────── */
function AllocUtilWidgets({ capSettings, cadenceSettings, trainingSettings, data, assigneeF = [], serviceF = '' }) {
  const spanDays  = data?.span_days  ?? 365
  const spanWeeks = data?.span_weeks ?? 52
  const pf = spanDays / 365
  const defWd = capSettings.default_working_days ?? 250
  const defH  = capSettings.default_holidays ?? 24

  const activePeople = assigneeF.length > 0 ? assigneeF : DEFAULT_PEOPLE

  let totalAvailH = 0, cadenceAllocH = 0, trainAllocH = 0, prodAllocH = 0
  let wcmAllocH = 0, deaAllocH = 0, gdAllocH = 0
  activePeople.forEach(name => {
    const s   = capSettings.people?.[name] || {}
    const wd  = s.working_days ?? defWd
    const h   = s.holidays ?? defH
    const avail = wd - h
    const prod  = avail * 0.75
    totalAvailH   += avail * 8 * pf
    cadenceAllocH  += avail * 0.20 * 8 * pf
    trainAllocH    += avail * 0.05 * 8 * pf
    prodAllocH     += avail * 0.75 * 8 * pf
    wcmAllocH += prod * (s.bau?.['Website Content Management']          ?? 0) / 100 * pf * 8
    deaAllocH += prod * (s.bau?.['Demand Engagement Activations']       ?? 0) / 100 * pf * 8
    gdAllocH  += prod * (s.bau?.['Content Production – Graphic Design'] ?? 0) / 100 * pf * 8
  })

  const prodUtilH = data?.total_committed_h ?? 0

  // Team-wide cadence activities count for every active person
  const teamActs = cadenceSettings.team?.activities ?? []
  const teamCadenceH = teamActs.reduce((s, a) => s + (Number(a.hours_per_week) || 0), 0) * spanWeeks * activePeople.length

  let cadenceUtilH = teamCadenceH
  activePeople.forEach(name => {
    const acts = cadenceSettings.people?.[name]?.activities ?? []
    cadenceUtilH += acts.reduce((s, a) => s + (Number(a.hours_per_week) || 0), 0) * spanWeeks
  })
  let trainUtilH = 0
  activePeople.forEach(name => {
    const sessions = trainingSettings.people?.[name]?.sessions ?? []
    trainUtilH += sessions.reduce((s, t) => s + (Number(t.hours_per_year) || 0), 0) * pf
  })
  const totalUtilH = prodUtilH + cadenceUtilH + trainUtilH

  const svcMap = {}
  ;(data?.by_service ?? []).forEach(s => { svcMap[s.service] = s.committed_hours })

  const r = n => Math.round(n)

  const ALL_SVC_BOXES = [
    { key: 'Website Content Management',          label: 'Web Content Mgt',   allocH: wcmAllocH, utilH: svcMap['Website Content Management'] ?? 0,          color: '#3b82f6', bg: '#eff6ff', bc: '#3b82f6' },
    { key: 'Demand Engagement Activations',       label: 'Demand Engagement', allocH: deaAllocH, utilH: svcMap['Demand Engagement Activations'] ?? 0,        color: '#8b5cf6', bg: '#f5f3ff', bc: '#8b5cf6' },
    { key: 'Content Production – Graphic Design', label: 'Graphic Design',    allocH: gdAllocH,  utilH: svcMap['Content Production – Graphic Design'] ?? 0,  color: '#ef4444', bg: '#fef2f2', bc: '#ef4444' },
  ]
  const visibleSvcBoxes = serviceF ? ALL_SVC_BOXES.filter(s => s.key === serviceF) : ALL_SVC_BOXES

  function pctOf(util, alloc) {
    if (!alloc) return null
    return Math.round(util / alloc * 100)
  }

  function utilPctStyle(pct) {
    if (pct == null) return null
    if (pct >= 100) return { color: '#dc2626', bg: '#fef2f2' }
    if (pct >= 60)  return { color: '#d97706', bg: '#fffbeb' }
    return { color: '#16a34a', bg: '#f0fdf4' }
  }

  function remainStyle(val, allocH) {
    if (val < 0) return { color: '#dc2626', bg: '#fef2f2', border: '#fca5a5' }
    const frac = allocH > 0 ? val / allocH : 1
    if (frac < 0.20) return { color: '#d97706', bg: '#fffbeb', border: '#fcd34d' }
    return { color: '#16a34a', bg: '#f0fdf4', border: '#86efac' }
  }

  function NumBox({ label, value, sub, color = '#111827', bg = '#f3f4f6', borderColor, utilPct }) {
    const ps = utilPctStyle(utilPct)
    return (
      <div style={{ flex: 1, minWidth: 0, background: bg, borderRadius: 9, padding: '11px 14px', borderLeft: borderColor ? `3px solid ${borderColor}` : undefined }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
        <div style={{ fontSize: 20, fontWeight: 800, color, lineHeight: 1.1 }}>
          {value}<span style={{ fontSize: 11, fontWeight: 400, color: '#9ca3af', marginLeft: 2 }}>h</span>
        </div>
        {ps && (
          <div style={{ fontSize: 10, fontWeight: 700, color: ps.color, background: ps.bg, display: 'inline-block', borderRadius: 4, padding: '1px 5px', marginTop: 3 }}>
            {utilPct}% utilized
          </div>
        )}
        {sub && <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>{sub}</div>}
      </div>
    )
  }

  const sectionLabel = { fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '12px 0 8px' }
  const cardStyle = { background: '#fff', borderRadius: 12, border: '1px solid #e5e8ef', padding: '18px 20px', flex: 1, minWidth: 0 }

  const remainItems = [
    { label: 'Total Remaining', val: totalAvailH - totalUtilH,     allocH: totalAvailH },
    { label: 'Productivity',    val: prodAllocH  - prodUtilH,      allocH: prodAllocH  },
    { label: 'Cadence',         val: cadenceAllocH - cadenceUtilH, allocH: cadenceAllocH },
    { label: 'Training',        val: trainAllocH - trainUtilH,     allocH: trainAllocH },
    ...visibleSvcBoxes.map(s => ({ label: s.label, val: s.allocH - s.utilH, allocH: s.allocH })),
  ]

  const periodLabel = data ? `${spanDays}d period` : 'annual (no data loaded)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 16 }}>
        {/* Allocated Hours */}
        <div style={cardStyle}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#1450f5', flexShrink: 0 }} />
            Allocated Hours
            <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 400 }}>{periodLabel}</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <NumBox label="Total Available" value={r(totalAvailH)}   color="#111827" bg="#f9fafb" />
            <NumBox label="Productivity"    value={r(prodAllocH)}    color="#059669" bg="#f0fdf4" sub="75% of avail" />
            <NumBox label="Cadence"         value={r(cadenceAllocH)} color="#0891b2" bg="#f0f9ff" sub="20% of avail" />
            <NumBox label="Training"        value={r(trainAllocH)}   color="#7c3aed" bg="#faf5ff" sub="5% of avail" />
          </div>
          {visibleSvcBoxes.length > 0 && <>
            <div style={sectionLabel}>Allocated by service</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {visibleSvcBoxes.map(s => (
                <NumBox key={s.key} label={s.label} value={r(s.allocH)} color={s.color} bg={s.bg} borderColor={s.bc} />
              ))}
            </div>
          </>}
        </div>

        {/* Utilized Hours */}
        <div style={cardStyle}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#059669', flexShrink: 0 }} />
            Utilized Hours
            <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 400 }}>{periodLabel}</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <NumBox label="Total Utilized"  value={r(totalUtilH)}   color="#111827" bg="#f9fafb" />
            <NumBox label="Productivity"    value={r(prodUtilH)}    color="#059669" bg="#f0fdf4" sub="ticket hours" />
            <NumBox label="Cadence"         value={r(cadenceUtilH)} color="#0891b2" bg="#f0f9ff" sub="recurring meetings" />
            <NumBox label="Training"        value={r(trainUtilH)}   color="#7c3aed" bg="#faf5ff" sub="upskilling" />
          </div>
          <div style={sectionLabel}>Utilized by service</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {visibleSvcBoxes.map(s => (
              <NumBox key={s.key} label={s.label} value={r(s.utilH)} color={s.color} bg={s.bg} borderColor={s.bc} />
            ))}
          </div>
        </div>
      </div>

      {/* Utilization Remaining */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e8ef', padding: '14px 20px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
          </svg>
          Utilization Remaining
          <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 400 }}>allocated − utilized · negative means over capacity</span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {remainItems.map(({ label, val, allocH }) => {
            const rs = remainStyle(val, allocH)
            const absPct = allocH > 0 ? Math.round(Math.abs(val) / allocH * 100) : 0
            const usedPct = 100 - absPct
            return (
              <div key={label} style={{ flex: 1, minWidth: 0, background: rs.bg, borderRadius: 9, padding: '10px 14px', border: `1px solid ${rs.border}` }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: rs.color, lineHeight: 1.1 }}>
                  {val < 0 ? '−' : '+'}{Math.abs(r(val))}<span style={{ fontSize: 11, fontWeight: 400, color: '#9ca3af', marginLeft: 2 }}>h</span>
                </div>
                {allocH > 0 && (
                  <div style={{ fontSize: 10, fontWeight: 600, color: rs.color, marginTop: 2 }}>
                    {val < 0 ? `${absPct}% over capacity` : `${usedPct}% used · ${absPct}% free`}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ── Cadence Settings Modal ──────────────────────────────────────────────── */
function CadenceModal({ cadenceSettings, spanWeeks, onClose, onSaved }) {
  const [team, setTeam] = useState({ activities: JSON.parse(JSON.stringify(cadenceSettings.team?.activities ?? [])) })
  const [people, setPeople] = useState(() => {
    const r = {}
    DEFAULT_PEOPLE.forEach(name => {
      r[name] = { activities: JSON.parse(JSON.stringify(cadenceSettings.people?.[name]?.activities ?? [])) }
    })
    return r
  })
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)
  const [err,    setErr]    = useState(null)

  const addTeam    = () => setTeam(t => ({ activities: [...t.activities, { name: '', hours_per_week: 0 }] }))
  const removeTeam = i  => setTeam(t => ({ activities: t.activities.filter((_, j) => j !== i) }))
  const updTeam    = (i, field, val) => setTeam(t => ({ activities: t.activities.map((a, j) => j === i ? { ...a, [field]: val } : a) }))

  const add    = name => setPeople(p => ({ ...p, [name]: { activities: [...p[name].activities, { name: '', hours_per_week: 0 }] } }))
  const remove = (name, i) => setPeople(p => ({ ...p, [name]: { activities: p[name].activities.filter((_, j) => j !== i) } }))
  const upd    = (name, i, field, val) => setPeople(p => ({
    ...p, [name]: { activities: p[name].activities.map((a, j) => j === i ? { ...a, [field]: val } : a) }
  }))

  async function save() {
    setSaving(true); setErr(null); setSaved(false)
    try {
      const payload = {
        team: { activities: team.activities.filter(a => String(a.name).trim()) },
        people: Object.fromEntries(DEFAULT_PEOPLE.map(n => [n, { activities: people[n].activities.filter(a => String(a.name).trim()) }])),
      }
      const result = await updateCadenceSettings(payload)
      onSaved({ cadenceSettings: result })
      setSaved(true)
    } catch { setErr('Failed to save') }
    finally { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, padding: '24px 16px', overflowY: 'auto' }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 780, boxShadow: '0 24px 60px rgba(0,0,0,0.25)', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>Cadence Hours Settings</div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Recurring meetings and calls — hours per week, shown across {Math.round(spanWeeks)} weeks</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 22 }}>×</button>
        </div>
        <div style={{ padding: '20px 24px', maxHeight: 'calc(100vh - 200px)', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* ── Team-wide section ── */}
          {(() => {
            const acts  = team.activities
            const wkTot = acts.reduce((s, a) => s + (Number(a.hours_per_week) || 0), 0)
            const pTot  = Math.round(wkTot * spanWeeks * DEFAULT_PEOPLE.length)
            return (
              <div style={{ border: '2px solid #bfdbfe', borderRadius: 10, overflow: 'hidden', background: '#eff6ff' }}>
                <div style={{ padding: '9px 16px', background: '#dbeafe', borderBottom: acts.length ? '1px solid #bfdbfe' : undefined, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                    <span style={{ fontWeight: 700, color: '#1d4ed8', fontSize: 13 }}>Team-wide Meetings</span>
                    <span style={{ fontSize: 10, color: '#3b82f6', background: '#bfdbfe', borderRadius: 4, padding: '1px 6px', fontWeight: 600 }}>counts for all {DEFAULT_PEOPLE.length} people</span>
                  </div>
                  <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: '#374151' }}><strong style={{ color: '#1d4ed8' }}>{wkTot}h</strong>/wk/person · <strong style={{ color: '#1d4ed8' }}>{pTot}h</strong> team total this period</span>
                    <button onClick={addTeam} style={{ height: 26, padding: '0 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 6, fontFamily: 'Inter, sans-serif' }}>+ Add</button>
                  </div>
                </div>
                {acts.length > 0 ? (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#eff6ff' }}>
                        <th style={{ padding: '6px 14px', textAlign: 'left', fontWeight: 700, color: '#6b7280', fontSize: 11, borderBottom: '1px solid #bfdbfe' }}>Meeting / Activity</th>
                        <th style={{ padding: '6px 14px', textAlign: 'center', fontWeight: 700, color: '#6b7280', fontSize: 11, borderBottom: '1px solid #bfdbfe', width: 150 }}>Hours / Week</th>
                        <th style={{ padding: '6px 14px', textAlign: 'center', fontWeight: 700, color: '#1d4ed8', fontSize: 11, borderBottom: '1px solid #bfdbfe', width: 130 }}>Period (per person)</th>
                        <th style={{ width: 36, borderBottom: '1px solid #bfdbfe' }} />
                      </tr>
                    </thead>
                    <tbody>
                      {acts.map((a, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #dbeafe' }}>
                          <td style={{ padding: '6px 14px' }}>
                            <input value={a.name} onChange={e => updTeam(i, 'name', e.target.value)} placeholder="e.g. Weekly Sync, All-Hands…"
                              style={{ width: '100%', boxSizing: 'border-box', height: 28, padding: '0 8px', fontSize: 12, border: '1px solid #bfdbfe', borderRadius: 6, outline: 'none', fontFamily: 'Inter, sans-serif', background: '#fff' }} />
                          </td>
                          <td style={{ padding: '6px 14px', textAlign: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                              <input type="number" value={a.hours_per_week} min={0} max={40} step={0.25}
                                onChange={e => updTeam(i, 'hours_per_week', e.target.value)}
                                style={{ width: 64, height: 28, padding: '0 6px', fontSize: 12, border: '1px solid #bfdbfe', borderRadius: 6, textAlign: 'center', outline: 'none', fontFamily: 'Inter, sans-serif' }} />
                              <span style={{ fontSize: 11, color: '#9ca3af' }}>h/wk</span>
                            </div>
                          </td>
                          <td style={{ padding: '6px 14px', textAlign: 'center', fontWeight: 700, color: '#1d4ed8' }}>{Math.round((Number(a.hours_per_week) || 0) * spanWeeks)}h</td>
                          <td style={{ padding: '6px 14px', textAlign: 'center' }}><button onClick={() => removeTeam(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 16, padding: '2px 4px' }}>×</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div style={{ padding: '14px 16px', color: '#3b82f6', fontSize: 12, textAlign: 'center' }}>No team-wide meetings — click + Add to add one that counts for everyone</div>
                )}
              </div>
            )
          })()}

          {DEFAULT_PEOPLE.map(name => {
            const acts  = people[name].activities
            const wkTot = acts.reduce((s, a) => s + (Number(a.hours_per_week) || 0), 0)
            const pTot  = Math.round(wkTot * spanWeeks)
            return (
              <div key={name} style={{ border: '1px solid #e5e8ef', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ padding: '9px 16px', background: '#f9fafb', borderBottom: acts.length ? '1px solid #e5e8ef' : undefined, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 26, height: 26, borderRadius: '50%', background: `hsl(${Math.abs(name.charCodeAt(0) * 37) % 360},55%,88%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700 }}>
                      {name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <span style={{ fontWeight: 700, color: '#111827', fontSize: 13 }}>{name}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: '#6b7280' }}><strong style={{ color: '#0891b2' }}>{wkTot}h</strong>/wk · <strong style={{ color: '#0891b2' }}>{pTot}h</strong> this period</span>
                    <button onClick={() => add(name)} style={{ height: 26, padding: '0 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', background: '#eff6ff', color: '#1450f5', border: '1px solid #c7d7fd', borderRadius: 6, fontFamily: 'Inter, sans-serif' }}>+ Add</button>
                  </div>
                </div>
                {acts.length > 0 ? (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#fafafa' }}>
                        <th style={{ padding: '6px 14px', textAlign: 'left', fontWeight: 700, color: '#6b7280', fontSize: 11, borderBottom: '1px solid #f0f3fa' }}>Meeting / Activity</th>
                        <th style={{ padding: '6px 14px', textAlign: 'center', fontWeight: 700, color: '#6b7280', fontSize: 11, borderBottom: '1px solid #f0f3fa', width: 150 }}>Hours / Week</th>
                        <th style={{ padding: '6px 14px', textAlign: 'center', fontWeight: 700, color: '#0891b2', fontSize: 11, borderBottom: '1px solid #f0f3fa', width: 110 }}>Period Total</th>
                        <th style={{ width: 36, borderBottom: '1px solid #f0f3fa' }} />
                      </tr>
                    </thead>
                    <tbody>
                      {acts.map((a, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #f9fafb' }}>
                          <td style={{ padding: '6px 14px' }}>
                            <input value={a.name} onChange={e => upd(name, i, 'name', e.target.value)} placeholder="e.g. Weekly Sync, Daily Standup…"
                              style={{ width: '100%', boxSizing: 'border-box', height: 28, padding: '0 8px', fontSize: 12, border: '1px solid #e5e7eb', borderRadius: 6, outline: 'none', fontFamily: 'Inter, sans-serif' }} />
                          </td>
                          <td style={{ padding: '6px 14px', textAlign: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                              <input type="number" value={a.hours_per_week} min={0} max={40} step={0.25}
                                onChange={e => upd(name, i, 'hours_per_week', e.target.value)}
                                style={{ width: 64, height: 28, padding: '0 6px', fontSize: 12, border: '1px solid #e5e7eb', borderRadius: 6, textAlign: 'center', outline: 'none', fontFamily: 'Inter, sans-serif' }} />
                              <span style={{ fontSize: 11, color: '#9ca3af' }}>h/wk</span>
                            </div>
                          </td>
                          <td style={{ padding: '6px 14px', textAlign: 'center', fontWeight: 700, color: '#0891b2' }}>{Math.round((Number(a.hours_per_week) || 0) * spanWeeks)}h</td>
                          <td style={{ padding: '6px 14px', textAlign: 'center' }}><button onClick={() => remove(name, i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 16, padding: '2px 4px' }}>×</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div style={{ padding: '14px 16px', color: '#9ca3af', fontSize: 12, textAlign: 'center' }}>No cadence meetings logged — click + Add</div>
                )}
              </div>
            )
          })}
        </div>
        <div style={{ padding: '14px 24px', borderTop: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 12 }}>{err && <span style={{ color: '#dc2626' }}>{err}</span>}{saved && <span style={{ color: '#15803d' }}>✓ Saved</span>}</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} style={{ height: 34, padding: '0 16px', fontSize: 13, cursor: 'pointer', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 8, fontFamily: 'Inter, sans-serif' }}>Close</button>
            <button onClick={save} disabled={saving} style={{ height: 34, padding: '0 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: saving ? '#94a3b8' : '#0891b2', color: '#fff', border: 'none', borderRadius: 8, fontFamily: 'Inter, sans-serif' }}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Training Settings Modal ─────────────────────────────────────────────── */
function TrainingModal({ trainingSettings, spanDays, onClose, onSaved }) {
  const pf = spanDays / 365
  const [people, setPeople] = useState(() => {
    const r = {}
    DEFAULT_PEOPLE.forEach(name => {
      r[name] = { sessions: JSON.parse(JSON.stringify(trainingSettings.people?.[name]?.sessions ?? [])) }
    })
    return r
  })
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)
  const [err,    setErr]    = useState(null)

  const add    = name => setPeople(p => ({ ...p, [name]: { sessions: [...p[name].sessions, { name: '', hours_per_year: 0 }] } }))
  const remove = (name, i) => setPeople(p => ({ ...p, [name]: { sessions: p[name].sessions.filter((_, j) => j !== i) } }))
  const upd    = (name, i, field, val) => setPeople(p => ({
    ...p, [name]: { sessions: p[name].sessions.map((s, j) => j === i ? { ...s, [field]: val } : s) }
  }))

  async function save() {
    setSaving(true); setErr(null); setSaved(false)
    try {
      const payload = { people: Object.fromEntries(DEFAULT_PEOPLE.map(n => [n, { sessions: people[n].sessions.filter(s => String(s.name).trim()) }])) }
      const result = await updateTrainingSettings(payload)
      onSaved({ trainingSettings: result })
      setSaved(true)
    } catch { setErr('Failed to save') }
    finally { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, padding: '24px 16px', overflowY: 'auto' }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 780, boxShadow: '0 24px 60px rgba(0,0,0,0.25)', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>Training / Upskilling Settings</div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Courses and sessions per person — annual hours, prorated to selected period</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 22 }}>×</button>
        </div>
        <div style={{ padding: '20px 24px', maxHeight: 'calc(100vh - 200px)', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {DEFAULT_PEOPLE.map(name => {
            const sessions = people[name].sessions
            const yrTot    = sessions.reduce((s, t) => s + (Number(t.hours_per_year) || 0), 0)
            const pTot     = Math.round(yrTot * pf)
            return (
              <div key={name} style={{ border: '1px solid #e5e8ef', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ padding: '9px 16px', background: '#f9fafb', borderBottom: sessions.length ? '1px solid #e5e8ef' : undefined, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 26, height: 26, borderRadius: '50%', background: `hsl(${Math.abs(name.charCodeAt(0) * 37) % 360},55%,88%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700 }}>
                      {name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <span style={{ fontWeight: 700, color: '#111827', fontSize: 13 }}>{name}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: '#6b7280' }}><strong style={{ color: '#7c3aed' }}>{yrTot}h</strong>/yr · <strong style={{ color: '#7c3aed' }}>{pTot}h</strong> this period</span>
                    <button onClick={() => add(name)} style={{ height: 26, padding: '0 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', background: '#faf5ff', color: '#7c3aed', border: '1px solid #ddd6fe', borderRadius: 6, fontFamily: 'Inter, sans-serif' }}>+ Add</button>
                  </div>
                </div>
                {sessions.length > 0 ? (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#fafafa' }}>
                        <th style={{ padding: '6px 14px', textAlign: 'left', fontWeight: 700, color: '#6b7280', fontSize: 11, borderBottom: '1px solid #f0f3fa' }}>Training / Course</th>
                        <th style={{ padding: '6px 14px', textAlign: 'center', fontWeight: 700, color: '#6b7280', fontSize: 11, borderBottom: '1px solid #f0f3fa', width: 150 }}>Hours / Year</th>
                        <th style={{ padding: '6px 14px', textAlign: 'center', fontWeight: 700, color: '#7c3aed', fontSize: 11, borderBottom: '1px solid #f0f3fa', width: 120 }}>Period Hours</th>
                        <th style={{ width: 36, borderBottom: '1px solid #f0f3fa' }} />
                      </tr>
                    </thead>
                    <tbody>
                      {sessions.map((s, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #f9fafb' }}>
                          <td style={{ padding: '6px 14px' }}>
                            <input value={s.name} onChange={e => upd(name, i, 'name', e.target.value)} placeholder="e.g. Google Analytics Cert, Team Workshop…"
                              style={{ width: '100%', boxSizing: 'border-box', height: 28, padding: '0 8px', fontSize: 12, border: '1px solid #e5e7eb', borderRadius: 6, outline: 'none', fontFamily: 'Inter, sans-serif' }} />
                          </td>
                          <td style={{ padding: '6px 14px', textAlign: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                              <input type="number" value={s.hours_per_year} min={0} max={2000} step={1}
                                onChange={e => upd(name, i, 'hours_per_year', e.target.value)}
                                style={{ width: 64, height: 28, padding: '0 6px', fontSize: 12, border: '1px solid #e5e7eb', borderRadius: 6, textAlign: 'center', outline: 'none', fontFamily: 'Inter, sans-serif' }} />
                              <span style={{ fontSize: 11, color: '#9ca3af' }}>h/yr</span>
                            </div>
                          </td>
                          <td style={{ padding: '6px 14px', textAlign: 'center', fontWeight: 700, color: '#7c3aed' }}>{Math.round((Number(s.hours_per_year) || 0) * pf)}h</td>
                          <td style={{ padding: '6px 14px', textAlign: 'center' }}><button onClick={() => remove(name, i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 16, padding: '2px 4px' }}>×</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div style={{ padding: '14px 16px', color: '#9ca3af', fontSize: 12, textAlign: 'center' }}>No training sessions logged — click + Add</div>
                )}
              </div>
            )
          })}
        </div>
        <div style={{ padding: '14px 24px', borderTop: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 12 }}>{err && <span style={{ color: '#dc2626' }}>{err}</span>}{saved && <span style={{ color: '#15803d' }}>✓ Saved</span>}</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} style={{ height: 34, padding: '0 16px', fontSize: 13, cursor: 'pointer', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 8, fontFamily: 'Inter, sans-serif' }}>Close</button>
            <button onClick={save} disabled={saving} style={{ height: 34, padding: '0 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: saving ? '#94a3b8' : '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, fontFamily: 'Inter, sans-serif' }}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Capacity Planning section ──────────────────────────────────────────────── */
function CapacityPlanSection({ capSettings, byAssignee, bwRates }) {
  const people = DEFAULT_PEOPLE.filter(name => {
    const p = capSettings.people?.[name] || {}
    return BAU_SERVICES.some(s => (p.bau?.[s] ?? 0) > 0) || NON_BAU.some(a => (p.non_bau?.[a] ?? 0) > 0)
  })
  if (!people.length) return null

  const actualLookup = {}
  byAssignee.forEach(a => { actualLookup[a.assigned_to] = a.breakdown || {} })

  const defWd = capSettings.default_working_days ?? 250
  const defH  = capSettings.default_holidays ?? 24

  const grouped = people.map(name => {
    const settings  = capSettings.people?.[name] || {}
    const wd        = settings.working_days ?? defWd
    const holidays  = settings.holidays ?? defH
    const avail     = wd - holidays
    const prodDays  = Math.round(avail * 0.75)

    const ntRows = NON_BAU.filter(a => (settings.non_bau?.[a] ?? 0) > 0).map(a => ({
      type: 'nt', activity: a,
      allocPct: settings.non_bau[a],
      allocDays: +(prodDays * settings.non_bau[a] / 100).toFixed(1),
    }))
    const ntPct = ntRows.reduce((s, r) => s + r.allocPct, 0)

    const svcRows = BAU_SERVICES.filter(svc => (settings.bau?.[svc] ?? 0) > 0).map(svc => {
      const allocPct  = settings.bau[svc]
      const rate      = bwRates[svc] || 0
      const allocDays = +(prodDays * allocPct / 100).toFixed(1)
      const quota     = +(rate * allocDays).toFixed(1)
      const actual    = actualLookup[name]?.[svc] || 0
      const att       = quota > 0 ? Math.round(actual / quota * 100) : null
      return { type: 'svc', svc, allocPct, allocDays, rate, quota, actual, att }
    })
    const totQuota  = +svcRows.reduce((s, r) => s + r.quota, 0).toFixed(1)
    const totActual = svcRows.reduce((s, r) => s + r.actual, 0)
    const totAtt    = totQuota > 0 ? Math.round(totActual / totQuota * 100) : null
    const allRows   = [...ntRows, ...svcRows]
    const totalSpan = allRows.length + (svcRows.length > 0 ? 1 : 0) + 1
    return { name, wd, avail, prodDays, ntPct, allRows, svcRows, totQuota, totActual, totAtt, totalSpan }
  })

  const HDR = { padding: '8px 12px', fontWeight: 700, color: '#6b7280', fontSize: 11, borderBottom: '2px solid #e5e8ef', whiteSpace: 'nowrap', background: '#f9fafb' }

  return (
    <SectionCard title="Capacity Planning" subtitle="BAU ticket quota vs actual, plus non-BAU time reservations. Denominator = productivity days (75% of availability)." accent="#7c3aed">
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              {['Person', 'Activity / Service', 'Prod. Days', 'Alloc %', 'Alloc Days', 'Tickets / Day', 'Quota', 'Actual', 'Attainment'].map((h, i) => (
                <th key={h} style={{ ...HDR, textAlign: i <= 1 ? 'left' : 'center' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grouped.map(({ name, wd, avail, prodDays, ntPct, allRows, svcRows, totQuota, totActual, totAtt, totalSpan }, gi) => {
              const personBg = gi % 2 === 0 ? '#fff' : '#fafbff'
              const totAS = attStyle(totAtt)
              return [
                ...allRows.map((r, ri) => (
                  <tr key={`${name}-${r.type === 'nt' ? r.activity : r.svc}`} style={{ background: personBg, borderBottom: '1px solid #f0f3fa' }}>
                    {ri === 0 && (
                      <td rowSpan={totalSpan} style={{ padding: '10px 12px', fontWeight: 700, color: '#111827', verticalAlign: 'middle', borderRight: '1px solid #e5e8ef', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <div style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, background: `hsl(${Math.abs(name.charCodeAt(0) * 37) % 360},55%,88%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>
                            {name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                          </div>
                          {name}
                        </div>
                      </td>
                    )}
                    <td style={{ padding: '8px 12px' }}>
                      {r.type === 'nt' ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 7, height: 7, borderRadius: '50%', background: NON_BAU_COLORS[r.activity] || '#9ca3af', flexShrink: 0 }} />
                          <span style={{ color: '#374151' }}>{r.activity}</span>
                          <span style={{ fontSize: 10, color: '#9ca3af', background: '#f3f4f6', borderRadius: 4, padding: '1px 5px' }}>non-BAU</span>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 7, height: 7, borderRadius: '50%', background: BAU_COLORS[r.svc], flexShrink: 0 }} />
                          <span style={{ color: '#374151' }}>{BAU_SHORT[r.svc]}</span>
                        </div>
                      )}
                    </td>
                    {ri === 0 && (
                      <td rowSpan={totalSpan} style={{ padding: '8px 12px', textAlign: 'center', verticalAlign: 'middle' }}>
                        <div style={{ fontWeight: 700, color: '#7c3aed' }}>{prodDays}d</div>
                        <div style={{ fontSize: 10, color: '#9ca3af' }}>of {avail}d avail</div>
                      </td>
                    )}
                    <td style={{ padding: '8px 12px', textAlign: 'center', color: '#374151' }}>{r.allocPct}%</td>
                    <td style={{ padding: '8px 12px', textAlign: 'center', color: '#374151' }}>{r.allocDays}d</td>
                    {r.type === 'nt' ? (
                      <td colSpan={4} style={{ padding: '8px 12px', textAlign: 'center', color: '#9ca3af', fontSize: 11 }}>time reserved — not ticket-tracked</td>
                    ) : (<>
                      <td style={{ padding: '8px 12px', textAlign: 'center', color: '#6b7280' }}>{r.rate}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: '#1450f5' }}>{r.quota}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center', color: '#374151' }}>{r.actual}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        {r.att != null
                          ? <span style={{ fontWeight: 700, color: attStyle(r.att).color, background: attStyle(r.att).bg, borderRadius: 6, padding: '2px 8px' }}>{r.att}%</span>
                          : <span style={{ color: '#d1d5db' }}>—</span>}
                      </td>
                    </>)}
                  </tr>
                )),
                svcRows.length > 0 && (
                  <tr key={`${name}-total`} style={{ background: personBg, borderBottom: '1px solid #e5e8ef' }}>
                    <td style={{ padding: '7px 12px', fontStyle: 'italic', color: '#6b7280' }}>BAU Total</td>
                    <td colSpan={3} />
                    <td style={{ padding: '7px 12px', textAlign: 'center', fontWeight: 700, color: '#1450f5' }}>{totQuota}</td>
                    <td style={{ padding: '7px 12px', textAlign: 'center', fontWeight: 700, color: '#374151' }}>{totActual}</td>
                    <td style={{ padding: '7px 12px', textAlign: 'center' }}>
                      {totAtt != null
                        ? <span style={{ fontWeight: 700, color: totAS.color, background: totAS.bg, borderRadius: 6, padding: '2px 8px' }}>{totAtt}%</span>
                        : <span style={{ color: '#d1d5db' }}>—</span>}
                    </td>
                  </tr>
                ),
                <tr key={`${name}-eff`} style={{ background: ntPct > 0 ? '#fdf4ff' : personBg, borderBottom: '2px solid #e5e8ef' }}>
                  <td colSpan={7} style={{ padding: '7px 12px', fontSize: 11, color: '#7c3aed', fontWeight: 600 }}>
                    {`Productivity: ${prodDays}d (${wd}d working − ${wd - avail}d holidays = ${avail}d avail × 75%)`}
                    {ntPct > 0 && ` · ${ntPct}% reserved for non-BAU`}
                  </td>
                </tr>,
              ].filter(Boolean)
            })}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 10, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {[['≥ 100%', '#0369a1', '#e0f2fe', 'Over target'], ['80–99%', '#15803d', '#dcfce7', 'On track'], ['50–79%', '#854d0e', '#fef9c3', 'Under target'], ['< 50%', '#991b1b', '#fee2e2', 'Far under']].map(([lbl, col, bg, desc]) => (
          <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: col, background: bg, borderRadius: 5, padding: '1px 7px' }}>{lbl}</span>
            <span style={{ fontSize: 11, color: '#6b7280' }}>{desc}</span>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}

/* ── Capacity Settings Modal ────────────────────────────────────────────────── */
function CapacityModal({ capSettings, onClose, onSaved }) {
  const [defWd,  setDefWd]  = useState(capSettings.default_working_days ?? 250)
  const [defH,   setDefH]   = useState(capSettings.default_holidays ?? 24)
  const [people, setPeople] = useState(() => {
    const r = {}
    DEFAULT_PEOPLE.forEach(name => {
      const s = capSettings.people?.[name] || {}
      r[name] = {
        working_days: s.working_days ?? null,
        holidays:     s.holidays ?? null,
        bau:     Object.fromEntries(BAU_SERVICES.map(sv => [sv, s.bau?.[sv] ?? 0])),
        non_bau: Object.fromEntries(NON_BAU.map(a => [a, s.non_bau?.[a] ?? 0])),
      }
    })
    return r
  })
  const [mode,     setMode]     = useState(capSettings.mode ?? 'annual')
  const [presets,  setPresets]  = useState(() => JSON.parse(JSON.stringify(capSettings.presets ?? {})))
  const [showNew,  setShowNew]  = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newWd,    setNewWd]    = useState(capSettings.default_working_days ?? 250)
  const [newH,     setNewH]     = useState(capSettings.default_holidays ?? 24)
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)
  const [err,    setErr]    = useState(null)

  function addPreset() {
    if (!newLabel.trim()) return
    const key = newLabel.trim().replace(/\s+/g, '-')
    setPresets(p => ({ ...p, [key]: { label: newLabel.trim(), default_working_days: Number(newWd), default_holidays: Number(newH) } }))
    setMode(key)
    setNewLabel(''); setShowNew(false)
  }
  function deletePreset(key) {
    setPresets(p => { const { [key]: _, ...rest } = p; return rest })
    if (mode === key) setMode('annual')
  }
  function updatePreset(key, field, val) {
    setPresets(p => ({ ...p, [key]: { ...p[key], [field]: val } }))
  }

  function derived(name) {
    const p  = people[name]
    const wd = p.working_days ?? defWd
    const h  = p.holidays ?? defH
    const av = wd - h
    return {
      wd, h, av,
      cadence:     Math.round(av * 0.20),
      training:    Math.round(av * 0.05),
      productivity:Math.round(av * 0.75),
      bauPct:    BAU_SERVICES.reduce((s, sv) => s + (p.bau?.[sv] ?? 0), 0),
      nonBauPct: NON_BAU.reduce((s, a) => s + (p.non_bau?.[a] ?? 0), 0),
    }
  }

  // Totals row
  const totals = useMemo(() => {
    const t = { wd: 0, h: 0, av: 0, cadence: 0, training: 0, productivity: 0 }
    DEFAULT_PEOPLE.forEach(name => {
      const d = derived(name)
      t.wd += d.wd; t.h += d.h; t.av += d.av
      t.cadence += d.cadence; t.training += d.training; t.productivity += d.productivity
    })
    return t
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people, defWd, defH])

  async function save() {
    setSaving(true); setErr(null); setSaved(false)
    try {
      const payload = {
        mode,
        default_working_days: Number(defWd),
        default_holidays:     Number(defH),
        people: Object.fromEntries(DEFAULT_PEOPLE.map(name => {
          const p = people[name]
          return [name, {
            working_days: p.working_days != null ? Number(p.working_days) : null,
            holidays:     p.holidays     != null ? Number(p.holidays)     : null,
            bau:     Object.fromEntries(BAU_SERVICES.map(sv => [sv, Number(p.bau?.[sv] || 0)])),
            non_bau: Object.fromEntries(NON_BAU.map(a => [a, Number(p.non_bau?.[a] || 0)])),
          }]
        })),
        presets: Object.fromEntries(
          Object.entries(presets).map(([k, p]) => [k, {
            label: p.label,
            default_working_days: Number(p.default_working_days),
            default_holidays:     Number(p.default_holidays),
          }])
        ),
      }
      const result = await updateCapacitySettings(payload)
      onSaved({ capSettings: result })
      setSaved(true)
    } catch { setErr('Failed to save') }
    finally { setSaving(false) }
  }

  const TH = { padding: '7px 10px', fontWeight: 700, fontSize: 11, color: '#6b7280', background: '#f9fafb', borderBottom: '2px solid #e5e8ef', whiteSpace: 'nowrap', textAlign: 'center' }
  const THL = { ...TH, textAlign: 'left' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, padding: '24px 16px', overflowY: 'auto' }}
      onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 1320, boxShadow: '0 24px 60px rgba(0,0,0,0.25)', flexShrink: 0 }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>Capacity Settings</div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Working days · holidays · availability breakdown · BAU and non-BAU allocations (% of productivity days)</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 22, lineHeight: 1, padding: '0 4px' }}>×</button>
        </div>

        {/* Period tab strip */}
        <div style={{ background: '#f8fafc', borderBottom: '1px solid #e5e8ef' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', paddingLeft: 24, paddingRight: 24, paddingTop: 10, gap: 2, overflowX: 'auto' }}>
            {/* Annual tab */}
            {(() => {
              const active = mode === 'annual'
              return (
                <button onClick={() => setMode('annual')} style={{
                  height: 36, padding: '0 16px', fontSize: 12, fontWeight: active ? 700 : 500, cursor: 'pointer',
                  background: active ? '#fff' : 'transparent',
                  color: active ? '#1450f5' : '#6b7280',
                  border: '1px solid transparent',
                  borderColor: active ? '#e5e8ef' : 'transparent',
                  borderBottom: active ? '1px solid #fff' : undefined,
                  borderRadius: '8px 8px 0 0',
                  marginBottom: active ? -1 : 0,
                  fontFamily: 'Inter, sans-serif',
                  display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
                }}>
                  Annual
                  {active && <span style={{ fontSize: 9, fontWeight: 700, color: '#059669', background: '#dcfce7', padding: '1px 5px', borderRadius: 8 }}>Active</span>}
                </button>
              )
            })()}
            {/* Preset tabs */}
            {Object.entries(presets).map(([key, p]) => {
              const active = mode === key
              return (
                <button key={key} onClick={() => setMode(key)} style={{
                  height: 36, padding: '0 16px', fontSize: 12, fontWeight: active ? 700 : 500, cursor: 'pointer',
                  background: active ? '#fff' : 'transparent',
                  color: active ? '#7c3aed' : '#6b7280',
                  border: '1px solid transparent',
                  borderColor: active ? '#e5e8ef' : 'transparent',
                  borderBottom: active ? '1px solid #fff' : undefined,
                  borderRadius: '8px 8px 0 0',
                  marginBottom: active ? -1 : 0,
                  fontFamily: 'Inter, sans-serif',
                  display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
                }}>
                  {p.label}
                  {active && <span style={{ fontSize: 9, fontWeight: 700, color: '#059669', background: '#dcfce7', padding: '1px 5px', borderRadius: 8 }}>Active</span>}
                </button>
              )
            })}
            {/* Add Period tab */}
            {!showNew && (
              <button onClick={() => setShowNew(true)} style={{
                height: 36, padding: '0 14px', fontSize: 12, fontWeight: 500, cursor: 'pointer',
                background: 'transparent', color: '#9ca3af',
                border: '1px dashed #d1d5db', borderBottom: 'none',
                borderRadius: '8px 8px 0 0',
                fontFamily: 'Inter, sans-serif',
                display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
              }}>
                + Add Period
              </button>
            )}
          </div>
        </div>

        {/* Period settings bar — changes based on active tab */}
        <div style={{ padding: '12px 24px', borderBottom: '1px solid #f3f4f6', background: '#fff' }}>
          {mode === 'annual' ? (
            <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#1450f5' }}>Annual Defaults</span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#374151' }}>
                Working days / year
                <NumInput value={defWd} onChange={v => setDefWd(v ?? 250)} min={1} max={365} width={72} />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#374151' }}>
                Holidays / year
                <NumInput value={defH} onChange={v => setDefH(v ?? 24)} min={0} max={60} width={60} />
              </label>
              <span style={{ fontSize: 11, color: '#9ca3af' }}>Availability = WD − Holidays · Cadence 20% · Training 5% · Productivity 75%</span>
            </div>
          ) : presets[mode] ? (
            <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#7c3aed' }}>{presets[mode].label}</span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#374151' }}>
                Working days
                <NumInput value={presets[mode].default_working_days} onChange={v => updatePreset(mode, 'default_working_days', v ?? 250)} min={1} max={365} width={72} />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#374151' }}>
                Holidays
                <NumInput value={presets[mode].default_holidays} onChange={v => updatePreset(mode, 'default_holidays', v ?? 0)} min={0} max={60} width={60} />
              </label>
              <button onClick={() => deletePreset(mode)} style={{ height: 28, padding: '0 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer', background: '#fff', color: '#ef4444', border: '1px solid #fca5a5', borderRadius: 6, fontFamily: 'Inter, sans-serif' }}>Delete period</button>
            </div>
          ) : null}
          {/* New period form */}
          {showNew && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: mode !== 'annual' && !presets[mode] ? 0 : 10, flexWrap: 'wrap', padding: '10px 14px', background: '#f0fdf4', borderRadius: 8, border: '1px solid #86efac' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#15803d' }}>New period:</span>
              <input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="e.g. Q1 2025"
                style={{ height: 30, padding: '0 10px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 6, outline: 'none', fontFamily: 'Inter, sans-serif', width: 140 }} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#374151' }}>
                WD/yr <NumInput value={newWd} onChange={v => setNewWd(v ?? 250)} min={1} max={365} width={68} />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#374151' }}>
                Holidays <NumInput value={newH} onChange={v => setNewH(v ?? 0)} min={0} max={60} width={60} />
              </label>
              <button onClick={addPreset} style={{ height: 30, padding: '0 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: '#15803d', color: '#fff', border: 'none', borderRadius: 6, fontFamily: 'Inter, sans-serif' }}>Create &amp; Activate</button>
              <button onClick={() => setShowNew(false)} style={{ height: 30, padding: '0 12px', fontSize: 12, cursor: 'pointer', background: '#fff', color: '#6b7280', border: '1px solid #d1d5db', borderRadius: 6, fontFamily: 'Inter, sans-serif' }}>Cancel</button>
            </div>
          )}
        </div>

        {/* Table */}
        <div style={{ padding: '20px 24px', overflowX: 'auto', maxHeight: 'calc(100vh - 260px)', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              {/* Group headers */}
              <tr style={{ background: '#f0f4ff' }}>
                <th style={{ ...THL, borderBottom: '1px solid #e5e8ef' }} rowSpan={2}>Person</th>
                <th colSpan={6} style={{ ...TH, color: '#1450f5', borderBottom: '1px solid #c7d7fd', borderLeft: '2px solid #c7d7fd' }}>Capacity Breakdown</th>
                <th colSpan={3} style={{ ...TH, color: '#059669', borderBottom: '1px solid #a7f3d0', borderLeft: '2px solid #a7f3d0' }}>BAU Allocation (% of Productivity)</th>
                <th colSpan={4} style={{ ...TH, color: '#7c3aed', borderBottom: '1px solid #ddd6fe', borderLeft: '2px solid #ddd6fe' }}>Non-BAU Allocation (% of Productivity)</th>
                <th style={{ ...TH, borderBottom: '1px solid #e5e8ef', borderLeft: '2px solid #e5e8ef' }} rowSpan={2}>Total %</th>
              </tr>
              <tr style={{ background: '#f9fafb' }}>
                <th style={{ ...TH, borderLeft: '2px solid #c7d7fd' }}>Working Days</th>
                <th style={TH}>Holidays</th>
                <th style={{ ...TH, color: '#1450f5' }}>Availability</th>
                <th style={{ ...TH, color: '#0891b2' }}>Cadence<br/><span style={{ fontWeight: 400, fontSize: 10 }}>20%</span></th>
                <th style={{ ...TH, color: '#7c3aed' }}>Training/<br/>Upskilling<br/><span style={{ fontWeight: 400, fontSize: 10 }}>5%</span></th>
                <th style={{ ...TH, color: '#059669' }}>Productivity<br/><span style={{ fontWeight: 400, fontSize: 10 }}>75%</span></th>
                {BAU_SERVICES.map((sv, i) => (
                  <th key={sv} style={{ ...TH, color: BAU_COLORS[sv], borderLeft: i === 0 ? '2px solid #a7f3d0' : undefined }}>{BAU_SHORT[sv]}</th>
                ))}
                {NON_BAU.map((a, i) => (
                  <th key={a} style={{ ...TH, color: NON_BAU_COLORS[a], borderLeft: i === 0 ? '2px solid #ddd6fe' : undefined }}>{a}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DEFAULT_PEOPLE.map((name, pi) => {
                const d = derived(name)
                const total = d.bauPct + d.nonBauPct
                const totalColor = total > 100 ? '#991b1b' : total === 100 ? '#15803d' : '#854d0e'
                const p = people[name]
                return (
                  <tr key={name} style={{ background: pi % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #f0f3fa' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 600, color: '#111827', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <div style={{ width: 24, height: 24, borderRadius: '50%', background: `hsl(${Math.abs(name.charCodeAt(0) * 37) % 360},55%,88%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700 }}>
                          {name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        {name}
                      </div>
                    </td>
                    {/* Working Days */}
                    <td style={{ padding: '6px 8px', textAlign: 'center', borderLeft: '2px solid #e8f0fe' }}>
                      <NumInput value={p.working_days} onChange={v => setPeople(prev => ({ ...prev, [name]: { ...prev[name], working_days: v } }))} placeholder={String(defWd)} min={1} max={365} width={68} />
                    </td>
                    {/* Holidays */}
                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                      <NumInput value={p.holidays} onChange={v => setPeople(prev => ({ ...prev, [name]: { ...prev[name], holidays: v } }))} placeholder={String(defH)} min={0} max={60} width={60} />
                    </td>
                    {/* Calculated columns */}
                    <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700, color: '#1450f5' }}>{d.av}d</td>
                    <td style={{ padding: '8px 10px', textAlign: 'center', color: '#0891b2' }}>{d.cadence}d</td>
                    <td style={{ padding: '8px 10px', textAlign: 'center', color: '#7c3aed' }}>{d.training}d</td>
                    <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700, color: '#059669' }}>{d.productivity}d</td>
                    {/* BAU % */}
                    {BAU_SERVICES.map((sv, i) => (
                      <td key={sv} style={{ padding: '6px 6px', textAlign: 'center', borderLeft: i === 0 ? '2px solid #a7f3d0' : undefined }}>
                        <input type="number" value={p.bau?.[sv] ?? 0} min={0} max={100}
                          onChange={e => setPeople(prev => ({ ...prev, [name]: { ...prev[name], bau: { ...prev[name].bau, [sv]: Number(e.target.value) } } }))}
                          style={{ width: 56, height: 28, padding: '0 4px', fontSize: 12, border: `1px solid ${BAU_COLORS[sv]}50`, borderRadius: 6, textAlign: 'center', fontFamily: 'Inter, sans-serif', color: BAU_COLORS[sv], outline: 'none', boxSizing: 'border-box' }} />
                      </td>
                    ))}
                    {/* Non-BAU % */}
                    {NON_BAU.map((a, i) => (
                      <td key={a} style={{ padding: '6px 6px', textAlign: 'center', borderLeft: i === 0 ? '2px solid #ddd6fe' : undefined }}>
                        <input type="number" value={p.non_bau?.[a] ?? 0} min={0} max={100}
                          onChange={e => setPeople(prev => ({ ...prev, [name]: { ...prev[name], non_bau: { ...prev[name].non_bau, [a]: Number(e.target.value) } } }))}
                          style={{ width: 56, height: 28, padding: '0 4px', fontSize: 12, border: `1px solid ${NON_BAU_COLORS[a]}50`, borderRadius: 6, textAlign: 'center', fontFamily: 'Inter, sans-serif', color: NON_BAU_COLORS[a], outline: 'none', boxSizing: 'border-box' }} />
                      </td>
                    ))}
                    {/* Total % */}
                    <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700, color: totalColor, borderLeft: '2px solid #e5e8ef' }}>
                      {total}%
                      {total > 100 && <div style={{ fontSize: 9, fontWeight: 400, color: '#991b1b' }}>↑ over</div>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {/* Summary row */}
            <tfoot>
              <tr style={{ background: '#f0f4ff', borderTop: '2px solid #c7d7fd' }}>
                <td style={{ padding: '9px 12px', fontWeight: 700, color: '#1450f5' }}>Team Total</td>
                <td style={{ padding: '9px 10px', textAlign: 'center', fontWeight: 700, color: '#374151', borderLeft: '2px solid #e8f0fe' }}>{totals.wd}d</td>
                <td style={{ padding: '9px 10px', textAlign: 'center', fontWeight: 700, color: '#374151' }}>{totals.h}d</td>
                <td style={{ padding: '9px 10px', textAlign: 'center', fontWeight: 700, color: '#1450f5' }}>{totals.av}d</td>
                <td style={{ padding: '9px 10px', textAlign: 'center', fontWeight: 700, color: '#0891b2' }}>{totals.cadence}d</td>
                <td style={{ padding: '9px 10px', textAlign: 'center', fontWeight: 700, color: '#7c3aed' }}>{totals.training}d</td>
                <td style={{ padding: '9px 10px', textAlign: 'center', fontWeight: 700, color: '#059669' }}>{totals.productivity}d</td>
                {BAU_SERVICES.map((sv, i) => (
                  <td key={sv} style={{ padding: '9px 10px', textAlign: 'center', color: '#9ca3af', borderLeft: i === 0 ? '2px solid #a7f3d0' : undefined }}>—</td>
                ))}
                {NON_BAU.map((a, i) => (
                  <td key={a} style={{ padding: '9px 10px', textAlign: 'center', color: '#9ca3af', borderLeft: i === 0 ? '2px solid #ddd6fe' : undefined }}>—</td>
                ))}
                <td style={{ borderLeft: '2px solid #e5e8ef' }} />
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 12 }}>
            {err  && <span style={{ color: '#dc2626' }}>{err}</span>}
            {saved && <span style={{ color: '#15803d' }}>✓ Saved</span>}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} style={{ height: 34, padding: '0 16px', fontSize: 13, cursor: 'pointer', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 8, fontFamily: 'Inter, sans-serif' }}>Close</button>
            <button onClick={save} disabled={saving} style={{ height: 34, padding: '0 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: saving ? '#94a3b8' : '#1450f5', color: '#fff', border: 'none', borderRadius: 8, fontFamily: 'Inter, sans-serif' }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Rates & SLA Modal ──────────────────────────────────────────────────────── */
function RatesSlaModal({ bwRates, slaRules, onClose, onSaved }) {
  const [localHours, setLocalHours] = useState(() =>
    Object.fromEntries(Object.entries(bwRates).map(([s, rate]) => [s, +(8 / rate).toFixed(2)]))
  )
  const [localSla, setLocalSla] = useState({ ...slaRules })
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)
  const [err,    setErr]    = useState(null)

  const displayServices = [
    ...BAU_SERVICES,
    'Demand Creation – Global',
    'Email – Local',
    'Retention – Activations',
  ]

  async function save() {
    setSaving(true); setErr(null); setSaved(false)
    try {
      const newRates = Object.fromEntries(
        Object.entries(localHours).map(([s, h]) => [s, +(8 / Number(h)).toFixed(4)])
      )
      const newSla = Object.fromEntries(Object.entries(localSla).map(([s, v]) => [s, Number(v)]))
      await Promise.all([updateBandwidthRates(newRates), updateSlaRules(newSla)])
      onSaved({ bwRates: newRates, slaRules: newSla })
      setSaved(true)
    } catch { setErr('Failed to save') }
    finally { setSaving(false) }
  }

  const TH = { padding: '8px 12px', fontWeight: 700, color: '#6b7280', fontSize: 11, textAlign: 'center', borderBottom: '2px solid #e5e8ef', whiteSpace: 'nowrap', background: '#f9fafb' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, padding: '32px 16px', overflowY: 'auto' }}
      onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 700, boxShadow: '0 24px 60px rgba(0,0,0,0.25)', flexShrink: 0 }}
        onClick={e => e.stopPropagation()}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>Rates & SLA</div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Hours per ticket and SLA targets per service</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 22, lineHeight: 1, padding: '0 4px' }}>×</button>
        </div>
        <div style={{ padding: '20px 24px', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ ...TH, textAlign: 'left' }}>Service</th>
                <th style={TH}>Hours / Ticket<br/><span style={{ fontWeight: 400, fontSize: 10 }}>how long each ticket takes</span></th>
                <th style={TH}>Tickets / Day<br/><span style={{ fontWeight: 400, fontSize: 10 }}>derived (8 ÷ hours)</span></th>
                <th style={TH}>SLA (working days)<br/><span style={{ fontWeight: 400, fontSize: 10 }}>target resolution time</span></th>
              </tr>
            </thead>
            <tbody>
              {displayServices.map((svc, i) => {
                const color = BAU_COLORS[svc] || SUBCAT_COLORS[svc] || '#94a3b8'
                const isSubcat = !BAU_SERVICES.includes(svc)
                return (
                  <tr key={svc} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #f0f3fa' }}>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 9, height: 9, borderRadius: '50%', background: color }} />
                        <span style={{ fontWeight: isSubcat ? 400 : 600, color: '#111827' }}>
                          {isSubcat ? <span style={{ color: '#9ca3af', marginRight: 4 }}>↳</span> : null}{svc}
                        </span>
                        {isSubcat && <span style={{ fontSize: 10, color: '#9ca3af', background: '#f3f4f6', borderRadius: 4, padding: '1px 5px' }}>sub-service</span>}
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <input type="number" value={localHours[svc] ?? ''} step={0.5} min={0.5}
                        onChange={e => setLocalHours(h => ({ ...h, [svc]: e.target.value }))}
                        style={{ width: 80, height: 32, padding: '0 8px', fontSize: 13, border: '1px solid #d1d5db', borderRadius: 7, textAlign: 'center', fontFamily: 'Inter, sans-serif', outline: 'none' }} />
                      <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 6 }}>h</span>
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: '#374151' }}>
                      {localHours[svc] > 0 ? +(8 / localHours[svc]).toFixed(2) : '—'}
                      <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 400, marginLeft: 4 }}>/day</span>
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <input type="number" value={localSla[svc] ?? ''} min={1} max={365}
                        onChange={e => setLocalSla(s => ({ ...s, [svc]: e.target.value }))}
                        style={{ width: 80, height: 32, padding: '0 8px', fontSize: 13, border: '1px solid #d1d5db', borderRadius: 7, textAlign: 'center', fontFamily: 'Inter, sans-serif', outline: 'none' }} />
                      <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 6 }}>days</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '14px 24px', borderTop: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 12 }}>
            {err  && <span style={{ color: '#dc2626' }}>{err}</span>}
            {saved && <span style={{ color: '#15803d' }}>✓ Saved</span>}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} style={{ height: 34, padding: '0 16px', fontSize: 13, cursor: 'pointer', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 8, fontFamily: 'Inter, sans-serif' }}>Close</button>
            <button onClick={save} disabled={saving} style={{ height: 34, padding: '0 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: saving ? '#94a3b8' : '#1450f5', color: '#fff', border: 'none', borderRadius: 8, fontFamily: 'Inter, sans-serif' }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Assignee multi-select dropdown ─────────────────────────────────────────── */
function AssigneeMultiSelect({ options, selected, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    function handle(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])
  const label = selected.length === 0 ? 'All Assignees'
    : selected.length === 1 ? selected[0]
    : `${selected.length} selected`
  const hasSelected = selected.length > 0
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        height: 30, padding: '0 10px', fontSize: 12, borderRadius: 7, background: '#fff', outline: 'none',
        fontFamily: 'Inter, sans-serif', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
        color: hasSelected ? '#111827' : '#9ca3af', border: `1px solid ${hasSelected ? '#a5b4fc' : '#e5e7eb'}`,
      }}>
        {label}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0 }}>
          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 200,
          background: '#fff', border: '1px solid #e5e8ef', borderRadius: 8,
          boxShadow: '0 4px 20px rgba(0,0,0,0.10)', minWidth: 210, maxHeight: 270, overflowY: 'auto', padding: '6px 0',
        }}>
          {options.length === 0 && (
            <div style={{ padding: '8px 14px', fontSize: 12, color: '#9ca3af' }}>No assignees in data</div>
          )}
          {options.map(name => {
            const checked = selected.includes(name)
            return (
              <label key={name} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px',
                cursor: 'pointer', fontSize: 12, color: '#111827',
                background: checked ? '#eff6ff' : 'transparent',
              }}>
                <input type="checkbox" checked={checked}
                  onChange={() => onChange(checked ? selected.filter(n => n !== name) : [...selected, name])}
                  style={{ accentColor: '#1450f5', cursor: 'pointer' }} />
                {name}
              </label>
            )
          })}
          {hasSelected && (
            <div style={{ borderTop: '1px solid #f0f3fa', padding: '6px 14px' }}>
              <button onClick={() => { onChange([]); setOpen(false) }}
                style={{ fontSize: 11, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'Inter, sans-serif' }}>
                Clear selection
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Main page ──────────────────────────────────────────────────────────────── */
export default function UtilityRatePage({ sessionId, onSessionExpired }) {
  const [data,         setData]         = useState(null)
  const [loading,      setLoading]      = useState(true)
  const [dateFrom,     setDateFrom]     = useState('')
  const [dateTo,       setDateTo]       = useState('')
  const [serviceF,     setServiceF]     = useState('')
  const [assigneeF,    setAssigneeF]    = useState([])
  const [mode,         setMode]         = useState('all')
  const [ticketSearch, setTicketSearch] = useState('')
  const [showTickets,  setShowTickets]  = useState(false)
  const [sortCol,      setSortCol]      = useState('utility_pct')
  const [sortDir,      setSortDir]      = useState('desc')
  const [showCapacity,  setShowCapacity]  = useState(false)
  const [showRatesSla,  setShowRatesSla]  = useState(false)
  const [showCadence,   setShowCadence]   = useState(false)
  const [showTraining,  setShowTraining]  = useState(false)
  const [capSettings,      setCapSettings]      = useState({ default_working_days: 250, default_holidays: 24, people: {} })
  const [bwRates,          setBwRates]          = useState({})
  const [slaRules,         setSlaRules]         = useState({})
  const [cadenceSettings,  setCadenceSettings]  = useState({ people: {} })
  const [trainingSettings, setTrainingSettings] = useState({ people: {} })

  useEffect(() => {
    setLoading(true)
    getUtilityRate(sessionId, dateFrom, dateTo, { assigned_to: assigneeF.join(','), service: serviceF, mode })
      .then(setData)
      .catch(err => { if (err.sessionExpired) onSessionExpired?.() })
      .finally(() => setLoading(false))
  }, [sessionId, dateFrom, dateTo, serviceF, assigneeF, mode])

  useEffect(() => {
    Promise.all([getCapacitySettings(), getBandwidthRates(), getSlaRules(), getCadenceSettings(), getTrainingSettings()])
      .then(([cap, bw, sla, cad, trn]) => {
        setCapSettings(cap); setBwRates(bw); setSlaRules(sla)
        setCadenceSettings(cad); setTrainingSettings(trn)
      })
      .catch(() => {})
  }, [])

  const assignees = data?.filter_options?.assignees ?? []
  const isClosed  = mode === 'closed'

  const servicePieData = useMemo(() => {
    if (!data) return []
    const totalH = data.total_committed_h || 1
    return (data.by_service || []).filter(r => r.committed_hours > 0).map(r => ({
      name: r.service, value: r.committed_hours,
      fill: BAU_COLORS[r.service] || '#94a3b8',
      pct: Math.round(r.committed_hours / totalH * 100),
    }))
  }, [data])

  const sortedAssignees = useMemo(() => {
    if (!data?.by_assignee) return []
    return [...data.by_assignee].sort((a, b) => {
      const av = a[sortCol] ?? 0, bv = b[sortCol] ?? 0
      return sortDir === 'asc' ? av - bv : bv - av
    })
  }, [data, sortCol, sortDir])

  const assigneesByHours = useMemo(() =>
    !data?.by_assignee ? [] :
    [...data.by_assignee].filter(r => r.committed_hours > 0).sort((a, b) => a.committed_hours - b.committed_hours)
  , [data])

  const assigneesByDtc = useMemo(() =>
    !data?.by_assignee ? [] :
    [...data.by_assignee].filter(r => r.avg_days_to_close != null).sort((a, b) => b.avg_days_to_close - a.avg_days_to_close)
  , [data])

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

  const SortIcon = ({ col }) =>
    sortCol !== col
      ? <span style={{ color: '#d1d5db', marginLeft: 3 }}>⇅</span>
      : <span style={{ color: '#1450f5', marginLeft: 3 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>

  const DATE_PRESETS = useMemo(() => {
    const now = new Date()
    const y = now.getFullYear(), m = now.getMonth()
    const fmt = d => d.toISOString().slice(0, 10)
    const lastDay = (yr, mo) => new Date(yr, mo + 1, 0)
    const qStartM  = Math.floor(m / 3) * 3
    const pqStartM = qStartM - 3
    const pqY = pqStartM < 0 ? y - 1 : y
    const pqM = pqStartM < 0 ? pqStartM + 12 : pqStartM
    return [
      { label: 'This Month',   from: fmt(new Date(y, m, 1)),       to: fmt(now) },
      { label: 'Last Month',   from: fmt(new Date(y, m - 1, 1)),   to: fmt(lastDay(y, m - 1)) },
      { label: 'This Quarter', from: fmt(new Date(y, qStartM, 1)), to: fmt(now) },
      { label: 'Last Quarter', from: fmt(new Date(pqY, pqM, 1)),   to: fmt(lastDay(pqY, pqM + 2)) },
      { label: 'YTD',          from: fmt(new Date(y, 0, 1)),       to: fmt(now) },
      { label: 'This Year',    from: fmt(new Date(y, 0, 1)),       to: fmt(new Date(y, 11, 31)) },
    ]
  }, [])

  const hasFilter = serviceF || assigneeF.length > 0 || dateFrom || dateTo

  // Resolve the active capacity preset into effective working_days / holidays
  const effectiveCapSettings = useMemo(() => {
    const m = capSettings.mode ?? 'annual'
    if (m === 'annual') return capSettings
    const preset = capSettings.presets?.[m]
    if (!preset) return capSettings
    return {
      ...capSettings,
      default_working_days: preset.default_working_days ?? capSettings.default_working_days,
      default_holidays:     preset.default_holidays     ?? capSettings.default_holidays,
    }
  }, [capSettings])

  const hasCapacityPlan = DEFAULT_PEOPLE.some(name => {
    const p = capSettings.people?.[name] || {}
    return BAU_SERVICES.some(s => (p.bau?.[s] ?? 0) > 0) || NON_BAU.some(a => (p.non_bau?.[a] ?? 0) > 0)
  })

  const btnStyle = { height: 32, padding: '0 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: '#fff', color: '#374151', border: '1px solid #e5e7eb', borderRadius: 8, fontFamily: 'Inter, sans-serif', display: 'flex', alignItems: 'center', gap: 6 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: 0 }}>Utility Rate</h2>
        <p style={{ fontSize: 13, color: '#6b7280', margin: '4px 0 0' }}>
          Capacity utilisation across services and assignees — denominator based on productivity days (75% of availability).
        </p>
      </div>

      {/* Filter bar */}
      <div style={{ background: '#fff', border: '1px solid #e5e8ef', borderRadius: 12, padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Row 1: filters + settings buttons */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: 8, padding: 3, gap: 2, flexShrink: 0 }}>
            {[['all', 'All Tracked'], ['closed', 'Closed Only']].map(([val, lbl]) => (
              <button key={val} onClick={() => setMode(val)} style={{
                padding: '5px 14px', fontSize: 12, fontWeight: mode === val ? 700 : 500,
                color: mode === val ? '#fff' : '#6b7280', background: mode === val ? '#1450f5' : 'transparent',
                border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'Inter, sans-serif',
              }}>{lbl}</button>
            ))}
          </div>
          <div style={{ width: 1, height: 28, background: '#e5e7eb', flexShrink: 0 }} />
          <DateRangePicker dateFrom={dateFrom} dateTo={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t) }} />
          <div style={{ width: 1, height: 28, background: '#e5e7eb', flexShrink: 0 }} />
          <select value={serviceF} onChange={e => setServiceF(e.target.value)} style={{
            height: 30, padding: '0 8px', fontSize: 12, borderRadius: 7, background: '#fff', outline: 'none',
            fontFamily: 'Inter, sans-serif', cursor: 'pointer',
            color: serviceF ? '#111827' : '#9ca3af', border: `1px solid ${serviceF ? '#a5b4fc' : '#e5e7eb'}`,
          }}>
            <option value="">All Services</option>
            {BAU_SERVICES.map(s => <option key={s} value={s}>{BAU_SHORT[s]}</option>)}
          </select>
          <AssigneeMultiSelect options={assignees} selected={assigneeF} onChange={setAssigneeF} />
          {hasFilter && (
            <button onClick={() => { setServiceF(''); setAssigneeF([]); setDateFrom(''); setDateTo('') }}
              style={{ height: 30, padding: '0 10px', fontSize: 12, cursor: 'pointer', background: 'none', color: '#6b7280', border: '1px solid #e5e7eb', borderRadius: 7, fontFamily: 'Inter, sans-serif' }}>
              Clear
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button onClick={() => setShowCapacity(true)} style={{
            ...btnStyle,
            borderColor: capSettings.mode && capSettings.mode !== 'annual' ? '#a78bfa' : undefined,
            color:       capSettings.mode && capSettings.mode !== 'annual' ? '#7c3aed' : undefined,
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
            Capacity
            {capSettings.mode && capSettings.mode !== 'annual' && (
              <span style={{ fontSize: 10, background: '#7c3aed', color: '#fff', borderRadius: 4, padding: '1px 5px', marginLeft: 2 }}>
                {capSettings.presets?.[capSettings.mode]?.label ?? capSettings.mode}
              </span>
            )}
          </button>
          <button onClick={() => setShowRatesSla(true)} style={btnStyle}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
            </svg>
            Rates & SLA
          </button>
          <button onClick={() => setShowCadence(true)} style={{ ...btnStyle, color: '#0891b2', borderColor: '#bae6fd' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            Cadence
          </button>
          <button onClick={() => setShowTraining(true)} style={{ ...btnStyle, color: '#7c3aed', borderColor: '#ddd6fe' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
            </svg>
            Training
          </button>
        </div>
        {/* Row 2: quick date presets */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', paddingTop: 6, borderTop: '1px solid #f3f4f6' }}>
          <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, flexShrink: 0 }}>Quick:</span>
          {DATE_PRESETS.map(p => {
            const active = dateFrom === p.from && dateTo === p.to
            return (
              <button key={p.label} onClick={() => { setDateFrom(p.from); setDateTo(p.to) }} style={{
                height: 26, padding: '0 11px', fontSize: 11, cursor: 'pointer', borderRadius: 6, fontFamily: 'Inter, sans-serif',
                fontWeight: active ? 700 : 500, border: active ? 'none' : '1px solid #e5e7eb',
                background: active ? '#1450f5' : '#f9fafb', color: active ? '#fff' : '#374151',
              }}>{p.label}</button>
            )
          })}
        </div>
      </div>

      {!loading && (
        <AllocUtilWidgets
          capSettings={effectiveCapSettings}
          cadenceSettings={cadenceSettings}
          trainingSettings={trainingSettings}
          data={data}
          assigneeF={assigneeF}
          serviceF={serviceF}
        />
      )}

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
            label={isClosed ? 'Delivered Utility Rate' : 'Team Utility Rate'}
            value={`${data.team_util_pct}%`}
            sub={`${data.total_committed_h}h committed of ${data.total_capacity_h}h capacity`}
            color={utilColor(data.team_util_pct)}
            bg={data.team_util_pct >= 85 ? '#fff1f2' : data.team_util_pct >= 60 ? '#fffbeb' : '#ecfdf5'}
            border={data.team_util_pct >= 85 ? '#fda4af' : data.team_util_pct >= 60 ? '#fcd34d' : '#6ee7b7'}
          />
          <StatCard label={isClosed ? 'Hours Delivered' : 'Committed Hours'} value={`${data.total_committed_h}h`}
            sub={isClosed ? 'estimated hours across closed tickets' : 'estimated hours in tracked tickets'}
            color="#1450f5" bg="#eff6ff" border="#c7d7fd" />
          {isClosed && data.overall_avg_days_to_close != null ? (
            <StatCard label="Avg Days to Close" value={`${data.overall_avg_days_to_close}d`}
              sub="calendar days from created to closed"
              color={dtcColor(data.overall_avg_days_to_close)}
              bg={data.overall_avg_days_to_close <= 7 ? '#ecfdf5' : data.overall_avg_days_to_close <= 14 ? '#fffbeb' : '#fff1f2'}
              border={data.overall_avg_days_to_close <= 7 ? '#6ee7b7' : data.overall_avg_days_to_close <= 14 ? '#fcd34d' : '#fda4af'} />
          ) : (
            <StatCard label="Available Capacity" value={`${Math.max(0, data.total_capacity_h - data.total_committed_h)}h`} sub={`${data.team_size} people · ${data.span_weeks}w`} />
          )}
          <StatCard label="Time Span" value={`${data.span_weeks}w`} sub={`${data.span_days} calendar days`} />
          <StatCard label="Team Size" value={data.team_size} sub="assignees with tracked tickets" />
        </div>

        {/* Gauge + donut */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 16 }}>
          <SectionCard title={isClosed ? 'Delivered Team Utilisation' : 'Overall Team Utilisation'} accent="#1450f5">
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <div style={{
                width: 140, height: 140, borderRadius: '50%', margin: '0 auto 16px',
                background: `conic-gradient(${utilColor(data.team_util_pct)} 0% ${Math.min(data.team_util_pct, 100)}%, #f0f3fa ${Math.min(data.team_util_pct, 100)}% 100%)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{ width: 100, height: 100, borderRadius: '50%', background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 26, fontWeight: 800, color: utilColor(data.team_util_pct) }}>{data.team_util_pct}%</span>
                  <span style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600 }}>{isClosed ? 'DELIVERED' : 'UTILISED'}</span>
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

          <SectionCard title="Capacity Mix by Service" subtitle={isClosed ? 'Share of delivered hours per service' : 'Share of committed hours per service'} accent="#7c3aed">
            {servicePieData.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#9ca3af', padding: 40, fontSize: 13 }}>No tracked data</div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={servicePieData} dataKey="value" nameKey="name" cx="40%" cy="50%" innerRadius={60} outerRadius={95} paddingAngle={2}>
                    {servicePieData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                  </Pie>
                  <Tooltip content={<PieTT />} />
                  <Legend layout="vertical" align="right" verticalAlign="middle"
                    formatter={(val) => <span style={{ fontSize: 11, color: '#374151' }}>{BAU_SHORT[val] || val}</span>}
                    iconType="circle" iconSize={8} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </SectionCard>
        </div>

        {/* Closed-mode charts */}
        {isClosed && data.by_assignee.length > 0 && (
          <SectionCard title="Closed Ticket Analysis by Assignee" subtitle="Hours delivered vs avg calendar days from ticket creation to close" accent="#0ea5e9">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 10 }}>Hours Delivered</div>
                <ResponsiveContainer width="100%" height={Math.max(160, assigneesByHours.length * 34)}>
                  <BarChart data={assigneesByHours} layout="vertical" margin={{ top: 0, right: 48, left: 0, bottom: 0 }} barSize={14}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f3fa" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="assigned_to" width={100} tick={{ fontSize: 11, fill: '#374151' }} axisLine={false} tickLine={false} />
                    <Tooltip content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null
                      const d = payload[0].payload
                      return (
                        <div style={{ background: '#fff', border: '1px solid #e5e8ef', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
                          <div style={{ fontWeight: 700, color: '#111827', marginBottom: 4 }}>{label}</div>
                          <div style={{ color: '#1450f5' }}>Hours: <strong>{d.committed_hours}h</strong></div>
                          <div style={{ color: '#6b7280' }}>Tickets: {d.tracked_tickets}</div>
                        </div>
                      )
                    }} cursor={{ fill: '#f5f7ff' }} />
                    <Bar dataKey="committed_hours" radius={[0, 4, 4, 0]}>
                      {assigneesByHours.map((r, i) => <Cell key={i} fill={utilColor(r.utility_pct)} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 10 }}>Avg Days to Close</div>
                {assigneesByDtc.length === 0 ? (
                  <div style={{ textAlign: 'center', color: '#9ca3af', padding: 40, fontSize: 13 }}>No closed date data</div>
                ) : (<>
                  <ResponsiveContainer width="100%" height={Math.max(160, assigneesByDtc.length * 34)}>
                    <BarChart data={assigneesByDtc} layout="vertical" margin={{ top: 0, right: 48, left: 0, bottom: 0 }} barSize={14}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f3fa" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="assigned_to" width={100} tick={{ fontSize: 11, fill: '#374151' }} axisLine={false} tickLine={false} />
                      <Tooltip content={<DtcTT />} cursor={{ fill: '#f5f7ff' }} />
                      <Bar dataKey="avg_days_to_close" radius={[0, 4, 4, 0]}>
                        {assigneesByDtc.map((r, i) => <Cell key={i} fill={dtcColor(r.avg_days_to_close)} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
                    {[['≤ 7d', '#1e8a5e'], ['8–14d', '#b87d00'], ['15–30d', '#e86427'], ['> 30d', '#c0305a']].map(([lbl, col]) => (
                      <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <div style={{ width: 8, height: 8, borderRadius: 2, background: col }} />
                        <span style={{ fontSize: 11, color: '#6b7280' }}>{lbl}</span>
                      </div>
                    ))}
                  </div>
                </>)}
              </div>
            </div>
          </SectionCard>
        )}

        {/* Capacity Planning section */}
        {hasCapacityPlan && (
          <CapacityPlanSection capSettings={effectiveCapSettings} byAssignee={data.by_assignee} bwRates={bwRates} />
        )}

        {/* By Service */}
        <SectionCard title="Utility Rate by Service" subtitle={`Tickets · estimated hours · share of capacity${isClosed ? ' · closed tickets only' : ''}`} accent="#0077a8">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.by_service.map(r => ({ name: BAU_SHORT[r.service] || r.service, hours: r.committed_hours, fill: BAU_COLORS[r.service] || '#94a3b8' }))}
                layout="vertical" margin={{ top: 4, right: 60, left: 0, bottom: 4 }} barSize={14}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f3fa" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11, fill: '#374151' }} axisLine={false} tickLine={false} />
                <Tooltip content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  return <div style={{ background: '#fff', border: '1px solid #e5e8ef', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}><div style={{ fontWeight: 700, color: '#111827', marginBottom: 4 }}>{label}</div><div style={{ color: '#1450f5' }}>Hours: <strong>{payload[0].value}h</strong></div></div>
                }} cursor={{ fill: '#f5f7ff' }} />
                <Bar dataKey="hours" radius={[0, 4, 4, 0]}>
                  {data.by_service.map((r, i) => <Cell key={i} fill={BAU_COLORS[r.service] || '#94a3b8'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
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
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: BAU_COLORS[r.service], flexShrink: 0 }} />
                          <span style={{ color: '#111827', fontWeight: 500 }}>{BAU_SHORT[r.service] || r.service}</span>
                        </div>
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'center', color: '#374151' }}>{r.tickets}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'center', color: '#6b7280' }}>{r.hours_per_ticket}h</td>
                      <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700, color: '#1450f5' }}>{r.committed_hours}h</td>
                      <td style={{ padding: '8px 10px', minWidth: 120 }}><LoadBar pct={r.team_util_pct} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </SectionCard>

        {/* Weekly trend */}
        {data.weekly_trend.length > 0 && (
          <SectionCard title="Weekly Utility Rate Trend" subtitle={`Committed hours vs capacity${isClosed ? ' — grouped by closed date' : ''}`} accent="#b87d00">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={data.weekly_trend} margin={{ top: 8, right: 20, left: 0, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f3fa" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#6b7280' }} angle={-35} textAnchor="end" interval={0} />
                <YAxis yAxisId="h" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="p" orientation="right" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} unit="%" />
                <Tooltip />
                <ReferenceLine yAxisId="p" y={85} stroke="#c0305a" strokeDasharray="4 4" label={{ value: '85%', position: 'insideTopRight', fontSize: 10, fill: '#c0305a' }} />
                <ReferenceLine yAxisId="p" y={60} stroke="#b87d00" strokeDasharray="4 4" label={{ value: '60%', position: 'insideTopRight', fontSize: 10, fill: '#b87d00' }} />
                <Bar yAxisId="h" dataKey="committed_hours" name="Committed hrs" fill="#6366f133" radius={[3, 3, 0, 0]} />
                <Line yAxisId="p" type="monotone" dataKey="utility_pct" name="Utility %" stroke="#1450f5" strokeWidth={2.5} dot={{ r: 3, fill: '#1450f5' }} activeDot={{ r: 5 }} />
                {isClosed && <Line yAxisId="h" type="monotone" dataKey="avg_days_to_close" name="Avg Days to Close" stroke="#0ea5e9" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 3, fill: '#0ea5e9' }} activeDot={{ r: 5 }} />}
              </LineChart>
            </ResponsiveContainer>
          </SectionCard>
        )}

        {/* By Assignee table */}
        <SectionCard title="Utility Rate by Assignee" subtitle="Individual utilisation · committed vs available hours" accent="#1e8a5e">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  {[
                    { label: 'Assignee',        col: 'assigned_to'    },
                    { label: 'Tracked Tickets', col: 'tracked_tickets' },
                    { label: 'Committed',       col: 'committed_hours' },
                    { label: 'Capacity',        col: 'capacity_hours'  },
                    { label: 'Utility Rate',    col: 'utility_pct'    },
                    { label: 'Status',          col: 'status'          },
                    ...(isClosed ? [{ label: 'Avg Days to Close', col: 'avg_days_to_close' }] : []),
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
                  {BAU_SERVICES.map((sc, idx) => (
                    <th key={sc} style={{
                      padding: '9px 10px', fontWeight: 700, fontSize: 10, color: BAU_COLORS[sc],
                      textAlign: 'center', borderBottom: '2px solid #e5e8ef', whiteSpace: 'nowrap',
                      background: '#f5f5ff', borderLeft: idx === 0 ? '2px solid #e0e0ff' : undefined,
                    }}>{BAU_SHORT[sc]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedAssignees.length === 0 ? (
                  <tr><td colSpan={6 + (isClosed ? 1 : 0) + BAU_SERVICES.length} style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>No data</td></tr>
                ) : sortedAssignees.map((row, i) => {
                  const sCfg = STATUS_CFG[row.status] || STATUS_CFG.Available
                  const bg = i % 2 === 0 ? '#fff' : '#fafafa'
                  return (
                    <tr key={row.assigned_to} style={{ background: bg, borderBottom: '1px solid #f0f3fa' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f0f4ff'}
                      onMouseLeave={e => e.currentTarget.style.background = bg}>
                      <td style={{ padding: '9px 12px', fontWeight: 600, color: '#111827', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <div style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, background: `hsl(${Math.abs(row.assigned_to.charCodeAt(0) * 37) % 360},55%,88%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>
                            {row.assigned_to.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                          </div>
                          {row.assigned_to}
                        </div>
                      </td>
                      <td style={{ padding: '9px 12px', textAlign: 'center', color: '#374151' }}>{row.tracked_tickets}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 700, color: '#1450f5' }}>{row.committed_hours}h</td>
                      <td style={{ padding: '9px 12px', textAlign: 'center', color: '#6b7280' }}>{row.capacity_hours}h</td>
                      <td style={{ padding: '9px 12px', minWidth: 130 }}><LoadBar pct={row.utility_pct} /></td>
                      <td style={{ padding: '9px 12px', textAlign: 'center' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: sCfg.color, background: sCfg.bg, border: `1px solid ${sCfg.border}`, borderRadius: 20, padding: '3px 9px', whiteSpace: 'nowrap' }}>{row.status}</span>
                      </td>
                      {isClosed && (
                        <td style={{ padding: '9px 12px', textAlign: 'center' }}>
                          {row.avg_days_to_close != null ? (
                            <span style={{ fontSize: 12, fontWeight: 700, color: dtcColor(row.avg_days_to_close) }}>
                              {row.avg_days_to_close}d
                              {row.min_days_to_close != null && row.min_days_to_close !== row.max_days_to_close && (
                                <span style={{ fontSize: 10, fontWeight: 400, color: '#9ca3af', marginLeft: 4 }}>({row.min_days_to_close}–{row.max_days_to_close})</span>
                              )}
                            </span>
                          ) : <span style={{ color: '#d1d5db' }}>—</span>}
                        </td>
                      )}
                      {BAU_SERVICES.map((sc, idx) => {
                        const cnt = row.breakdown[sc] ?? 0
                        return (
                          <td key={sc} style={{ padding: '9px 10px', textAlign: 'center', background: idx % 2 === 0 ? `${BAU_COLORS[sc]}08` : `${BAU_COLORS[sc]}12`, borderLeft: idx === 0 ? '2px solid #e0e0ff' : undefined }}>
                            {cnt > 0
                              ? <span style={{ fontWeight: 700, fontSize: 12, color: BAU_COLORS[sc], background: `${BAU_COLORS[sc]}20`, borderRadius: 5, padding: '2px 7px' }}>{cnt}</span>
                              : <span style={{ color: '#d1d5db' }}>—</span>}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
              {sortedAssignees.length > 0 && (
                <tfoot>
                  <tr style={{ background: '#f0f4ff', borderTop: '2px solid #c7d7fd' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 700, color: '#1450f5' }}>Team Total</td>
                    <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: '#1450f5' }}>{sortedAssignees.reduce((s, r) => s + r.tracked_tickets, 0)}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: '#1450f5' }}>{data.total_committed_h}h</td>
                    <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: '#6b7280' }}>{data.total_capacity_h}h</td>
                    <td style={{ padding: '8px 12px', minWidth: 130 }}><LoadBar pct={data.team_util_pct} /></td>
                    <td />
                    {isClosed && (
                      <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: data.overall_avg_days_to_close != null ? dtcColor(data.overall_avg_days_to_close) : '#9ca3af' }}>
                        {data.overall_avg_days_to_close != null ? `${data.overall_avg_days_to_close}d` : '—'}
                      </td>
                    )}
                    {BAU_SERVICES.map((sc, idx) => {
                      const tot = sortedAssignees.reduce((s, r) => s + (r.breakdown[sc] ?? 0), 0)
                      return (
                        <td key={sc} style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700, color: BAU_COLORS[sc], borderLeft: idx === 0 ? '2px solid #e0e0ff' : undefined }}>
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
        <SectionCard title={`By Ticket (${data.by_ticket.length} tracked)`} subtitle={`Individual ticket estimated hours${isClosed ? ' · sorted by closed date' : ' · sorted by most recent'}`} accent="#94a3b8">
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
                    {['Ticket #', 'Description', 'Service', 'Assignee', 'Created',
                      ...(isClosed ? ['Closed', 'Days to Close'] : []),
                      'Status', 'Est. Hours'].map(h => (
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
                        <span style={{ fontSize: 11, fontWeight: 600, color: SUBCAT_COLORS[t.sub_category] || '#6b7280', background: (SUBCAT_COLORS[t.sub_category] || '#94a3b8') + '18', borderRadius: 5, padding: '2px 7px' }}>
                          {SUBCAT_SHORT[t.sub_category] || t.sub_category}
                        </span>
                      </td>
                      <td style={{ padding: '7px 10px', textAlign: 'center', color: '#374151', whiteSpace: 'nowrap' }}>{t.assigned_to || '—'}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'center', color: '#6b7280', whiteSpace: 'nowrap' }}>{t.created_date?.slice(0, 10) || '—'}</td>
                      {isClosed && <>
                        <td style={{ padding: '7px 10px', textAlign: 'center', color: '#6b7280', whiteSpace: 'nowrap' }}>{t.closed_date?.slice(0, 10) || '—'}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                          {t.days_to_close != null
                            ? <span style={{ fontWeight: 700, color: dtcColor(t.days_to_close) }}>{t.days_to_close}d</span>
                            : <span style={{ color: '#d1d5db' }}>—</span>}
                        </td>
                      </>}
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

      {showCapacity && (
        <CapacityModal
          capSettings={capSettings}
          onClose={() => setShowCapacity(false)}
          onSaved={({ capSettings: newCap }) => { setCapSettings(newCap); setShowCapacity(false) }}
        />
      )}
      {showRatesSla && (
        <RatesSlaModal
          bwRates={bwRates} slaRules={slaRules}
          onClose={() => setShowRatesSla(false)}
          onSaved={({ bwRates: nb, slaRules: ns }) => { setBwRates(nb); setSlaRules(ns); setShowRatesSla(false) }}
        />
      )}
      {showCadence && (
        <CadenceModal
          cadenceSettings={cadenceSettings}
          spanWeeks={data?.span_weeks ?? 52}
          onClose={() => setShowCadence(false)}
          onSaved={({ cadenceSettings: newCad }) => { setCadenceSettings(newCad); setShowCadence(false) }}
        />
      )}
      {showTraining && (
        <TrainingModal
          trainingSettings={trainingSettings}
          spanDays={data?.span_days ?? 365}
          onClose={() => setShowTraining(false)}
          onSaved={({ trainingSettings: newTrn }) => { setTrainingSettings(newTrn); setShowTraining(false) }}
        />
      )}
    </div>
  )
}
