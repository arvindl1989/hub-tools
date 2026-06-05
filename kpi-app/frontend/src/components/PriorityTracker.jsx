import { useEffect, useState, useCallback, useRef } from 'react'
import { getPriority, getExportUrl } from '../api'

// Inline style objects — avoid Tailwind purge issues and use brand palette
const PRIORITY_BADGE = {
  Overdue:  { backgroundColor: '#ffcdd7', color: '#141414' },
  Critical: { backgroundColor: '#ffe141', color: '#141414' },
  High:     { backgroundColor: '#d2f5ff', color: '#141414' },
  Medium:   { backgroundColor: '#aae1c8', color: '#141414' },
  Normal:   { backgroundColor: '#f3f4f6', color: '#6b7280' },
  'N/A':    { backgroundColor: '#f9fafb', color: '#9ca3af' },
}

const FILTER_KEYS = {
  assigned_to:  'Assignee',
  team:         'Team',
  sub_category: 'Sub Category',
  state:        'State',
}

function fmtDate(val) {
  if (!val) return '—'
  const iso = String(val).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return val
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return val
  const dt = new Date(y, m - 1, d)
  return isNaN(dt) ? val : dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function DaysCell({ val }) {
  if (val === null || val === undefined) return <span style={{ color: '#d1d5db' }}>—</span>
  if (val < 0)  return <span className="badge font-semibold" style={{ backgroundColor: '#ffcdd7', color: '#141414' }}>{val}d</span>
  if (val <= 5) return <span className="badge font-semibold" style={{ backgroundColor: '#ffe141', color: '#141414' }}>+{val}d</span>
  return <span style={{ color: '#6b7280' }}>+{val}d</span>
}

// Defined outside the parent so React never remounts it on re-render
function FilterSelect({ filterKey, label, value, options, onChange }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(filterKey, e.target.value)}
      className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
    >
      <option value="">All {label}s</option>
      {options.map((v) => <option key={v} value={v}>{v}</option>)}
    </select>
  )
}

function CopyCell({ value }) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef(null)

  const handleCopy = () => {
    if (!value) return
    navigator.clipboard.writeText(String(value)).then(() => {
      setCopied(true)
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <button
      onClick={handleCopy}
      title="Click to copy"
      className="font-mono text-xs hover:underline cursor-pointer focus:outline-none"
      style={{ color: '#1450f5' }}
    >
      {copied ? <span className="text-green-600 font-semibold">Copied!</span> : (value ?? '—')}
    </button>
  )
}

// Maps each column header label → { key: dataField, type: 'num'|'str'|'date' }
const COLUMNS = [
  { label: 'Priority',          key: 'priority_score',      type: 'num'  },
  { label: 'Ticket #',          key: 'ticket_number',        type: 'str'  },
  { label: 'Description',       key: 'short_description',    type: 'str'  },
  { label: 'Assigned To',       key: 'assigned_to',          type: 'str'  },
  { label: 'Team',              key: 'team',                 type: 'str'  },
  { label: 'Sub Category',      key: 'sub_category',         type: 'str'  },
  { label: 'State',             key: 'state',                type: 'str'  },
  { label: 'Area',              key: 'area',                 type: 'str'  },
  { label: 'Created',           key: 'created_date',         type: 'date' },
  { label: 'Pref. Live Date',   key: 'preferred_live_date',  type: 'date' },
  { label: 'SLA Due',           key: 'sla_due_date',         type: 'date' },
  { label: 'Ref Due Date',      key: 'due_date',             type: 'date' },
  { label: 'Days to SLA',       key: 'days_to_sla',          type: 'num'  },
  { label: 'Days to Pref. Live',key: 'days_to_pld',          type: 'num'  },
  { label: 'Age',               key: 'ticket_age',           type: 'num'  },
]

function colCompare(a, b, col, dir) {
  const av = a[col.key]
  const bv = b[col.key]
  const nullsLast = (v) => v == null
  if (nullsLast(av) && nullsLast(bv)) return 0
  if (nullsLast(av)) return 1
  if (nullsLast(bv)) return -1

  let cmp = 0
  if (col.type === 'num') {
    cmp = Number(av) - Number(bv)
  } else if (col.type === 'date') {
    cmp = String(av).slice(0, 10).localeCompare(String(bv).slice(0, 10))
  } else {
    cmp = String(av).localeCompare(String(bv))
  }
  return dir === 'desc' ? -cmp : cmp
}

export default function PriorityTracker({ sessionId, onSessionExpired, overview }) {
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ assigned_to: '', sub_category: '', state: '', team: '' })
  const [sort,    setSort]    = useState({ col: COLUMNS[0], dir: 'desc' })
  const [search,  setSearch]  = useState('')

  const setFilter = useCallback((key, val) => setFilters((f) => ({ ...f, [key]: val })), [])

  const handleHeaderClick = useCallback((col) => {
    setSort((prev) =>
      prev.col.key === col.key
        ? { col, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
        : { col, dir: col.type === 'num' ? 'desc' : 'asc' }
    )
  }, [])

  const load = useCallback(async (f) => {
    setLoading(true)
    try {
      const params = Object.fromEntries(Object.entries(f).filter(([, v]) => v))
      setTickets(await getPriority(sessionId, params))
    } catch (err) {
      if (err.sessionExpired) onSessionExpired()
    } finally {
      setLoading(false)
    }
  }, [sessionId, onSessionExpired])

  useEffect(() => { load(filters) }, [filters, load])

  const visible = tickets
    .filter((t) =>
      !search ||
      [t.ticket_number, t.short_description, t.assigned_to, t.team, t.sub_category, t.state, t.area]
        .some((v) => String(v ?? '').toLowerCase().includes(search.toLowerCase()))
    )
    .slice()
    .sort((a, b) => colCompare(a, b, sort.col, sort.dir))

  const activeFilters = Object.fromEntries(Object.entries(filters).filter(([, v]) => v))

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 items-center">
        {Object.entries(FILTER_KEYS).map(([key, label]) => (
          <FilterSelect
            key={key}
            filterKey={key}
            label={label}
            value={filters[key]}
            options={overview?.[`${key}_list`] ?? []}
            onChange={setFilter}
          />
        ))}

        <input
          type="text"
          placeholder="Search tickets…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 w-44 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />

        <div className="flex-1" />

        <span className="text-sm text-gray-400">{visible.length} ticket{visible.length !== 1 ? 's' : ''}</span>
        <a href={getExportUrl(sessionId, 'excel', activeFilters)} download className="btn-secondary text-sm">↓ Excel</a>
        <a href={getExportUrl(sessionId, 'csv',   activeFilters)} download className="btn-secondary text-sm">↓ CSV</a>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto" />
          </div>
        ) : visible.length === 0 ? (
          <div className="p-12 text-center text-gray-400">No active tickets match the current filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-gray-50 border-b border-gray-100">
                  {COLUMNS.map((col) => {
                    const active = sort.col.key === col.key
                    return (
                      <th
                        key={col.key}
                        onClick={() => handleHeaderClick(col)}
                        className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider whitespace-nowrap cursor-pointer select-none transition-colors"
                        style={active
                          ? { color: '#1450f5', backgroundColor: '#eef3ff' }
                          : { color: '#6b7280' }
                        }
                      >
                        {col.label}
                        <span className="ml-1 inline-block w-3 text-center">
                          {active ? (sort.dir === 'desc' ? '↓' : '↑') : ''}
                        </span>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {visible.map((t, i) => (
                  <tr key={t.ticket_number ?? i} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="badge" style={PRIORITY_BADGE[t.priority_label] ?? PRIORITY_BADGE.Normal}>
                        {t.priority_label}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap"><CopyCell value={t.ticket_number} /></td>
                    <td className="px-4 py-3 max-w-xs">
                      <span className="block truncate text-gray-700" title={t.short_description ?? ''}>
                        {t.short_description ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-medium">{t.assigned_to ?? '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500">{t.team ?? '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">{t.sub_category ?? '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className="badge"
                        style={t.state === 'Pending Confirmation'
                          ? { backgroundColor: '#d2f5ff', color: '#141414' }
                          : { backgroundColor: '#f3eee6', color: '#6b7280' }
                        }
                      >
                        {t.state ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500">{t.area ?? '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-400 text-xs">{fmtDate(t.created_date)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500">{fmtDate(t.preferred_live_date)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500">{fmtDate(t.sla_due_date)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-400 text-xs">{fmtDate(t.due_date)}</td>
                    <td className="px-4 py-3 whitespace-nowrap"><DaysCell val={t.days_to_sla} /></td>
                    <td className="px-4 py-3 whitespace-nowrap"><DaysCell val={t.days_to_pld} /></td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500">{t.ticket_age != null ? `${t.ticket_age}d` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
