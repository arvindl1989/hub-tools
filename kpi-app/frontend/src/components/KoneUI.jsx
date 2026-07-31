// ── Shared KONE UI primitives ─────────────────────────────────────────────────
// Extracted verbatim from FeedbackPage so the Feedback and User Activity pages
// render from ONE definition of each token/component rather than two copies that
// can drift. Nothing here introduces a new colour, font or card style — every
// value was already in use on the Feedback page.

// KONE Information — the brand's secondary typeface, self-hosted (see index.css).
// Figures only; body/label text stays on Inter per brand rule.
export const KONE_FONT = "'KONE Information', 'Inter', sans-serif"
export const INTER = "'Inter', sans-serif"

export const cardHeadingStyle = (color) => ({
  fontSize: 13, fontWeight: 600, letterSpacing: '0.02em', color,
  textTransform: 'uppercase', fontFamily: INTER,
})

export const thStyle = {
  padding: '6px', fontSize: 10, fontWeight: 600, color: '#6e6e6e',
  textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left',
  fontFamily: INTER,
}

export const selStyle = {
  height: 30, padding: '0 8px', fontSize: 12, color: '#404040',
  border: '1px solid #e8e2d6', borderRadius: 7, outline: 'none',
  background: '#fff', cursor: 'pointer', fontFamily: INTER, maxWidth: 220,
}

// Matches the filter bar's active "All time" pill exactly, so an active filter
// echoed in the page header reads the same way as one shown in the bar.
export const activeFilterPillStyle = {
  padding: '5px 10px', fontSize: 12, fontWeight: 500, fontFamily: INTER,
  border: '1px solid #1450f5', borderRadius: 7, background: '#1450f5', color: '#fff',
}

// Averages are rounded to one decimal wherever they're displayed — done on the
// frontend so a value landing on a whole number still reads "4.0", not "4".
export const fmt1 = (v) => (v == null ? null : Number(v).toFixed(1))

// Sentiment triad — the Promoters/Passives/Detractors colours, reused for the
// User Activity lifecycle segments (Active / Regular / Dormant).
export const NPS_BUCKET_STYLES = {
  promoter:  { fg: '#0f5132', bg: '#aae1c8' },
  passive:   { fg: '#7a5400', bg: '#ffe141' },
  detractor: { fg: '#8c1a2e', bg: '#ffcdd7' },
}

// KONE Blue as a tinted accent — the pale-blue/blue pair already used by the
// Feedback Score badge and active table rows. Readable enough to host a table,
// which solid #1450f5 is not.
export const KONE_BLUE_TONE = { fg: '#1450f5', bg: '#eef3fe' }

// ── Card shell (matches the rest of the app) ──────────────────────────────────
export function Card({ title, subtitle, controls, children }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 12, border: '1px solid #e8e2d6',
      boxShadow: '0 1px 3px rgba(20,20,20,0.04), 0 4px 12px rgba(20,20,20,0.03)',
      minWidth: 0,
    }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1ede3', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ ...cardHeadingStyle('#141414'), margin: 0 }}>{title}</h3>
          {subtitle && <p style={{ fontSize: 11, color: '#9c9c9c', margin: '4px 0 0', textTransform: 'none' }}>{subtitle}</p>}
        </div>
        {controls}
      </div>
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  )
}

export function Empty({ text = 'No data for this filter' }) {
  return <div style={{ padding: 30, textAlign: 'center', color: '#9c9c9c', fontSize: 12 }}>{text}</div>
}

// ── Blue number box ───────────────────────────────────────────────────────────
// The Total Feedback / Feedback Rate / rating-parameter card, generalised.
// `suffix` renders the smaller trailing unit ("/ 5", "%") beside the figure.
export function MetricCard({ label, value, suffix, sub }) {
  return (
    <div style={{ background: '#1450f5', borderRadius: 8, padding: '18px 20px', boxShadow: '0 1px 3px rgba(20,20,20,0.06)' }}>
      <div style={cardHeadingStyle('rgba(255,255,255,0.8)')}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
        <span style={{ fontSize: 34, fontWeight: 700, color: '#fff', lineHeight: 1, letterSpacing: '-0.01em', fontFamily: KONE_FONT }}>
          {value ?? '—'}
        </span>
        {suffix && value != null && (
          <span style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.75)', fontFamily: KONE_FONT }}>{suffix}</span>
        )}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 6, fontFamily: INTER }}>{sub}</div>
      )}
    </div>
  )
}

// ── Tinted segment card ───────────────────────────────────────────────────────
// The Promoters/Passives/Detractors box, generalised: tinted throughout, label +
// figure on top, hairline, then whatever list the caller passes as children —
// one card, not two stacked.
export function SegmentCard({ label, value, sub, tone, children }) {
  return (
    <div style={{ background: tone.bg, borderRadius: 8, minWidth: 0 }}>
      <div style={{ padding: '16px 18px' }}>
        <div style={cardHeadingStyle(tone.fg)}>{label}</div>
        <div style={{ fontSize: 30, fontWeight: 700, color: tone.fg, lineHeight: 1, marginTop: 8, fontFamily: KONE_FONT }}>
          {value ?? '—'}
        </div>
        {sub && (
          <div style={{ fontSize: 11, color: tone.fg, opacity: 0.75, marginTop: 6, fontFamily: INTER }}>{sub}</div>
        )}
      </div>
      {children != null && (
        <div style={{ borderTop: '1px solid rgba(0,0,0,0.12)', padding: '14px 18px' }}>
          {children}
        </div>
      )}
    </div>
  )
}

// ── Scrollable list with a sticky header ──────────────────────────────────────
// Sits inside a SegmentCard, so it inherits the card's tint: the sticky header
// paints `tone.bg` behind itself, otherwise rows would show through as they
// scroll under it.
//
// `columns`: [{ key, label, align, render?, width? }]
// Virtualisation is deliberately not used — segments here are bounded by the
// number of distinct requesters, which stays well under the ~500-row threshold
// where windowing starts to pay for itself.
export function ScrollList({
  rows = [], columns = [], tone, maxHeight = 280, emptyText = 'No users in this segment',
}) {
  if (!rows.length) {
    return (
      <div style={{ padding: '18px 0', textAlign: 'center', fontSize: 12, color: tone.fg, opacity: 0.6, fontFamily: INTER }}>
        {emptyText}
      </div>
    )
  }
  // The header must stay FULLY opaque — `opacity` on the <th> would fade its
  // background too and let scrolled rows show through it. The muted look comes
  // from an inner span instead, so only the text is dimmed.
  const head = {
    ...thStyle, color: tone.fg,
    position: 'sticky', top: 0, zIndex: 1, background: tone.bg,
    borderBottom: '1px solid rgba(0,0,0,0.12)',
    whiteSpace: 'nowrap',
  }
  return (
    <div style={{ maxHeight, overflowY: 'auto', overflowX: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, tableLayout: 'fixed' }}>
        <thead>
          <tr>
            {columns.map(c => (
              <th key={c.key} style={{ ...head, textAlign: c.align ?? 'left', width: c.width }}>
                <span style={{ opacity: 0.75 }}>{c.label}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.user ?? i} style={{ borderBottom: '1px solid rgba(0,0,0,0.07)' }}>
              {columns.map(c => (
                <td key={c.key} style={{
                  padding: '7px 6px', textAlign: c.align ?? 'left',
                  color: tone.fg, fontFamily: INTER,
                  fontWeight: c.align === 'right' ? 600 : 500,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {c.render ? c.render(r) : (r[c.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
