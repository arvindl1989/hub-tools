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
  ]

  const colorMap = {
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-100',
    yellow: 'bg-yellow-50 text-yellow-700 border-yellow-100',
    green:  'bg-green-50 text-green-700 border-green-100',
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
