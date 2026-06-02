import { useEffect, useState, useMemo } from 'react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend,
  ReferenceLine,
} from 'recharts'
import {
  getUtilityRate, getCapacitySettings, updateCapacitySettings,
  getBandwidthRates, updateBandwidthRates, getSlaRules, updateSlaRules,
} from '../api'
import DateRangePicker from '../components/DateRangePicker'

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

/* ── Capacity Planning section (main page) ──────────────────────────────────── */
function CapacityPlanSection({ capSettings, byAssignee, bwRates }) {
  const people = Object.entries(capSettings.people || {})
    .filter(([, p]) => SERVICES.some(s => (p.allocations?.[s] ?? 0) > 0))
  if (!people.length) return null

  const actualLookup = {}
  byAssignee.forEach(a => { actualLookup[a.assigned_to] = a.breakdown || {} })

  const grouped = people.map(([name, settings]) => {
    const officeDays = settings.office_days ?? capSettings.default_office_days ?? 220
    const rows = SERVICES.filter(svc => (settings.allocations?.[svc] ?? 0) > 0).map(svc => {
      const allocPct  = settings.allocations[svc]
      const rate      = bwRates[svc] || 0
      const allocDays = +(officeDays * allocPct / 100).toFixed(1)
      const quota     = +(rate * allocDays).toFixed(1)
      const actual    = actualLookup[name]?.[svc] || 0
      const att       = quota > 0 ? Math.round(actual / quota * 100) : null
      return { svc, allocPct, allocDays, rate, quota, actual, att }
    })
    const totQuota  = +rows.reduce((s, r) => s + r.quota, 0).toFixed(1)
    const totActual = rows.reduce((s, r) => s + r.actual, 0)
    const totAtt    = totQuota > 0 ? Math.round(totActual / totQuota * 100) : null
    return { name, officeDays, rows, totQuota, totActual, totAtt }
  })

  const HDR = { padding: '8px 12px', fontWeight: 700, color: '#6b7280', fontSize: 11, borderBottom: '2px solid #e5e8ef', whiteSpace: 'nowrap', background: '#f9fafb' }

  return (
    <SectionCard title="Capacity Planning" subtitle="Ticket quota vs actual based on configured office days and service allocation" accent="#7c3aed">
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              {['Person', 'Service', 'Office Days', 'Alloc %', 'Alloc Days', 'Tickets / Day', 'Quota', 'Actual', 'Attainment'].map((h, i) => (
                <th key={h} style={{ ...HDR, textAlign: i <= 1 ? 'left' : 'center' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grouped.map(({ name, officeDays, rows, totQuota, totActual, totAtt }, gi) => {
              const personBg = gi % 2 === 0 ? '#fff' : '#fafbff'
              const totAS = attStyle(totAtt)
              return [
                ...rows.map((r, ri) => {
                  const as = attStyle(r.att)
                  return (
                    <tr key={`${name}-${r.svc}`} style={{ background: personBg, borderBottom: '1px solid #f0f3fa' }}>
                      {ri === 0 && (
                        <td rowSpan={rows.length + 1} style={{ padding: '10px 12px', fontWeight: 700, color: '#111827', verticalAlign: 'middle', borderRight: '1px solid #e5e8ef', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <div style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, background: `hsl(${Math.abs(name.charCodeAt(0) * 37) % 360},55%,88%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>
                              {name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                            </div>
                            {name}
                          </div>
                        </td>
                      )}
                      <td style={{ padding: '8px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 7, height: 7, borderRadius: '50%', background: SERVICE_COLORS[r.svc], flexShrink: 0 }} />
                          <span style={{ color: '#374151' }}>{SERVICE_SHORT[r.svc]}</span>
                        </div>
                      </td>
                      {ri === 0 && (
                        <td rowSpan={rows.length + 1} style={{ padding: '8px 12px', textAlign: 'center', color: '#6b7280', verticalAlign: 'middle' }}>{officeDays}d</td>
                      )}
                      <td style={{ padding: '8px 12px', textAlign: 'center', color: '#374151' }}>{r.allocPct}%</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center', color: '#374151' }}>{r.allocDays}d</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center', color: '#6b7280' }}>{r.rate}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: '#1450f5' }}>{r.quota}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center', color: '#374151' }}>{r.actual}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        {r.att != null
                          ? <span style={{ fontWeight: 700, color: as.color, background: as.bg, borderRadius: 6, padding: '2px 8px' }}>{r.att}%</span>
                          : <span style={{ color: '#d1d5db' }}>—</span>}
                      </td>
                    </tr>
                  )
                }),
                // Summary row for this person
                <tr key={`${name}-total`} style={{ background: personBg, borderBottom: '2px solid #e5e8ef' }}>
                  {/* person and officeDays cells are rowSpanned */}
                  <td style={{ padding: '7px 12px', fontStyle: 'italic', color: '#6b7280' }}>Total</td>
                  <td colSpan={3} />
                  <td style={{ padding: '7px 12px', textAlign: 'center', fontWeight: 700, color: '#1450f5' }}>{totQuota}</td>
                  <td style={{ padding: '7px 12px', textAlign: 'center', fontWeight: 700, color: '#374151' }}>{totActual}</td>
                  <td style={{ padding: '7px 12px', textAlign: 'center' }}>
                    {totAtt != null
                      ? <span style={{ fontWeight: 700, color: totAS.color, background: totAS.bg, borderRadius: 6, padding: '2px 8px' }}>{totAtt}%</span>
                      : <span style={{ color: '#d1d5db' }}>—</span>}
                  </td>
                </tr>,
              ]
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

/* ── Settings Modal ─────────────────────────────────────────────────────────── */
function SettingsModal({ assignees, capSettings, bwRates, slaRules, onClose, onSaved }) {
  const [tab, setTab] = useState('capacity')

  // Capacity tab
  const [defaultDays, setDefaultDays] = useState(capSettings.default_office_days ?? 220)
  const [localPeople, setLocalPeople] = useState(() => {
    const r = {}
    assignees.forEach(name => {
      const saved = capSettings.people?.[name] || {}
      r[name] = {
        office_days:  saved.office_days ?? null,
        allocations:  Object.fromEntries(SERVICES.map(s => [s, saved.allocations?.[s] ?? 0])),
      }
    })
    return r
  })

  // Rates & SLA tab
  const [localHours, setLocalHours] = useState(() =>
    Object.fromEntries(Object.entries(bwRates).map(([s, rate]) => [s, +(8 / rate).toFixed(2)]))
  )
  const [localSla, setLocalSla] = useState({ ...slaRules })

  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState(null)
  const [saved,  setSaved]  = useState(false)

  function setPerson(name, field, value) {
    setLocalPeople(p => ({ ...p, [name]: { ...p[name], [field]: value } }))
  }
  function setAlloc(name, svc, value) {
    setLocalPeople(p => ({ ...p, [name]: { ...p[name], allocations: { ...p[name].allocations, [svc]: value ?? 0 } } }))
  }
  function totalPct(name) {
    return SERVICES.reduce((s, svc) => s + (localPeople[name]?.allocations?.[svc] ?? 0), 0)
  }

  async function saveCapacity() {
    setSaving(true); setError(null); setSaved(false)
    try {
      const payload = {
        default_office_days: Number(defaultDays),
        people: Object.fromEntries(
          Object.entries(localPeople).map(([name, p]) => [name, {
            office_days:  p.office_days != null ? Number(p.office_days) : null,
            allocations:  Object.fromEntries(Object.entries(p.allocations).map(([s, v]) => [s, Number(v) || 0])),
          }])
        ),
      }
      const result = await updateCapacitySettings(payload)
      onSaved({ capSettings: result })
      setSaved(true)
    } catch { setError('Failed to save capacity settings') }
    finally { setSaving(false) }
  }

  async function saveRatesSla() {
    setSaving(true); setError(null); setSaved(false)
    try {
      const newRates = Object.fromEntries(
        Object.entries(localHours).map(([s, h]) => [s, +(8 / Number(h)).toFixed(4)])
      )
      const newSla = Object.fromEntries(Object.entries(localSla).map(([s, v]) => [s, Number(v)]))
      await Promise.all([updateBandwidthRates(newRates), updateSlaRules(newSla)])
      onSaved({ bwRates: newRates, slaRules: newSla })
      setSaved(true)
    } catch { setError('Failed to save rates / SLA') }
    finally { setSaving(false) }
  }

  const INPH = { padding: '8px 10px', fontWeight: 700, color: '#6b7280', fontSize: 11, textAlign: 'center', borderBottom: '2px solid #e5e8ef', whiteSpace: 'nowrap', background: '#f9fafb' }
  const INPL = { padding: '8px 10px', fontWeight: 700, color: '#6b7280', fontSize: 11, textAlign: 'left', borderBottom: '2px solid #e5e8ef', whiteSpace: 'nowrap', background: '#f9fafb' }

  // Live-preview derived quotas
  const previewRows = useMemo(() => {
    const rows = []
    assignees.forEach(name => {
      const days = localPeople[name]?.office_days ?? Number(defaultDays)
      SERVICES.forEach(svc => {
        const allocPct = localPeople[name]?.allocations?.[svc] ?? 0
        if (allocPct <= 0) return
        const rate = bwRates[svc] || 0
        const allocDays = +(days * allocPct / 100).toFixed(1)
        const quota = +(rate * allocDays).toFixed(1)
        rows.push({ name, svc, days, allocPct, allocDays, rate, quota })
      })
    })
    return rows
  }, [localPeople, defaultDays, bwRates, assignees])

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, padding: '32px 16px', overflowY: 'auto' }}
      onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 960, boxShadow: '0 24px 60px rgba(0,0,0,0.25)', flexShrink: 0 }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>Utility Rate Settings</div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Configure team capacity, ticket rates, and SLA rules</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 22, lineHeight: 1, padding: '0 4px' }}>×</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #f3f4f6', padding: '0 24px' }}>
          {[['capacity', 'Team Capacity'], ['rates', 'Rates & SLA']].map(([id, lbl]) => (
            <button key={id} onClick={() => { setTab(id); setSaved(false); setError(null) }} style={{
              padding: '11px 16px', fontSize: 13, fontWeight: tab === id ? 600 : 500,
              color: tab === id ? '#1450f5' : '#6b7280', background: 'none', border: 'none', cursor: 'pointer',
              borderBottom: tab === id ? '2px solid #1450f5' : '2px solid transparent',
              marginBottom: -1, fontFamily: 'Inter, sans-serif',
            }}>{lbl}</button>
          ))}
        </div>

        {/* Body */}
        <div style={{ padding: '22px 24px', maxHeight: 'calc(100vh - 240px)', overflowY: 'auto' }}>

          {/* ── Capacity tab ── */}
          {tab === 'capacity' && (<>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, padding: '12px 16px', background: '#f9fafb', borderRadius: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Default office days / year:</span>
              <NumInput value={defaultDays} onChange={v => setDefaultDays(v ?? 220)} min={1} max={365} width={80} />
              <span style={{ fontSize: 12, color: '#9ca3af' }}>e.g. 220 ≈ 44 weeks × 5 days</span>
            </div>

            <div style={{ overflowX: 'auto', marginBottom: 24 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={INPL}>Person</th>
                    <th style={INPH}>Office Days<br/><span style={{ fontWeight: 400, fontSize: 10 }}>(blank = default)</span></th>
                    {SERVICES.map(s => (
                      <th key={s} style={{ ...INPH, color: SERVICE_COLORS[s] }}>{SERVICE_SHORT[s]} %</th>
                    ))}
                    <th style={INPH}>Total %</th>
                  </tr>
                </thead>
                <tbody>
                  {assignees.map((name, i) => {
                    const tot = totalPct(name)
                    const totColor = tot === 100 ? '#15803d' : tot > 100 ? '#991b1b' : tot > 0 ? '#854d0e' : '#9ca3af'
                    return (
                      <tr key={name} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #f0f3fa' }}>
                        <td style={{ padding: '8px 12px', fontWeight: 600, color: '#111827', whiteSpace: 'nowrap' }}>{name}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                          <NumInput value={localPeople[name]?.office_days} onChange={v => setPerson(name, 'office_days', v)} placeholder={String(defaultDays)} min={1} max={365} width={72} />
                        </td>
                        {SERVICES.map(svc => (
                          <td key={svc} style={{ padding: '8px 6px', textAlign: 'center' }}>
                            <input type="number" value={localPeople[name]?.allocations?.[svc] ?? 0} min={0} max={100}
                              onChange={e => setAlloc(name, svc, Number(e.target.value))}
                              style={{ width: 58, height: 30, padding: '0 6px', fontSize: 12, border: `1px solid ${SERVICE_COLORS[svc]}60`, borderRadius: 6, textAlign: 'center', fontFamily: 'Inter, sans-serif', color: SERVICE_COLORS[svc], outline: 'none', boxSizing: 'border-box' }} />
                          </td>
                        ))}
                        <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700, color: totColor }}>
                          {tot}%
                          {tot !== 0 && tot !== 100 && <div style={{ fontSize: 9, fontWeight: 400, color: tot > 100 ? '#991b1b' : '#854d0e' }}>{tot > 100 ? '↑ over' : '↓ under'}</div>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Live quota preview */}
            {previewRows.length > 0 && (<>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                Derived Ticket Quota Preview
                <span style={{ fontSize: 11, fontWeight: 400, color: '#9ca3af' }}>updates live as you type</span>
              </div>
              <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #e5e8ef' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#f0f4ff' }}>
                      {['Person', 'Service', 'Office Days', 'Alloc %', 'Alloc Days', 'Tickets / Day', 'Ticket Quota'].map((h, i) => (
                        <th key={h} style={{ padding: '7px 10px', fontWeight: 700, color: '#374151', fontSize: 11, textAlign: i <= 1 ? 'left' : 'center', borderBottom: '1px solid #c7d7fd', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((r, i) => (
                      <tr key={`${r.name}-${r.svc}`} style={{ background: i % 2 === 0 ? '#fff' : '#f9fafb', borderBottom: '1px solid #f0f3fa' }}>
                        <td style={{ padding: '7px 10px', fontWeight: 600, color: '#111827' }}>{r.name}</td>
                        <td style={{ padding: '7px 10px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <div style={{ width: 7, height: 7, borderRadius: '50%', background: SERVICE_COLORS[r.svc] }} />
                            <span style={{ color: '#374151' }}>{SERVICE_SHORT[r.svc]}</span>
                          </div>
                        </td>
                        <td style={{ padding: '7px 10px', textAlign: 'center', color: '#6b7280' }}>{r.days}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'center', color: '#374151' }}>{r.allocPct}%</td>
                        <td style={{ padding: '7px 10px', textAlign: 'center', color: '#374151' }}>{r.allocDays}d</td>
                        <td style={{ padding: '7px 10px', textAlign: 'center', color: '#6b7280' }}>{r.rate} / day</td>
                        <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                          <span style={{ fontWeight: 700, color: '#1450f5', background: '#eff6ff', borderRadius: 5, padding: '2px 8px' }}>{r.quota}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>)}
          </>)}

          {/* ── Rates & SLA tab ── */}
          {tab === 'rates' && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={INPL}>Service</th>
                    <th style={{ ...INPH, textAlign: 'center' }}>Hours / Ticket<br/><span style={{ fontWeight: 400, fontSize: 10 }}>how long each ticket takes</span></th>
                    <th style={{ ...INPH, textAlign: 'center' }}>Tickets / Day<br/><span style={{ fontWeight: 400, fontSize: 10 }}>derived (8 ÷ hours)</span></th>
                    <th style={{ ...INPH, textAlign: 'center' }}>SLA (working days)<br/><span style={{ fontWeight: 400, fontSize: 10 }}>target resolution time</span></th>
                  </tr>
                </thead>
                <tbody>
                  {SERVICES.map((svc, i) => (
                    <tr key={svc} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #f0f3fa' }}>
                      <td style={{ padding: '12px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 9, height: 9, borderRadius: '50%', background: SERVICE_COLORS[svc] }} />
                          <span style={{ fontWeight: 600, color: '#111827' }}>{svc}</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 12px', textAlign: 'center' }}>
                        <input type="number" value={localHours[svc] ?? ''} step={0.5} min={0.5}
                          onChange={e => setLocalHours(h => ({ ...h, [svc]: e.target.value }))}
                          style={{ width: 90, height: 32, padding: '0 8px', fontSize: 13, border: '1px solid #d1d5db', borderRadius: 7, textAlign: 'center', fontFamily: 'Inter, sans-serif', outline: 'none' }} />
                        <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 6 }}>h</span>
                      </td>
                      <td style={{ padding: '12px 12px', textAlign: 'center', fontWeight: 700, color: '#374151' }}>
                        {localHours[svc] > 0 ? +(8 / localHours[svc]).toFixed(2) : '—'}
                        <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 400, marginLeft: 4 }}>/day</span>
                      </td>
                      <td style={{ padding: '12px 12px', textAlign: 'center' }}>
                        <input type="number" value={localSla[svc] ?? ''} min={1} max={365}
                          onChange={e => setLocalSla(s => ({ ...s, [svc]: e.target.value }))}
                          style={{ width: 90, height: 32, padding: '0 8px', fontSize: 13, border: '1px solid #d1d5db', borderRadius: 7, textAlign: 'center', fontFamily: 'Inter, sans-serif', outline: 'none' }} />
                        <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 6 }}>days</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            {error && <span style={{ fontSize: 12, color: '#991b1b' }}>{error}</span>}
            {saved && <span style={{ fontSize: 12, color: '#15803d' }}>✓ Saved successfully</span>}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} style={{ height: 36, padding: '0 18px', fontSize: 13, fontWeight: 500, cursor: 'pointer', background: '#fff', color: '#374151', border: '1px solid #e5e7eb', borderRadius: 8, fontFamily: 'Inter, sans-serif' }}>
              Close
            </button>
            <button onClick={tab === 'capacity' ? saveCapacity : saveRatesSla} disabled={saving}
              style={{ height: 36, padding: '0 20px', fontSize: 13, fontWeight: 600, cursor: saving ? 'wait' : 'pointer', background: '#1450f5', color: '#fff', border: 'none', borderRadius: 8, fontFamily: 'Inter, sans-serif', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving…' : tab === 'capacity' ? 'Save Capacity' : 'Save Rates & SLA'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Main page ──────────────────────────────────────────────────────────────── */
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

export default function UtilityRatePage({ sessionId, onSessionExpired }) {
  const [data,       setData]       = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [dateFrom,   setDateFrom]   = useState('')
  const [dateTo,     setDateTo]     = useState('')
  const [teamF,      setTeamF]      = useState('')
  const [areaF,      setAreaF]      = useState('')
  const [assigneeF,  setAssigneeF]  = useState('')
  const [mode,       setMode]       = useState('all')
  const [ticketSearch, setTicketSearch] = useState('')
  const [showTickets,  setShowTickets]  = useState(false)
  const [sortCol, setSortCol] = useState('utility_pct')
  const [sortDir, setSortDir] = useState('desc')
  const [showSettings, setShowSettings] = useState(false)
  const [capSettings, setCapSettings] = useState({ default_office_days: 220, people: {} })
  const [bwRates,     setBwRates]     = useState({})
  const [slaRules,    setSlaRules]    = useState({})

  // Load utility rate data
  useEffect(() => {
    setLoading(true)
    getUtilityRate(sessionId, dateFrom, dateTo, { team: teamF, area: areaF, assigned_to: assigneeF, mode })
      .then(setData)
      .catch(err => { if (err.sessionExpired) onSessionExpired?.() })
      .finally(() => setLoading(false))
  }, [sessionId, dateFrom, dateTo, teamF, areaF, assigneeF, mode])

  // Load settings once on mount
  useEffect(() => {
    Promise.all([getCapacitySettings(), getBandwidthRates(), getSlaRules()])
      .then(([cap, bw, sla]) => { setCapSettings(cap); setBwRates(bw); setSlaRules(sla) })
      .catch(() => {})
  }, [])

  const teams     = data?.filter_options?.teams     ?? []
  const areas     = data?.filter_options?.areas     ?? []
  const assignees = data?.filter_options?.assignees ?? []
  const isClosed  = mode === 'closed'

  const servicePieData = useMemo(() => {
    if (!data) return []
    const totalH = data.total_committed_h || 1
    return (data.by_service || []).filter(r => r.committed_hours > 0).map(r => ({
      name: r.service, value: r.committed_hours,
      fill: SERVICE_COLORS[r.service] || '#94a3b8',
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
    [...data.by_assignee].filter(r => r.committed_hours > 0)
      .sort((a, b) => a.committed_hours - b.committed_hours)
  , [data])

  const assigneesByDtc = useMemo(() =>
    !data?.by_assignee ? [] :
    [...data.by_assignee].filter(r => r.avg_days_to_close != null)
      .sort((a, b) => b.avg_days_to_close - a.avg_days_to_close)
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

  const hasFilter = teamF || areaF || assigneeF || dateFrom || dateTo

  const hasCapacityPlan = Object.values(capSettings.people || {})
    .some(p => SERVICES.some(s => (p.allocations?.[s] ?? 0) > 0))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: 0 }}>Utility Rate</h2>
        <p style={{ fontSize: 13, color: '#6b7280', margin: '4px 0 0' }}>
          Capacity utilisation across services, assignees and time — based on estimated hours per ticket type.
        </p>
      </div>

      {/* Filter bar */}
      <div style={{ background: '#fff', border: '1px solid #e5e8ef', borderRadius: 12, padding: '12px 18px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Mode toggle */}
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
        {[
          { label: 'All Teams',     val: teamF,     set: setTeamF,     opts: teams },
          { label: 'All Areas',     val: areaF,     set: setAreaF,     opts: areas },
          { label: 'All Assignees', val: assigneeF, set: setAssigneeF, opts: assignees },
        ].map(({ label, val, set, opts }) => (
          <select key={label} value={val} onChange={e => set(e.target.value)} style={{
            height: 30, padding: '0 8px', fontSize: 12, borderRadius: 7, background: '#fff', outline: 'none',
            fontFamily: 'Inter, sans-serif', cursor: 'pointer',
            color: val ? '#111827' : '#9ca3af', border: `1px solid ${val ? '#a5b4fc' : '#e5e7eb'}`,
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
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowSettings(true)} style={{
          height: 32, padding: '0 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          background: '#fff', color: '#374151', border: '1px solid #e5e7eb', borderRadius: 8,
          fontFamily: 'Inter, sans-serif', display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
          Settings
        </button>
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
            <StatCard label="Available Capacity" value={`${Math.max(0, data.total_capacity_h - data.total_committed_h)}h`} sub={`${data.team_size} people × 40h × ${data.span_weeks}w`} />
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
                    formatter={(val) => <span style={{ fontSize: 11, color: '#374151' }}>{SERVICE_SHORT[val] || val}</span>}
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
          <CapacityPlanSection capSettings={capSettings} byAssignee={data.by_assignee} bwRates={bwRates} />
        )}

        {/* By Service */}
        <SectionCard title="Utility Rate by Service" subtitle={`Tickets · estimated hours · share of capacity${isClosed ? ' · closed tickets only' : ''}`} accent="#0077a8">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.by_service.map(r => ({ name: SERVICE_SHORT[r.service] || r.service, hours: r.committed_hours, fill: SERVICE_COLORS[r.service] || '#94a3b8' }))}
                layout="vertical" margin={{ top: 4, right: 60, left: 0, bottom: 4 }} barSize={14}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f3fa" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11, fill: '#374151' }} axisLine={false} tickLine={false} />
                <Tooltip content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  return <div style={{ background: '#fff', border: '1px solid #e5e8ef', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}><div style={{ fontWeight: 700, color: '#111827', marginBottom: 4 }}>{label}</div><div style={{ color: '#1450f5' }}>Hours: <strong>{payload[0].value}h</strong></div></div>
                }} cursor={{ fill: '#f5f7ff' }} />
                <Bar dataKey="hours" radius={[0, 4, 4, 0]}>
                  {data.by_service.map((r, i) => <Cell key={i} fill={SERVICE_COLORS[r.service] || '#94a3b8'} />)}
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
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: SERVICE_COLORS[r.service], flexShrink: 0 }} />
                          <span style={{ color: '#111827', fontWeight: 500 }}>{SERVICE_SHORT[r.service] || r.service}</span>
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
                  {SERVICES.map(sc => (
                    <th key={sc} style={{
                      padding: '9px 10px', fontWeight: 700, fontSize: 10, color: SERVICE_COLORS[sc],
                      textAlign: 'center', borderBottom: '2px solid #e5e8ef', whiteSpace: 'nowrap',
                      background: '#f5f5ff', borderLeft: sc === SERVICES[0] ? '2px solid #e0e0ff' : undefined,
                    }}>{SERVICE_SHORT[sc]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedAssignees.length === 0 ? (
                  <tr><td colSpan={6 + (isClosed ? 1 : 0) + SERVICES.length} style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>No data</td></tr>
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
                      {SERVICES.map((sc, idx) => {
                        const cnt = row.breakdown[sc] ?? 0
                        return (
                          <td key={sc} style={{ padding: '9px 10px', textAlign: 'center', background: idx % 2 === 0 ? `${SERVICE_COLORS[sc]}08` : `${SERVICE_COLORS[sc]}12`, borderLeft: idx === 0 ? '2px solid #e0e0ff' : undefined }}>
                            {cnt > 0
                              ? <span style={{ fontWeight: 700, fontSize: 12, color: SERVICE_COLORS[sc], background: `${SERVICE_COLORS[sc]}20`, borderRadius: 5, padding: '2px 7px' }}>{cnt}</span>
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
                        <span style={{ fontSize: 11, fontWeight: 600, color: SERVICE_COLORS[t.sub_category] || '#6b7280', background: (SERVICE_COLORS[t.sub_category] || '#94a3b8') + '18', borderRadius: 5, padding: '2px 7px' }}>
                          {SERVICE_SHORT[t.sub_category] || t.sub_category}
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

      {/* Settings modal */}
      {showSettings && (
        <SettingsModal
          assignees={assignees.length ? assignees : Object.keys(capSettings.people)}
          capSettings={capSettings}
          bwRates={bwRates}
          slaRules={slaRules}
          onClose={() => setShowSettings(false)}
          onSaved={(updates) => {
            if (updates.capSettings) setCapSettings(updates.capSettings)
            if (updates.bwRates)     setBwRates(updates.bwRates)
            if (updates.slaRules)    setSlaRules(updates.slaRules)
          }}
        />
      )}
    </div>
  )
}
