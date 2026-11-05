import { useEffect, useState } from 'react'
import { getCapacityPlanCell, setCapacityManualDays } from '../api'
import { INTER, KONE_FONT } from './KoneUI'

// ── What is behind one cell, and a way to overrule it ────────────────────────
// Opened by clicking a service cell on the capacity sheet. Two jobs:
//
//   1. Show the closed tickets that landed there, and — for Adhoc above all —
//      the sub-categories and teams that got them there. That list is how the
//      next routing rule gets written: anything in Adhoc worth its own column
//      is named in it.
//   2. Let somebody type the days by hand. Adhoc is a column of work that
//      resembles itself only in not being anything else, so one rate per
//      ticket is a fiction; the figure the team already keeps is better than
//      a number the page invents.
//
// A typed figure replaces the computed one for that person, service and year,
// and nothing else. Clearing it goes back to the rate.

const BLUE = '#1450f5'
const INK = '#141414'
const DIM = '#6e6e6e'
const LINE = '#e8e2d6'
const SAND = '#faf8f3'

const head = {
  padding: '6px 10px', fontSize: 9.5, fontWeight: 600, color: DIM, textAlign: 'left',
  textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: INTER,
  borderBottom: `1px solid ${LINE}`, position: 'sticky', top: 0, background: '#fff',
}
const cell = {
  padding: '6px 10px', fontSize: 12, fontFamily: INTER, color: INK,
  borderBottom: '1px solid #f4f0e7', verticalAlign: 'top',
}

export default function CapacityCellDialog({ sessionId, year, person, service,
                                             filters = {}, range = {}, onClose, onSaved }) {
  const [d, setD] = useState(null)
  const [error, setError] = useState(null)
  const [days, setDays] = useState('')
  const [note, setNote] = useState('')
  const [goal, setGoal] = useState('')
  const [busy, setBusy] = useState(false)

  const { assignedTo, team, area, subCategory } = filters
  useEffect(() => {
    let live = true
    setD(null); setError(null)
    getCapacityPlanCell(sessionId, { year, person, service }, {
      assignedTo, team, area, subCategory, dateFrom: range.from, dateTo: range.to,
    })
      .then(r => {
        if (!live) return
        setD(r)
        setDays(r.manual == null ? '' : String(r.manual))
        setNote(r.note || '')
        setGoal(r.goal == null ? '' : String(r.goal))
      })
      .catch(e => { if (live) setError(e?.message || 'Could not open the cell.') })
    return () => { live = false }
  }, [sessionId, year, person, service, assignedTo, team, area, subCategory,
      range.from, range.to])

  const save = async (value) => {
    setBusy(true); setError(null)
    try {
      await setCapacityManualDays({
        year, person, service,
        days: value, note: value == null ? null : note,
        goal: goal === '' ? null : Number(goal), setGoal: true,
      })
      onSaved?.()
      onClose?.()
    } catch (e) {
      setError(e?.message || 'Could not save.')
      setBusy(false)
    }
  }

  const computed = d?.hours && d?.total
    ? Math.round(d.total * d.hours / 8 * 10) / 10
    : 0

  return (
    <div onClick={onClose}
         style={{ position: 'fixed', inset: 0, background: 'rgba(20,20,20,0.34)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  zIndex: 60, padding: 24 }}>
      <div onClick={e => e.stopPropagation()}
           style={{ background: '#fff', borderRadius: 14, width: 'min(860px, 100%)',
                    maxHeight: '86vh', display: 'flex', flexDirection: 'column',
                    boxShadow: '0 18px 48px rgba(20,20,20,0.22)' }}>

        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${LINE}`,
                      display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 700, fontFamily: INTER, color: INK }}>
            {service} — {person}
          </div>
          <div style={{ fontSize: 11.5, color: DIM, fontFamily: INTER, flex: 1 }}>
            {d ? `${d.total.toLocaleString()} closed in ${year}` : 'Opening…'}
            {d?.hours ? ` · ${d.hours}h each · ${computed} days at the rate`
              : d ? ' · no hours set for this service' : ''}
          </div>
          <button onClick={onClose}
                  style={{ background: 'none', border: 'none', fontSize: 20, color: DIM,
                           cursor: 'pointer', lineHeight: 1 }} aria-label="Close">×</button>
        </div>

        {/* Set it by hand */}
        <div style={{ padding: '12px 20px', background: SAND,
                      borderBottom: `1px solid ${LINE}`, display: 'flex',
                      alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontFamily: INTER, color: INK }}>Set days by hand</span>
          <input type="number" step="0.5" min="0" value={days}
                 placeholder={String(computed)}
                 onChange={e => setDays(e.target.value)}
                 style={{ width: 90, padding: '6px 8px', fontSize: 13, fontFamily: KONE_FONT,
                          border: `1px solid ${LINE}`, borderRadius: 6, textAlign: 'right' }} />
          <button onClick={() => save(days === '' ? null : Number(days))} disabled={busy}
                  style={{ background: BLUE, color: '#fff', border: 'none', borderRadius: 7,
                           padding: '7px 16px', fontSize: 12.5, fontWeight: 600,
                           fontFamily: INTER, cursor: 'pointer' }}>
            {busy ? 'Saving…' : 'Save'}
          </button>
          {d?.manual != null && (
            <button onClick={() => save(null)} disabled={busy}
                    style={{ background: '#fff', color: INK, border: `1px solid ${LINE}`,
                             borderRadius: 7, padding: '7px 14px', fontSize: 12.5,
                             fontFamily: INTER, cursor: 'pointer' }}>
              Back to the rate
            </button>
          )}
          <span style={{ fontSize: 11, color: DIM, fontFamily: INTER }}>
            {d?.manual != null
              ? `Currently set by hand to ${d.manual}. Empty the box and save to undo.`
              : 'Replaces the computed figure for this person, service and year only.'}
          </span>
          {/* A figure typed over a calculation is an assertion, and in six
              months nobody remembers whose it was or what it rested on. */}
          <input type="text" value={note} maxLength={400}
                 placeholder="Note — why this figure (optional)"
                 onChange={e => setNote(e.target.value)}
                 style={{ flexBasis: '100%', padding: '7px 10px', fontSize: 12.5,
                          fontFamily: INTER, border: `1px solid ${LINE}`,
                          borderRadius: 6, color: INK }} />
          {/* The Goal column on the service board. A plan the team sets, not
              a projection: nothing in the tickets implies it. */}
          <span style={{ fontSize: 12, fontFamily: INTER, color: INK }}>
            Goal for {year}
          </span>
          <input type="number" step="1" min="0" value={goal}
                 placeholder={d?.projected == null ? '—' : String(d.projected)}
                 onChange={e => setGoal(e.target.value)}
                 style={{ width: 90, padding: '6px 8px', fontSize: 13, fontFamily: KONE_FONT,
                          border: `1px solid ${LINE}`, borderRadius: 6, textAlign: 'right' }} />
          <span style={{ fontSize: 11, color: DIM, fontFamily: INTER }}>
            tickets anticipated by the end of the year
            {d?.projected != null && ` — at this rate it lands near ${d.projected}`}
            . Save writes this too.
          </span>
        </div>

        {error && (
          <div style={{ padding: '10px 20px', color: '#c0305a', fontSize: 12,
                        fontFamily: INTER }}>{error}</div>
        )}

        <div style={{ overflow: 'auto', padding: '4px 20px 18px' }}>
          {!d ? (
            <div style={{ padding: 20, color: DIM, fontSize: 12.5,
                          fontFamily: INTER }}>Opening…</div>
          ) : !d.total ? (
            <div style={{ padding: 20, color: DIM, fontSize: 12.5, fontFamily: INTER }}>
              Nothing closed here in {year}.
            </div>
          ) : (
            <>
              {/* What got these tickets here — the list that writes the next rule */}
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', margin: '14px 0 6px' }}>
                {[['Sub-categories', d.sub_categories], ['Teams', d.teams]].map(([label, xs]) => (
                  <div key={label} style={{ minWidth: 220 }}>
                    <div style={{ fontSize: 9.5, fontWeight: 600, color: DIM,
                                  textTransform: 'uppercase', letterSpacing: '0.05em',
                                  fontFamily: INTER, marginBottom: 5 }}>{label}</div>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {xs.slice(0, 14).map(x => (
                        <span key={x.name}
                              style={{ fontSize: 11.5, fontFamily: INTER, color: INK,
                                       background: '#f2f5fe', border: '1px solid #e1e9fd',
                                       borderRadius: 999, padding: '3px 9px' }}>
                          {x.name} <b style={{ color: BLUE }}>{x.count}</b>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12 }}>
                <thead>
                  <tr>
                    <th style={head}>Ticket</th>
                    <th style={head}>Summary</th>
                    <th style={head}>Sub-category</th>
                    <th style={head}>Team</th>
                    <th style={head}>Closed</th>
                  </tr>
                </thead>
                <tbody>
                  {d.rows.map((r, i) => (
                    <tr key={`${r.number}-${i}`}
                        style={{ background: i % 2 ? SAND : '#fff' }}>
                      <td style={{ ...cell, fontFamily: KONE_FONT, whiteSpace: 'nowrap' }}>
                        {r.number || '—'}
                      </td>
                      <td style={{ ...cell, maxWidth: 300 }}>{r.summary || '—'}</td>
                      <td style={{ ...cell, color: DIM }}>{r.sub_category || '—'}</td>
                      <td style={{ ...cell, color: DIM }}>{r.team || '—'}</td>
                      <td style={{ ...cell, color: DIM, whiteSpace: 'nowrap' }}>
                        {r.closed || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {d.total > d.rows.length && (
                <div style={{ padding: '10px 2px', fontSize: 11, color: DIM,
                              fontFamily: INTER }}>
                  Showing the {d.rows.length} most recently closed of {d.total}.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
