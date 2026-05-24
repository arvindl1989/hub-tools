export default function TeamPerformanceTable({ data = [] }) {
  if (!data.length) return <Empty />

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr style={{ borderBottom: '2px solid #ede8e0' }}>
            {['Team Member', 'Active', 'Overdue', 'Critical+', 'SLA Compliance', 'Avg Resolution', 'Total Closed'].map((h) => (
              <th key={h} className="text-left px-4 py-3 whitespace-nowrap" style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((r, idx) => (
            <tr key={r.assigned_to} style={{ borderBottom: '1px solid #f0ece4', backgroundColor: idx % 2 === 0 ? '#ffffff' : '#faf8f5' }}>
              <td className="px-4 py-3.5 font-semibold" style={{ color: '#141414' }}>{r.assigned_to}</td>

              {/* Active */}
              <td className="px-4 py-3.5">
                <span style={{ fontWeight: 700, fontSize: 15, color: r.active > 15 ? '#b87d00' : '#374151' }}>
                  {r.active}
                </span>
              </td>

              {/* Overdue */}
              <td className="px-4 py-3.5">
                {r.overdue > 0 ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700, backgroundColor: '#ffcdd7', color: '#141414' }}>
                    ● {r.overdue}
                  </span>
                ) : (
                  <span style={{ color: '#1e8a5e', fontSize: 12, fontWeight: 600 }}>✓ Clear</span>
                )}
              </td>

              {/* Critical */}
              <td className="px-4 py-3.5">
                {r.critical > 0 ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700, backgroundColor: '#ffe141', color: '#141414' }}>
                    {r.critical}
                  </span>
                ) : (
                  <span style={{ color: '#d1d5db', fontSize: 12 }}>—</span>
                )}
              </td>

              {/* SLA Compliance bar */}
              <td className="px-4 py-3.5" style={{ minWidth: 160 }}>
                {r.sla_compliance_pct != null ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, height: 6, background: '#ede8e0', borderRadius: 99, overflow: 'hidden' }}>
                      <div
                        style={{
                          height: 6,
                          borderRadius: 99,
                          width: `${r.sla_compliance_pct}%`,
                          backgroundColor: r.sla_compliance_pct >= 80 ? '#1e8a5e'
                            : r.sla_compliance_pct >= 60 ? '#b87d00'
                            : '#c0305a',
                          transition: 'width 0.4s ease',
                        }}
                      />
                    </div>
                    <span style={{
                      fontSize: 12, fontWeight: 700, width: 36, textAlign: 'right',
                      color: r.sla_compliance_pct >= 80 ? '#1e8a5e'
                        : r.sla_compliance_pct >= 60 ? '#b87d00'
                        : '#c0305a',
                    }}>
                      {r.sla_compliance_pct}%
                    </span>
                  </div>
                ) : (
                  <span style={{ color: '#d1d5db', fontSize: 12 }}>No closed tickets</span>
                )}
              </td>

              {/* Avg resolution */}
              <td className="px-4 py-3.5" style={{ color: '#6b7280' }}>
                {r.avg_resolution_days != null ? (
                  <span style={r.avg_resolution_days > 20 ? { color: '#b87d00', fontWeight: 600 } : {}}>
                    {r.avg_resolution_days}d
                  </span>
                ) : '—'}
              </td>

              {/* Total closed */}
              <td className="px-4 py-3.5" style={{ color: '#6b7280', fontWeight: 500 }}>{r.closed_total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Empty() {
  return <div className="py-10 text-center text-gray-400 text-sm">No team data available</div>
}
