// ── SLA ticket detail ──────────────────────────────────────────────────────────
// The tickets behind the SLA compliance cards: what each one's SLA date was
// (derived from working days, not calendar days), when it actually closed, and
// how long it really took.

const STATUS = {
  on_time:  { label: 'On time',  bg: '#aae1c8', fg: '#0f5132' },
  late:     { label: 'Late',     bg: '#ffcdd7', fg: '#8c1a2e' },
  breached: { label: 'Breached', bg: '#ffdee5', fg: '#8c1a2e' },
  open:     { label: 'Open',     bg: '#d2f5ff', fg: '#005f86' },
}

const fmt = (iso) => {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
}

const th = {
  padding: '8px 10px', fontSize: 10, fontWeight: 700, color: '#6e6e6e',
  textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left',
  background: '#faf8f3', borderBottom: '2px solid #e8e2d6',
  whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 1,
}
const td = { padding: '8px 10px', borderBottom: '1px solid #f3eee6', whiteSpace: 'nowrap', color: '#404040' }

export default function SlaTicketTable({ data, status, onStatus }) {
  const rows   = data?.rows ?? []
  const counts = data?.counts ?? {}

  const tabs = [
    { key: '',         label: 'All',      n: data?.total ?? 0 },
    { key: 'late',     label: 'Late',     n: counts.late     ?? 0 },
    { key: 'breached', label: 'Breached', n: counts.breached ?? 0 },
    { key: 'on_time',  label: 'On time',  n: counts.on_time  ?? 0 },
    { key: 'open',     label: 'Open',     n: counts.open     ?? 0 },
  ]

  return (
    <div>
      {/* Status filter — counts always reflect the unfiltered set, so these
          read as a breakdown of the cards above rather than of each other. */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {tabs.map(t => {
          const active = status === t.key
          const tone = STATUS[t.key]
          return (
            <button
              key={t.key || 'all'}
              onClick={() => onStatus(t.key)}
              style={{
                padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                borderRadius: 20, fontFamily: 'Inter, sans-serif',
                border: `1px solid ${active ? '#1450f5' : '#e8e2d6'}`,
                background: active ? '#1450f5' : '#fff',
                color: active ? '#fff' : '#6e6e6e',
                display: 'inline-flex', alignItems: 'center', gap: 7,
              }}
            >
              {t.key && !active && (
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: tone.fg }} />
              )}
              {t.label}
              <span style={{
                fontSize: 11, fontWeight: 700,
                color: active ? '#fff' : '#9c9c9c',
              }}>{t.n}</span>
            </button>
          )
        })}
      </div>

      {!rows.length ? (
        <div style={{ padding: 30, textAlign: 'center', color: '#9c9c9c', fontSize: 12.5 }}>
          No tickets match this filter.
        </div>
      ) : (
        <div style={{ overflowX: 'auto', maxHeight: 460, overflowY: 'auto', border: '1px solid #e8e2d6', borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                <th style={th}>Ticket</th>
                <th style={th}>Service</th>
                <th style={th}>Owner</th>
                <th style={{ ...th, textAlign: 'center' }}>Created</th>
                <th style={{ ...th, textAlign: 'center' }}>SLA Due</th>
                <th style={{ ...th, textAlign: 'center' }}>Closed</th>
                <th style={{ ...th, textAlign: 'right' }}>Target</th>
                <th style={{ ...th, textAlign: 'right' }}>Taken</th>
                <th style={{ ...th, textAlign: 'right' }}>vs SLA</th>
                <th style={{ ...th, textAlign: 'center' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const s = STATUS[r.status] ?? STATUS.open
                const v = r.variance_days
                return (
                  <tr key={`${r.ticket}-${i}`} style={{ background: i % 2 ? '#faf8f3' : '#fff' }}>
                    <td style={{ ...td, fontWeight: 600, color: '#141414' }}>
                      {r.ticket || '—'}
                      {r.description && (
                        <div style={{
                          fontSize: 11, color: '#9c9c9c', fontWeight: 400,
                          maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis',
                        }} title={r.description}>{r.description}</div>
                      )}
                    </td>
                    <td style={td}>{r.sub_category || '—'}</td>
                    <td style={td}>{r.assigned_to || '—'}</td>
                    <td style={{ ...td, textAlign: 'center' }}>{fmt(r.created_date)}</td>
                    <td style={{ ...td, textAlign: 'center', fontWeight: 600 }}>{fmt(r.sla_due_date)}</td>
                    <td style={{ ...td, textAlign: 'center' }}>{fmt(r.closed_date)}</td>
                    <td style={{ ...td, textAlign: 'right', color: '#6e6e6e' }}>
                      {r.sla_target_days != null ? `${r.sla_target_days}d` : '—'}
                    </td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>
                      {r.working_days_taken != null ? `${r.working_days_taken}d` : '—'}
                    </td>
                    <td style={{
                      ...td, textAlign: 'right', fontWeight: 700,
                      color: v == null ? '#9c9c9c' : v > 0 ? '#8c1a2e' : '#0f5132',
                    }}>
                      {v == null ? '—' : v > 0 ? `+${v}d` : `${v}d`}
                    </td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <span style={{
                        background: s.bg, color: s.fg, borderRadius: 20,
                        padding: '2px 10px', fontSize: 11, fontWeight: 700,
                      }}>{s.label}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ fontSize: 11, color: '#9c9c9c', margin: '10px 0 0' }}>
        Target and Taken are <strong>working days</strong> — weekends and public holidays excluded,
        with the creation day counting as day 1, the same rule that sets the SLA date.
        {data?.truncated && ' Showing the first 500 rows, worst breaches first.'}
      </p>
    </div>
  )
}
