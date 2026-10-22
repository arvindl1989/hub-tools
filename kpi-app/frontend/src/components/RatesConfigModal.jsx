import { useEffect, useMemo, useState } from 'react'
import {
  getBandwidthRates, getSlaRules, getUtilisationSettings,
  updateBandwidthRates, updateSlaRules, updateUtilisationSettings,
} from '../api'
import { INTER, KONE, KONE_INFO } from '../kone/worldConfig'

// ── Everything the figures are measured against, in one place ────────────────
// Four stores sat behind the numbers and only one of them was editable, so a
// change of cost or a new joiner's working days meant a code change. They are
// all here now: what a ticket costs, what it is promised in, how many days
// each person actually had, and what share of a day counts as productive.
//
// Nothing here is derived. Every field is a figure somebody agreed, and the
// page says which figure it used wherever it uses one.

const TABS = [
  { id: 'hours', label: 'Hours per ticket' },
  { id: 'sla', label: 'SLA' },
  { id: 'days', label: 'Working days' },
]

const box = {
  width: 86, padding: '6px 9px', fontSize: 13, fontFamily: KONE_INFO,
  border: `1px solid ${KONE.hairline}`, borderRadius: 6, textAlign: 'right',
  color: KONE.black, background: KONE.white,
}

function Row({ label, sub, children }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 14, padding: '9px 0', borderBottom: `1px solid ${KONE.hairline}`,
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: INTER, fontSize: 13, color: KONE.black }}>{label}</div>
        {sub && (
          <div style={{ fontFamily: INTER, fontSize: 11, color: KONE.black60, marginTop: 2 }}>
            {sub}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>{children}</div>
    </div>
  )
}

export default function RatesConfigModal({ onClose }) {
  const [tab, setTab] = useState('hours')
  const [rates, setRates] = useState(null)        // tickets per day, the base store
  const [sla, setSla] = useState(null)
  const [util, setUtil] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([getBandwidthRates(), getSlaRules(), getUtilisationSettings()])
      .then(([r, s, u]) => { setRates(r); setSla(s); setUtil(u) })
      .catch(e => setError(e?.message || 'Could not load the settings.'))
  }, [])

  const hoursPerDay = util?.hours_per_day ?? 8
  const years = useMemo(() => {
    const set = new Set([
      ...Object.keys(util?.working_days ?? {}),
      ...Object.keys(util?.hours_per_ticket_by_year ?? {}),
    ])
    return [...set].sort()
  }, [util])

  const people = useMemo(() => {
    const set = new Set()
    for (const y of Object.keys(util?.working_days ?? {})) {
      for (const n of Object.keys(util.working_days[y])) set.add(n)
    }
    return [...set].sort()
  }, [util])

  // Hours are stored as tickets per day; the panel speaks hours because that
  // is what everybody quotes. One conversion, in one direction, here.
  const setBaseHours = (service, hours) => {
    const h = parseFloat(hours)
    setRates(r => ({ ...r, [service]: h > 0 ? +(hoursPerDay / h).toFixed(4) : r[service] }))
  }
  const baseHoursOf = (service) => (rates?.[service]
    ? +(hoursPerDay / rates[service]).toFixed(2) : '')

  const setYearHours = (year, service, hours) => {
    const h = parseFloat(hours)
    setUtil(u => {
      const by = { ...(u.hours_per_ticket_by_year ?? {}) }
      const forYear = { ...(by[year] ?? {}) }
      if (Number.isFinite(h) && h > 0) forYear[service] = h
      else delete forYear[service]
      by[year] = forYear
      return { ...u, hours_per_ticket_by_year: by }
    })
  }

  const setDays = (year, person, days) => {
    const d = parseInt(days, 10)
    setUtil(u => {
      const wd = { ...(u.working_days ?? {}) }
      const forYear = { ...(wd[year] ?? {}) }
      if (Number.isFinite(d) && d > 0) forYear[person] = d
      else delete forYear[person]
      wd[year] = forYear
      return { ...u, working_days: wd }
    })
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      await Promise.all([
        updateBandwidthRates(rates),
        updateSlaRules(sla),
        updateUtilisationSettings({
          productivity_pct: util.productivity_pct,
          hours_per_ticket_by_year: util.hours_per_ticket_by_year,
          working_days: util.working_days,
        }),
      ])
      setSaved(true)
      setTimeout(() => setSaved(false), 2200)
    } catch (e) {
      setError(e?.message || 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  const ready = rates && sla && util
  const productive = ready
    ? +(hoursPerDay * (util.productivity_pct ?? 75) / 100).toFixed(2) : null

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(20,20,20,0.35)', zIndex: 60,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: KONE.white, border: `1px solid ${KONE.hairline}`, borderRadius: 8,
          width: 'min(680px, 100%)', maxHeight: '86vh', display: 'flex',
          flexDirection: 'column', overflow: 'hidden',
        }}
      >
        <div style={{ padding: '20px 24px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontFamily: INTER, fontSize: 19, color: KONE.black }}>
              Rates, SLA and capacity
            </div>
            <button onClick={onClose} aria-label="Close"
                    style={{ border: 'none', background: 'none', fontSize: 20,
                             color: KONE.black60, cursor: 'pointer' }}>×</button>
          </div>
          <div style={{ fontFamily: INTER, fontSize: 12, color: KONE.black60, marginTop: 4 }}>
            What every figure on the dashboard is measured against. Saved for everyone.
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  background: tab === t.id ? KONE.blue : KONE.white,
                  color: tab === t.id ? KONE.white : KONE.black,
                  border: `1px solid ${tab === t.id ? KONE.blue : KONE.hairline}`,
                  borderRadius: 7, padding: '7px 14px', fontSize: 12, fontFamily: INTER,
                  cursor: 'pointer',
                }}
              >{t.label}</button>
            ))}
          </div>
        </div>

        <div style={{ padding: '10px 24px 0', overflowY: 'auto', flex: 1 }}>
          {error && (
            <div style={{ fontFamily: INTER, fontSize: 13, color: KONE.red, padding: '10px 0' }}>
              {error}
            </div>
          )}
          {!ready && !error && (
            <div style={{ fontFamily: INTER, fontSize: 13, color: KONE.black60,
                          padding: '20px 0' }}>Loading…</div>
          )}

          {ready && tab === 'hours' && (
            <>
              <div style={{ fontFamily: INTER, fontSize: 12, color: KONE.black60,
                            padding: '6px 0 10px', lineHeight: 1.6 }}>
                What one ticket of each service is taken to cost. The year columns hold
                only what changed — a blank year falls back to the base figure, so a
                service whose cost has not moved is still defined once.
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8,
                            paddingBottom: 6 }}>
                <span style={{ width: 86, textAlign: 'right', fontFamily: KONE_INFO,
                               fontSize: 10, color: KONE.black60,
                               letterSpacing: '0.05em' }}>BASE</span>
                {years.map(y => (
                  <span key={y} style={{ width: 86, textAlign: 'right', fontFamily: KONE_INFO,
                                         fontSize: 10, color: KONE.black60,
                                         letterSpacing: '0.05em' }}>{y}</span>
                ))}
              </div>
              {Object.keys(rates).map(service => (
                <Row key={service} label={service} sub="hours per ticket">
                  <input style={box} type="number" step="0.01" min="0"
                         value={baseHoursOf(service)}
                         onChange={e => setBaseHours(service, e.target.value)} />
                  {years.map(y => (
                    <input key={y} style={box} type="number" step="0.01" min="0"
                           placeholder="—"
                           value={util.hours_per_ticket_by_year?.[y]?.[service] ?? ''}
                           onChange={e => setYearHours(y, service, e.target.value)} />
                  ))}
                </Row>
              ))}
            </>
          )}

          {ready && tab === 'sla' && (
            <>
              <div style={{ fontFamily: INTER, fontSize: 12, color: KONE.black60,
                            padding: '6px 0 10px', lineHeight: 1.6 }}>
                Working days each service is promised in. Weekends and the public
                holidays in the calendar are already excluded when a ticket is judged.
              </div>
              {Object.keys(sla).map(service => (
                <Row key={service} label={service} sub="working days">
                  <input style={box} type="number" min="0" value={sla[service] ?? ''}
                         onChange={e => setSla(s => ({
                           ...s, [service]: parseInt(e.target.value, 10) || 0 }))} />
                </Row>
              ))}
            </>
          )}

          {ready && tab === 'days' && (
            <>
              <div style={{ fontFamily: INTER, fontSize: 12, color: KONE.black60,
                            padding: '6px 0 10px', lineHeight: 1.6 }}>
                The working days each person actually had, per year — a joiner, a leaver
                and a full year are three different denominators. A window shorter than a
                year takes its share of these. Someone with no figure for a year shows a
                dash on By Specialist rather than a percentage over a guessed denominator.
              </div>
              <Row label="Productive share of a day"
                   sub={`${productive} hours of a ${hoursPerDay}-hour day`}>
                <input style={box} type="number" min="1" max="100"
                       value={util.productivity_pct ?? 75}
                       onChange={e => setUtil(u => ({
                         ...u, productivity_pct: parseInt(e.target.value, 10) || 0 }))} />
              </Row>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8,
                            padding: '10px 0 6px' }}>
                {years.map(y => (
                  <span key={y} style={{ width: 86, textAlign: 'right', fontFamily: KONE_INFO,
                                         fontSize: 10, color: KONE.black60,
                                         letterSpacing: '0.05em' }}>{y}</span>
                ))}
              </div>
              {people.map(person => (
                <Row key={person} label={person} sub="working days available">
                  {years.map(y => (
                    <input key={y} style={box} type="number" min="0" placeholder="—"
                           value={util.working_days?.[y]?.[person] ?? ''}
                           onChange={e => setDays(y, person, e.target.value)} />
                  ))}
                </Row>
              ))}
            </>
          )}
        </div>

        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
          padding: '14px 24px', borderTop: `1px solid ${KONE.hairline}`,
        }}>
          <span style={{ fontFamily: INTER, fontSize: 12,
                         color: saved ? KONE.green : KONE.black60 }}>
            {saved ? 'Saved — reload the page to see it in the figures.' : ''}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose}
                    style={{ background: KONE.white, color: KONE.black,
                             border: `1px solid ${KONE.hairline}`, borderRadius: 7,
                             padding: '8px 16px', fontSize: 13, fontFamily: INTER,
                             cursor: 'pointer' }}>Close</button>
            <button onClick={save} disabled={!ready || saving}
                    style={{ background: KONE.blue, color: KONE.white, border: 'none',
                             borderRadius: 7, padding: '8px 18px', fontSize: 13,
                             fontFamily: INTER, cursor: ready ? 'pointer' : 'default',
                             opacity: ready ? 1 : 0.5 }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
