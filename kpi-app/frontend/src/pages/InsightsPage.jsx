import { useState } from 'react'
import { getInsights } from '../api'

const CATEGORIES = [
  {
    key: 'positives',
    label: 'Positives',
    icon: '✅',
    color: '#1e8a5e',
    bg: '#ecfdf5',
    border: '#6ee7b7',
    headerBg: '#d1fae5',
  },
  {
    key: 'negatives',
    label: 'Concerns',
    icon: '⚠️',
    color: '#b45309',
    bg: '#fffbeb',
    border: '#fcd34d',
    headerBg: '#fef3c7',
  },
  {
    key: 'anomalies',
    label: 'Anomalies',
    icon: '🔍',
    color: '#7c3aed',
    bg: '#f5f3ff',
    border: '#c4b5fd',
    headerBg: '#ede9fe',
  },
  {
    key: 'improvements',
    label: 'Improvements',
    icon: '💡',
    color: '#1d4ed8',
    bg: '#eff6ff',
    border: '#93c5fd',
    headerBg: '#dbeafe',
  },
]

function DateInput({ label, value, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 500 }}>{label}</span>
      <input
        type="date"
        value={value}
        onChange={e => onChange(e.target.value)}
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

export default function InsightsPage({ sessionId, onSessionExpired }) {
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo,   setDateTo]   = useState('')
  const [loading,  setLoading]  = useState(false)
  const [insights, setInsights] = useState(null)
  const [error,    setError]    = useState(null)
  const [genTime,  setGenTime]  = useState(null)

  async function generate() {
    setLoading(true)
    setError(null)
    setInsights(null)
    try {
      const data = await getInsights(sessionId, dateFrom, dateTo)
      setInsights(data)
      setGenTime(new Date())
    } catch (err) {
      if (err.sessionExpired) { onSessionExpired?.(); return }
      setError(err.response?.data?.detail || err.message || 'Failed to generate insights.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

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
        padding: '16px 20px', display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end',
      }}>
        <DateInput label="From date" value={dateFrom} onChange={setDateFrom} />
        <DateInput label="To date"   value={dateTo}   onChange={setDateTo} />

        {(dateFrom || dateTo) && (
          <button
            onClick={() => { setDateFrom(''); setDateTo('') }}
            style={{
              background: 'none', border: '1px solid #e5e7eb', borderRadius: 8,
              fontSize: 12, color: '#6b7280', cursor: 'pointer', padding: '0 12px', height: 36,
              fontFamily: 'Inter, sans-serif', alignSelf: 'flex-end',
            }}
          >
            All time
          </button>
        )}

        <div style={{ flex: 1 }} />

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
                display: 'inline-block',
                animation: 'spin 0.7s linear infinite',
              }} />
              Analysing…
            </>
          ) : (
            <>✨ {insights ? 'Regenerate' : 'Generate Insights'}</>
          )}
        </button>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      {/* Loading state */}
      {loading && (
        <div style={{
          background: '#fff', border: '1px solid #e5e8ef', borderRadius: 12,
          padding: '48px 24px', textAlign: 'center',
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            border: '3px solid #e5e7eb', borderTopColor: '#6366f1',
            animation: 'spin 0.7s linear infinite',
            margin: '0 auto 16px',
          }} />
          <div style={{ fontSize: 15, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
            Analysing your ticket data…
          </div>
          <div style={{ fontSize: 13, color: '#9ca3af' }}>
            GPT is reviewing volumes, SLA performance, trends and workloads
          </div>
        </div>
      )}

      {/* Error state */}
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

      {/* Results */}
      {insights && !loading && (
        <>
          {/* Summary */}
          <div style={{
            background: 'linear-gradient(135deg, #f5f3ff, #eff6ff)',
            border: '1px solid #c4b5fd',
            borderRadius: 12, padding: '20px 24px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 18 }}>🧠</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#4f46e5' }}>Executive Summary</span>
              {insights.date_range?.from && (
                <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 4 }}>
                  {insights.date_range.from} → {insights.date_range.to || 'present'}
                  {insights.total_tickets_analysed != null &&
                    ` · ${insights.total_tickets_analysed.toLocaleString()} tickets`}
                </span>
              )}
            </div>
            <p style={{ fontSize: 14, color: '#374151', lineHeight: 1.7, margin: 0 }}>
              {insights.summary}
            </p>
          </div>

          {/* Four insight cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {CATEGORIES.map(cat => {
              const items = insights[cat.key] ?? []
              return (
                <div key={cat.key} style={{
                  background: cat.bg,
                  border: `1px solid ${cat.border}`,
                  borderRadius: 12, overflow: 'hidden',
                }}>
                  {/* Card header */}
                  <div style={{
                    background: cat.headerBg,
                    borderBottom: `1px solid ${cat.border}`,
                    padding: '12px 18px',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <span style={{ fontSize: 16 }}>{cat.icon}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: cat.color }}>
                      {cat.label}
                    </span>
                    <span style={{
                      marginLeft: 'auto', fontSize: 11, fontWeight: 600,
                      color: cat.color, background: cat.bg,
                      border: `1px solid ${cat.border}`,
                      borderRadius: 20, padding: '2px 8px',
                    }}>
                      {items.length}
                    </span>
                  </div>

                  {/* Items */}
                  <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {items.length === 0 ? (
                      <div style={{ fontSize: 13, color: '#9ca3af', fontStyle: 'italic' }}>
                        No items identified in this category.
                      </div>
                    ) : items.map((item, i) => (
                      <div key={i} style={{ display: 'flex', gap: 10 }}>
                        <div style={{
                          width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                          background: cat.color, color: '#fff',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 10, fontWeight: 700, marginTop: 1,
                        }}>
                          {i + 1}
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', marginBottom: 3 }}>
                            {item.title}
                          </div>
                          <div style={{ fontSize: 12, color: '#4b5563', lineHeight: 1.6 }}>
                            {item.detail}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
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
          <div style={{ fontSize: 13, color: '#9ca3af', maxWidth: 420, margin: '0 auto' }}>
            Optionally filter by date range, then click <strong>Generate Insights</strong> to get
            AI-powered analysis covering performance, trends, anomalies and recommendations.
          </div>
        </div>
      )}

    </div>
  )
}
