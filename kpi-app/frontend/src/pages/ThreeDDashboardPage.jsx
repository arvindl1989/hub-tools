import { useEffect, useMemo, useState } from 'react'
import { getKpi3d } from '../api'
import VolumeField from '../components/VolumeField'
import { INTER, KONE_FONT } from '../components/KoneUI'

// ── A board for a room, not a desk ───────────────────────────────────────────
// This is the one page meant to be read from the far side of a meeting room:
// dark ground, four figures large enough to carry, and the year's shape turning
// slowly in the middle of it. Everything on it comes from the same upload every
// other tab uses — there is no second source of truth here, only a second way
// of looking.

const BLUE = '#1450f5'
const SAND = '#F3EEE6'
const DIM = '#9c9c9c'

const MONTH_CHOICES = [6, 12, 18]

function Figure({ label, value, suffix, tone = '#ffffff', note }) {
  return (
    <div style={{
      flex: 1, minWidth: 0, background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10,
      padding: '16px 20px',
    }}>
      <div style={{
        fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', color: DIM,
        textTransform: 'uppercase', fontFamily: INTER,
      }}>{label}</div>
      <div style={{
        fontFamily: KONE_FONT, fontSize: 44, fontWeight: 700, color: tone,
        lineHeight: 1.1, marginTop: 6, letterSpacing: '-0.02em',
      }}>
        {value}
        {suffix && (
          <span style={{ fontSize: 18, fontWeight: 600, color: DIM, marginLeft: 8 }}>
            {suffix}
          </span>
        )}
      </div>
      {note && (
        <div style={{ fontSize: 12, color: DIM, marginTop: 6, fontFamily: INTER }}>{note}</div>
      )}
    </div>
  )
}


// ── Raised against closed, flat ──────────────────────────────────────────────
// This was a row inside the 3D field and it did not belong there: a month's
// closures are a different total from one area's raises, so the sand bar stood
// three times the height of anything around it and invited a comparison that
// is not one. Here the two sit on the same scale as each other, and nothing
// else, which is the only way the gap between them means anything.
function TrendStrip({ trend = [] }) {
  const peak = Math.max(1, ...trend.map(t => Math.max(t.raised, t.closed)))
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 86 }}>
      {trend.map(t => (
        <div key={t.key} style={{ flex: 1, minWidth: 0, textAlign: 'center' }}
             title={`${t.label}: ${t.raised} raised, ${t.closed} closed`}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                        gap: 3, height: 58 }}>
            <div style={{ width: '42%', maxWidth: 16, background: BLUE,
                          height: `${(t.raised / peak) * 100}%`, borderRadius: '2px 2px 0 0',
                          minHeight: t.raised ? 2 : 0 }} />
            <div style={{ width: '42%', maxWidth: 16, background: SAND,
                          height: `${(t.closed / peak) * 100}%`, borderRadius: '2px 2px 0 0',
                          minHeight: t.closed ? 2 : 0 }} />
          </div>
          <div style={{ fontSize: 10, color: DIM, fontFamily: INTER, marginTop: 6,
                        whiteSpace: 'nowrap' }}>{t.label}</div>
        </div>
      ))}
    </div>
  )
}

export default function ThreeDDashboardPage({ sessionId, onSessionExpired }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [months, setMonths] = useState(12)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (!sessionId) return
    let live = true
    setData(null)
    setError(null)
    getKpi3d(sessionId, months)
      .then(d => { if (live) setData(d) })
      .catch(e => {
        if (e?.sessionExpired) return onSessionExpired?.()
        if (live) setError(e?.message || 'Could not load the figures.')
      })
    return () => { live = false }
  }, [sessionId, months, onSessionExpired])

  const h = data?.headline ?? {}
  const net = useMemo(() => (h.closed ?? 0) - (h.requests ?? 0), [h])
  const span = useMemo(() => {
    const first = data?.months?.[0]
    const last = data?.months?.[(data?.months?.length ?? 1) - 1]
    if (!first || !last) return ''
    return `${first.label} ${first.year} — ${last.label} ${last.year}`
  }, [data])

  const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString())

  return (
    <div style={{
      background: '#101010', borderRadius: 12, overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
      border: '1px solid #1f1f1f',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        gap: 20, padding: '22px 26px 0', flexWrap: 'wrap',
      }}>
        <div>
          <div style={{
            fontFamily: KONE_FONT, fontSize: 26, fontWeight: 700, color: '#fff',
            letterSpacing: '-0.01em',
          }}>
            Digital Marketing Hub — Request Volume
          </div>
          <div style={{ fontSize: 13, color: DIM, marginTop: 6, fontFamily: INTER }}>
            {span}
            {h.period_end && <span> · newest request {h.period_end}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {MONTH_CHOICES.map(m => (
            <button
              key={m}
              onClick={() => setMonths(m)}
              style={{
                background: m === months ? BLUE : 'transparent',
                color: m === months ? '#fff' : DIM,
                border: `1px solid ${m === months ? BLUE : 'rgba(255,255,255,0.15)'}`,
                borderRadius: 7, padding: '7px 14px', fontSize: 12, fontWeight: 700,
                fontFamily: INTER, cursor: 'pointer',
              }}
            >{m} months</button>
          ))}
          <button
            onClick={() => setPaused(p => !p)}
            title="The field turns on its own; hovering a bar holds it still"
            style={{
              background: 'transparent', color: DIM,
              border: '1px solid rgba(255,255,255,0.15)', borderRadius: 7,
              padding: '7px 14px', fontSize: 12, fontWeight: 700, fontFamily: INTER,
              cursor: 'pointer', marginLeft: 6,
            }}
          >{paused ? 'Rotate' : 'Hold'}</button>
        </div>
      </div>

      {/* The four figures the room is meant to read */}
      <div style={{ display: 'flex', gap: 12, padding: '18px 26px 0', flexWrap: 'wrap' }}>
        <Figure label="Requests raised" value={fmt(h.requests)}
                note={`${fmt(h.users)} people`} />
        <Figure label="Closed" value={fmt(h.closed)} tone={SAND}
                note="In the same window" />
        <Figure
          label={net >= 0 ? 'Backlog drained by' : 'Backlog grew by'}
          value={fmt(Math.abs(net))}
          tone={net >= 0 ? '#5fd0a0' : '#ff8aa4'}
          note="Closed less raised" />
        <Figure label="Open now" value={fmt(h.open)}
                note={h.median_open_age != null
                  ? `Median age ${fmt(h.median_open_age)} days`
                  : 'Nothing open'} />
      </div>

      {/* The field */}
      {/* An explicit height, not flex: the canvas sizes itself to its parent,
          and a flex child whose height comes from its siblings collapsed to
          150px here — a field nobody could see. */}
      <div style={{
        height: 'clamp(380px, 48vh, 600px)', margin: '14px 10px 0', position: 'relative',
      }}>
        {error && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: '#ff8aa4', fontFamily: INTER, fontSize: 14,
          }}>{error}</div>
        )}
        {!error && !data && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: DIM, fontFamily: INTER, fontSize: 14,
          }}>Building the field…</div>
        )}
        {!error && data && <VolumeField data={data} paused={paused} />}
      </div>

      {/* Inflow against outflow, month by month */}
      <div style={{ padding: '6px 26px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8 }}>
          <span style={{ fontSize: 11, color: DIM, fontFamily: INTER, letterSpacing: '0.05em' }}>
            RAISED vs CLOSED
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 14, height: 9, borderRadius: 2, background: BLUE }} />
            <span style={{ fontSize: 11, color: DIM, fontFamily: INTER }}>raised</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 14, height: 9, borderRadius: 2, background: SAND }} />
            <span style={{ fontSize: 11, color: DIM, fontFamily: INTER }}>closed</span>
          </span>
        </div>
        <TrendStrip trend={data?.trend ?? []} />
      </div>

      {/* Legend and the service split */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 24, padding: '10px 26px 22px', flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: DIM, fontFamily: INTER, letterSpacing: '0.05em' }}>
            HEIGHT = REQUESTS
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {['#d0dcfd', '#a1b9fb', '#7296f9', '#4373f7', '#1450f5'].map(c => (
              <span key={c} style={{ width: 22, height: 9, borderRadius: 2, background: c }} />
            ))}
            <span style={{ fontSize: 11, color: DIM, fontFamily: INTER, marginLeft: 4 }}>
              by area
            </span>
          </span>
          <span style={{ fontSize: 11, color: '#6e6e6e', fontFamily: INTER }}>
            Drag to turn · hover a bar for its number
          </span>
        </div>

        <div style={{ display: 'flex', gap: 22 }}>
          {(data?.services ?? []).map(s => (
            <div key={s.service} title={s.service}>
              <div style={{ fontSize: 11, color: DIM, fontFamily: INTER, letterSpacing: '0.05em' }}>
                {s.short}
              </div>
              <div style={{
                fontFamily: KONE_FONT, fontSize: 22, fontWeight: 700, color: '#fff',
                marginTop: 2,
              }}>{fmt(s.count)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
