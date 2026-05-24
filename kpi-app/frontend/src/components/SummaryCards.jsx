export default function SummaryCards({ data }) {
  if (!data) return null

  const cards = [
    {
      label: 'Active Tickets',
      value: data.total_active,
      sub: `${data.total_all} total`,
      color: 'indigo',
    },
    {
      label: 'Overdue SLA',
      value: data.overdue_sla,
      sub: 'SLA breached',
      color: 'red',
      alert: data.overdue_sla > 0,
    },
    {
      label: 'Due ≤ 5 Days',
      value: data.due_within_5,
      sub: 'approaching SLA',
      color: 'amber',
      alert: data.due_within_5 > 0,
    },
    {
      label: 'Pending Confirmation',
      value: data.pending_confirmation,
      sub: 'near-complete',
      color: 'yellow',
    },
    {
      label: 'Closed This Week',
      value: data.closed_this_week,
      sub: 'resolved recently',
      color: 'green',
    },
    {
      label: 'Avg Ticket Age',
      value: `${data.avg_age}d`,
      sub: 'active tickets',
      color: 'slate',
    },
  ]

  const colorMap = {
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-100',
    red:    'bg-red-50 text-red-700 border-red-100',
    amber:  'bg-amber-50 text-amber-700 border-amber-100',
    yellow: 'bg-yellow-50 text-yellow-700 border-yellow-100',
    green:  'bg-green-50 text-green-700 border-green-100',
    slate:  'bg-slate-50 text-slate-700 border-slate-100',
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
      {cards.map((c) => (
        <div
          key={c.label}
          className={`rounded-xl border p-4 ${colorMap[c.color]} ${c.alert ? 'ring-2 ring-offset-1 ring-current' : ''}`}
        >
          <p className="text-3xl font-bold">{c.value ?? '—'}</p>
          <p className="text-sm font-medium mt-1">{c.label}</p>
          <p className="text-xs opacity-70 mt-0.5">{c.sub}</p>
        </div>
      ))}
    </div>
  )
}
