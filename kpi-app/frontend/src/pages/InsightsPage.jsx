import { useState } from 'react'
import { getInsights } from '../api'

const SERVICES = [
  'Website Content Management',
  'Content Production – Graphic Design',
  'Demand Creation – Global',
  'Email – Local',
  'Retention – Activations',
]

const CATEGORIES = [
  { key: 'positives',    label: 'Positives',     icon: '✅', color: '#1e8a5e', bg: '#ecfdf5', border: '#6ee7b7', headerBg: '#d1fae5' },
  { key: 'negatives',    label: 'Concerns',       icon: '⚠️', color: '#b45309', bg: '#fffbeb', border: '#fcd34d', headerBg: '#fef3c7' },
  { key: 'anomalies',    label: 'Anomalies',      icon: '🔍', color: '#7c3aed', bg: '#f5f3ff', border: '#c4b5fd', headerBg: '#ede9fe' },
  { key: 'improvements', label: 'Improvements',   icon: '💡', color: '#1d4ed8', bg: '#eff6ff', border: '#93c5fd', headerBg: '#dbeafe' },
]

/* ── tiny shared components ─────────────────────────────────────────────── */
function DateInput({ label, value, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 500 }}>{label}</span>
      <input
        type="date" value={value} onChange={e => onChange(e.target.value)}
        style={{
          height: 36, border: '1px solid #e5e7eb', borderRadius: 8,
          fontSize: 13, color: '#374151', padding: '0 10px',
          background: '#fff', fontFamily: 'Inter, sans-serif',
          cursor: 'pointer', outline: 'none',
        }}
      />
    </div>
  )
}

function SummaryBanner({ insights, label, accent }) {
  const bg   = accent === 'indigo' ? 'linear-gradient(135deg,#f5f3ff,#eff6ff)' : 'linear-gradient(135deg,#f0fdf4,#ecfdf5)'
  const border = accent === 'indigo' ? '#c4b5fd' : '#6ee7b7'
  const color  = accent === 'indigo' ? '#4f46e5' : '#065f46'
  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 12, padding: '18px 22px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 16 }}>🧠</span>
        <span style={{ fontSize: 13, fontWeight: 700, color }}>{label}</span>
        {insights.date_range?.from && (
          <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 2 }}>
            {insights.date_range.from} → {insights.date_range.to || 'present'}
            {insights.total_tickets_analysed != null &&
              ` · ${insights.total_tickets_analysed.toLocaleString()} tickets`}
          </span>
        )}
      </div>
      <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.7, margin: 0 }}>{insights.summary}</p>
    </div>
  )
}

function CategoryCard({ cat, items }) {
  return (
    <div style={{ background: cat.bg, border: `1px solid ${cat.border}`, borderRadius: 12, overflow: 'hidden' }}>
      <div style={{
        background: cat.headerBg, borderBottom: `1px solid ${cat.border}`,
        padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ fontSize: 15 }}>{cat.icon}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: cat.color }}>{cat.label}</span>
        <span style={{
          marginLeft: 'auto', fontSize: 11, fontWeight: 600, color: cat.color,
          background: cat.bg, border: `1px solid ${cat.border}`, borderRadius: 20, padding: '1px 8px',
        }}>{(items ?? []).length}</span>
      </div>
      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {!(items?.length) ? (
          <div style={{ fontSize: 12, color: '#9ca3af', fontStyle: 'italic' }}>No items in this category.</div>
        ) : items.map((item, i) => (
          <div key={i} style={{ display: 'flex', gap: 9 }}>
            <div style={{
              width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
              background: cat.color, color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 9, fontWeight: 700, marginTop: 1,
            }}>{i + 1}</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', marginBottom: 2 }}>{item.title}</div>
              <div style={{ fontSize: 12, color: '#4b5563', lineHeight: 1.6 }}>{item.detail}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── main page ──────────────────────────────────────────────────────────── */
export default function InsightsPage({ sessionId, onSessionExpired }) {
  // Primary range
  const [dateFrom,     setDateFrom]     = useState('')
  const [dateTo,       setDateTo]       = useState('')
  const [subCategory,  setSubCategory]  = useState('')

  // Comparison range
  const [compareMode,  setCompareMode]  = useState(false)
  const [cmpFrom,      setCmpFrom]      = useState('')
  const [cmpTo,        setCmpTo]        = useState('')

  // Results
  const [loading,  setLoading]  = useState(false)
  const [insights, setInsights] = useState(null)   // primary
  const [cmpData,  setCmpData]  = useState(null)   // comparison
  const [error,    setError]    = useState(null)
  const [genTime,  setGenTime]  = useState(null)

  async function generate() {
    setLoading(true)
    setError(null)
    setInsights(null)
    setCmpData(null)
    try {
      const sc = subCategory || null
      if (compareMode && (cmpFrom || cmpTo)) {
        const [primary, compare] = await Promise.all([
          getInsights(sessionId, dateFrom, dateTo, sc),
          getInsights(sessionId, cmpFrom,  cmpTo,  sc),
        ])
        setInsights(primary)
        setCmpData(compare)
      } else {
        const data = await getInsights(sessionId, dateFrom, dateTo, sc)
        setInsights(data)
      }
      setGenTime(new Date())
    } catch (err) {
      if (err.sessionExpired) { onSessionExpired?.(); return }
      setError(err.response?.data?.detail || err.message || 'Failed to generate insights.')
    } finally {
      setLoading(false)
    }
  }

  const hasResults = insights && !loading

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: 0 }}>AI Insights</h2>
        <p style={{ fontSize: 13, color: '#6b7280', margin: '4px 0 0' }}>
          GPT-powered analysis of your ticket data — positives, concerns, anomalies and recommendations.
        </p>
      </div>

      {/* Controls */}
      <div style={{
        background: '#fff', border: '1px solid #e5e8ef', borderRadius: 12,
        padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12,
      }}>

        {/* Row 1: primary range + sub-category + compare toggle */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>

          {/* Primary range */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <DateInput label="From" value={dateFrom} onChange={setDateFrom} />
            <DateInput label="To"   value={dateTo}   onChange={setDateTo} />
            {(dateFrom || dateTo) && (
              <button
                onClick={() => { setDateFrom(''); setDateTo('') }}
                style={{
                  background: 'none', border: '1px solid #e5e7eb', borderRadius: 8,
                  fontSize: 12, color: '#6b7280', cursor: 'pointer', padding: '0 12px', height: 36,
                  fontFamily: 'Inter, sans-serif',
                }}
              >All time</button>
            )}
          </div>

          {/* Divider */}
          <div style={{ width: 1, height: 36, background: '#e5e7eb', alignSelf: 'flex-end' }} />

          {/* Sub-category */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 500 }}>Service</span>
            <select
              value={subCategory}
              onChange={e => setSubCategory(e.target.value)}
              style={{
                height: 36, border: '1px solid #e5e7eb', borderRadius: 8,
                fontSize: 13, color: subCategory ? '#374151' : '#9ca3af',
                padding: '0 10px', background: '#fff',
                fontFamily: 'Inter, sans-serif', cursor: 'pointer', outline: 'none',
                minWidth: 200,
              }}
            >
              <option value="">All services</option>
              {SERVICES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div style={{ flex: 1 }} />

          {/* Compare toggle */}
          <button
            onClick={() => { setCompareMode(v => !v); if (compareMode) { setCmpFrom(''); setCmpTo('') } }}
            style={{
              height: 36, padding: '0 14px', borderRadius: 8, cursor: 'pointer',
              fontSize: 12, fontWeight: 600, fontFamily: 'Inter, sans-serif',
              background: compareMode ? '#eff6ff' : 'none',
              color: compareMode ? '#1d4ed8' : '#6b7280',
              border: compareMode ? '1px solid #93c5fd' : '1px solid #e5e7eb',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/>
            </svg>
            {compareMode ? 'Comparing' : 'Compare periods'}
          </button>

          {/* Generate */}
          {genTime && !loading && (
            <span style={{ fontSize: 11, color: '#9ca3af', alignSelf: 'flex-end' }}>
              Generated {genTime.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={generate}
            disabled={loading}
            style={{
              background: loading ? '#e5e7eb' : 'linear-gradient(135deg, #6366f1, #4f46e5)',
              color: loading ? '#9ca3af' : '#fff',
              border: 'none', borderRadius: 9, padding: '0 22px', height: 36,
              fontSize: 13, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: 'Inter, sans-serif',
              display: 'flex', alignItems: 'center', gap: 8,
              boxShadow: loading ? 'none' : '0 2px 8px rgba(99,102,241,0.35)',
              transition: 'all 0.15s',
            }}
          >
            {loading ? (
              <>
                <span style={{
                  width: 14, height: 14, border: '2px solid #9ca3af',
                  borderTopColor: '#6b7280', borderRadius: '50%',
                  display: 'inline-block', animation: 'spin 0.7s linear infinite',
                }} />
                Analysing…
              </>
            ) : <>✨ {hasResults ? 'Regenerate' : 'Generate Insights'}</>}
          </button>
        </div>

        {/* Row 2: comparison range (when active) */}
        {compareMode && (
          <div style={{
            display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap',
            paddingTop: 12, borderTop: '1px dashed #e5e7eb',
          }}>
            <span style={{
              fontSize: 11, fontWeight: 600, color: '#1d4ed8',
              background: '#eff6ff', border: '1px solid #93c5fd',
              borderRadius: 20, padding: '2px 10px', alignSelf: 'center',
            }}>vs Period</span>
            <DateInput label="Compare from" value={cmpFrom} onChange={setCmpFrom} />
            <DateInput label="Compare to"   value={cmpTo}   onChange={setCmpTo} />
            {(cmpFrom || cmpTo) && (
              <button
                onClick={() => { setCmpFrom(''); setCmpTo('') }}
                style={{
                  background: 'none', border: '1px solid #e5e7eb', borderRadius: 8,
                  fontSize: 12, color: '#6b7280', cursor: 'pointer', padding: '0 12px', height: 36,
                  fontFamily: 'Inter, sans-serif',
                }}
              >Clear</button>
            )}
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      {/* Loading */}
      {loading && (
        <div style={{ background: '#fff', border: '1px solid #e5e8ef', borderRadius: 12, padding: '48px 24px', textAlign: 'center' }}>
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            border: '3px solid #e5e7eb', borderTopColor: '#6366f1',
            animation: 'spin 0.7s linear infinite', margin: '0 auto 16px',
          }} />
          <div style={{ fontSize: 15, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
            Analysing your ticket data{cmpData !== null ? ' (×2 periods)' : ''}…
          </div>
          <div style={{ fontSize: 13, color: '#9ca3af' }}>
            GPT is reviewing volumes, SLA performance, trends and workloads
          </div>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div style={{
          background: '#fff1f2', border: '1px solid #fda4af', borderRadius: 12,
          padding: '18px 20px', color: '#be123c', fontSize: 13,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 18 }}>⚠️</span>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 2 }}>Could not generate insights</div>
            <div style={{ opacity: 0.8 }}>{error}</div>
          </div>
        </div>
      )}

      {/* ── Results: single period ─────────────────────────────────────────── */}
      {hasResults && !cmpData && (
        <>
          <SummaryBanner insights={insights} label="Executive Summary" accent="indigo" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {CATEGORIES.map(cat => (
              <CategoryCard key={cat.key} cat={cat} items={insights[cat.key]} />
            ))}
          </div>
        </>
      )}

      {/* ── Results: comparison mode ───────────────────────────────────────── */}
      {hasResults && cmpData && (
        <>
          {/* Column headers */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={{
              background: 'linear-gradient(135deg,#f5f3ff,#eff6ff)',
              border: '1px solid #c4b5fd', borderRadius: 10,
              padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#4f46e5' }}>Period A</span>
              <span style={{ fontSize: 11, color: '#9ca3af' }}>
                {insights.date_range?.from || 'beginning'} → {insights.date_range?.to || 'present'}
                {insights.total_tickets_analysed != null && ` · ${insights.total_tickets_analysed.toLocaleString()} tickets`}
              </span>
            </div>
            <div style={{
              background: 'linear-gradient(135deg,#f0fdf4,#ecfdf5)',
              border: '1px solid #6ee7b7', borderRadius: 10,
              padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#065f46' }}>Period B</span>
              <span style={{ fontSize: 11, color: '#9ca3af' }}>
                {cmpData.date_range?.from || 'beginning'} → {cmpData.date_range?.to || 'present'}
                {cmpData.total_tickets_analysed != null && ` · ${cmpData.total_tickets_analysed.toLocaleString()} tickets`}
              </span>
            </div>
          </div>

          {/* Side-by-side summaries */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <SummaryBanner insights={insights} label="Summary — Period A" accent="indigo" />
            <SummaryBanner insights={cmpData}  label="Summary — Period B" accent="green" />
          </div>

          {/* Side-by-side category cards */}
          {CATEGORIES.map(cat => (
            <div key={cat.key} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <CategoryCard cat={cat} items={insights[cat.key]} />
              <CategoryCard cat={cat} items={cmpData[cat.key]} />
            </div>
          ))}
        </>
      )}

      {/* Empty state */}
      {!insights && !loading && !error && (
        <div style={{
          background: '#fff', border: '1px solid #e5e8ef', borderRadius: 12,
          padding: '60px 24px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.4 }}>✨</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
            Ready to analyse your ticket data
          </div>
          <div style={{ fontSize: 13, color: '#9ca3af', maxWidth: 440, margin: '0 auto' }}>
            Filter by date range and service, toggle <strong>Compare periods</strong> to add a second range,
            then click <strong>Generate Insights</strong>.
          </div>
        </div>
      )}

    </div>
  )
}
