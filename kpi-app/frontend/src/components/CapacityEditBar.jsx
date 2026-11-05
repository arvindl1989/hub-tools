import { useEffect, useState } from 'react'
import { getCapacityPlanSettings, updateCapacityPlanSettings } from '../api'
import { INTER, KONE_FONT } from './KoneUI'

// ── One bar, everything the page lets you change ─────────────────────────────
// Working days and holidays per person; the cadence and training shares for
// everyone, with a per-person training figure for the people those shares do
// not describe; the goal and this year's hours per service. Per year, because
// none of it carries from one year to the next.
//
// Working days is labelled gross on purpose. It was being filled in with the
// net productive figure, which this page then deducted holidays, cadence and
// training from a second time — and a rate reading 163% looks like a busy
// quarter rather than a double subtraction.

const BLUE = '#1450f5'
const DIM = '#6e6e6e'
const LINE = '#e8e2d6'

const box = {
  width: 72, padding: '5px 7px', fontSize: 12.5, fontFamily: KONE_FONT,
  border: `1px solid ${LINE}`, borderRadius: 6, textAlign: 'right', color: '#141414',
}
const head = {
  fontSize: 10, fontWeight: 600, color: DIM, textTransform: 'uppercase',
  letterSpacing: '0.04em', fontFamily: INTER, textAlign: 'right', padding: '0 7px 5px',
}
const cell = { padding: '3px 7px', textAlign: 'right' }

export default function CapacityEditBar({ year, onSaved }) {
  const [open, setOpen] = useState(false)
  const [s, setS] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open) return
    setS(null); setError(null)
    getCapacityPlanSettings(year).then(setS)
      .catch(e => setError(e?.message || 'Could not load the settings.'))
  }, [open, year])

  const put = (group, key, value) =>
    setS(prev => ({ ...prev, [group]: { ...prev[group], [key]: value } }))

  const save = async () => {
    setSaving(true); setError(null)
    try {
      await updateCapacityPlanSettings({
        year,
        cadence_pct: Number(s.cadence_pct) || 0,
        training_pct: Number(s.training_pct) || 0,
        hours: numeric(s.hours),
        goal_hours: numeric(s.goal_hours),
        working_days: numeric(s.working_days),
        holidays: numeric(s.holidays),
        training_days: numeric(s.training_days),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2200)
      onSaved?.()
    } catch (e) {
      setError(e?.message || 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  // What the training share works out to for this person, from the figures
  // in the form rather than the ones last saved, so the hint moves as the
  // working days and holidays beside it are typed.
  const shareDays = (name) => {
    const avail = Math.max(0, (Number(s.working_days?.[name]) || 0)
                              - (Number(s.holidays?.[name]) || 0))
    return String(Math.round(avail * (Number(s.training_pct) || 0) / 100 * 10) / 10)
  }

  const numeric = (o) => Object.fromEntries(
    Object.entries(o || {}).filter(([, v]) => v !== '' && v != null)
      .map(([k, v]) => [k, Number(v)]))

  return (
    <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                    flexWrap: 'wrap' }}>
        <button onClick={() => setOpen(o => !o)}
                style={{ background: open ? BLUE : '#fff', color: open ? '#fff' : BLUE,
                         border: `1px solid ${open ? BLUE : '#dbe6fd'}`, borderRadius: 7,
                         padding: '6px 14px', fontSize: 12, fontWeight: 700,
                         fontFamily: INTER, cursor: 'pointer' }}>
          {open ? 'Close editor' : `Edit ${year} figures`}
        </button>
        <span style={{ fontSize: 11, color: DIM, fontFamily: INTER }}>
          Working days, holidays, the cadence and training shares and the hours per
          ticket — everything on this page that is not calculated
        </span>
        {saved && <span style={{ fontSize: 11, color: '#1e8a5e', fontFamily: INTER }}>
          Saved
        </span>}
      </div>

      {open && (
        <div style={{ borderTop: `1px solid ${LINE}`, padding: '14px 16px' }}>
          {error && <div style={{ color: '#c0305a', fontSize: 12, fontFamily: INTER,
                                  marginBottom: 10 }}>{error}</div>}
          {!s ? (
            <div style={{ color: DIM, fontSize: 12, fontFamily: INTER }}>Loading…</div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10,
                            marginBottom: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, fontFamily: INTER, color: '#141414' }}>
                  Cadence
                </span>
                <input style={{ ...box, width: 60 }} type="number" min="0" max="100"
                       value={s.cadence_pct ?? ''}
                       onChange={e => setS({ ...s, cadence_pct: e.target.value })} />
                <span style={{ fontSize: 11, color: DIM, fontFamily: INTER,
                               marginRight: 14 }}>
                  % of availability, for everyone in {year}
                </span>
                <span style={{ fontSize: 12, fontFamily: INTER, color: '#141414' }}>
                  Training &amp; workshops
                </span>
                <input style={{ ...box, width: 60 }} type="number" min="0" max="100"
                       value={s.training_pct ?? ''}
                       onChange={e => setS({ ...s, training_pct: e.target.value })} />
                <span style={{ fontSize: 11, color: DIM, fontFamily: INTER }}>
                  % — the starting point, overridden per person below
                </span>
              </div>

              <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, fontFamily: INTER,
                                color: '#141414', marginBottom: 6 }}>Per person</div>
                  <table style={{ borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ ...head, textAlign: 'left' }}>Name</th>
                        <th style={head} title="Before holidays are taken off">
                          Working days (gross)
                        </th>
                        <th style={head}>Holidays</th>
                        <th style={head} title={`Blank takes the ${s.training_pct || 0}% share`}>
                          Training
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.people.map(name => (
                        <tr key={name}>
                          <td style={{ ...cell, textAlign: 'left', fontSize: 12.5,
                                       fontFamily: INTER, whiteSpace: 'nowrap' }}>{name}</td>
                          <td style={cell}>
                            <input style={box} type="number" min="0" placeholder="—"
                                   value={s.working_days?.[name] ?? ''}
                                   onChange={e => put('working_days', name, e.target.value)} />
                          </td>
                          <td style={cell}>
                            <input style={box} type="number" min="0" placeholder="—"
                                   value={s.holidays?.[name] ?? ''}
                                   onChange={e => put('holidays', name, e.target.value)} />
                          </td>
                          {/* Placeholder, not value: an empty box means "use the
                              share", and showing the share's own number greyed
                              out says what will happen without pretending it was
                              typed. Clearing a box hands the person back to it. */}
                          <td style={cell}>
                            <input style={box} type="number" min="0"
                                   placeholder={shareDays(name)}
                                   title={`${s.training_pct || 0}% of availability `
                                          + `is ${shareDays(name)} days — type a figure `
                                          + 'here to override it'}
                                   value={s.training_days?.[name] ?? ''}
                                   onChange={e => put('training_days', name, e.target.value)} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, fontFamily: INTER,
                                color: '#141414', marginBottom: 6 }}>
                    Per service — hours a ticket is reckoned to take
                  </div>
                  <table style={{ borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ ...head, textAlign: 'left' }}>Service</th>
                        <th style={head} title="The target, used for Goal capacity">Goal</th>
                        <th style={head} title={`What ${year} is costed at`}>{year}</th>
                        <th style={{ ...head, textAlign: 'left' }}>Per day</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.services.map(svc => {
                        const h = Number(s.hours?.[svc.short])
                        return (
                          <tr key={svc.short}>
                            <td style={{ ...cell, textAlign: 'left', fontSize: 12.5,
                                         fontFamily: INTER, whiteSpace: 'nowrap' }}
                                title={svc.subs.length
                                  ? svc.subs.join(', ')
                                  : 'No ServiceNow sub-category mapped yet'}>
                              {svc.short}
                              {!svc.subs.length && (
                                <span style={{ color: '#b87d00', marginLeft: 6,
                                               fontSize: 10 }}>unmapped</span>
                              )}
                            </td>
                            <td style={cell}>
                              <input style={box} type="number" step="0.1" min="0"
                                     placeholder="—"
                                     value={s.goal_hours?.[svc.short] ?? ''}
                                     onChange={e => put('goal_hours', svc.short, e.target.value)} />
                            </td>
                            <td style={cell}>
                              <input style={box} type="number" step="0.1" min="0"
                                     placeholder="—"
                                     value={s.hours?.[svc.short] ?? ''}
                                     onChange={e => put('hours', svc.short, e.target.value)} />
                            </td>
                            <td style={{ ...cell, textAlign: 'left', fontSize: 11,
                                         color: DIM, fontFamily: INTER }}>
                              {h ? `${(s.hours_per_day / h).toFixed(2)} / day` : ''}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button onClick={save} disabled={saving}
                        style={{ background: BLUE, color: '#fff', border: 'none',
                                 borderRadius: 7, padding: '8px 18px', fontSize: 13,
                                 fontFamily: INTER, cursor: 'pointer' }}>
                  {saving ? 'Saving…' : `Save ${year}`}
                </button>
                <button onClick={() => setOpen(false)}
                        style={{ background: '#fff', color: '#141414',
                                 border: `1px solid ${LINE}`, borderRadius: 7,
                                 padding: '8px 16px', fontSize: 13, fontFamily: INTER,
                                 cursor: 'pointer' }}>Close</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
