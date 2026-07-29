import { useEffect, useState, useCallback } from 'react'
import { getMarketingDeckCandidates, downloadMarketingDeck } from '../api'

const KEY_REQUEST_COLUMNS = [
  { key: 'europe', label: 'Europe', slots: 6 },
  { key: 'apm',    label: 'APM',    slots: 5 },
  { key: 'ame',    label: 'AME',    slots: 5 },
  { key: 'global', label: 'Global', slots: 2 },
]

// Rows start as {ticket, text, checked} — checked defaults to the first
// `slots` candidates (most-recently-closed first, same as the old
// auto-picker), text defaults to the raw ticket description and is
// freely editable ("rewrite" in place).
function initRows(candidates, slots) {
  return (candidates ?? []).map((c, i) => ({ ticket: c.ticket, text: c.text, checked: i < slots }))
}

export default function GenerateDeckModal({ sessionId, dateFrom, dateTo, periodLabel, onClose, onSessionExpired }) {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [rows, setRows] = useState({ europe: [], apm: [], ame: [], global: [] })
  const [stories, setStories] = useState([{ title: '', body: '' }, { title: '', body: '' }, { title: '', body: '' }])
  const [updates, setUpdates] = useState(Array(6).fill(''))
  const [wayForward, setWayForward] = useState(Array(5).fill(''))
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError('')
    getMarketingDeckCandidates(sessionId, dateFrom, dateTo)
      .then((data) => {
        if (cancelled) return
        const next = {}
        for (const { key, slots } of KEY_REQUEST_COLUMNS) next[key] = initRows(data[key], slots)
        setRows(next)
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        if (err.sessionExpired) { onSessionExpired?.(); return }
        setLoadError(err?.response?.data?.detail || err.message || 'Could not load candidate tickets.')
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [sessionId, dateFrom, dateTo, onSessionExpired])

  const checkedCount = (col) => rows[col].filter((r) => r.checked).length

  const toggleRow = useCallback((col, idx) => {
    setRows((prev) => {
      const slots = KEY_REQUEST_COLUMNS.find((c) => c.key === col).slots
      const alreadyChecked = prev[col].filter((r) => r.checked).length
      const row = prev[col][idx]
      if (!row.checked && alreadyChecked >= slots) return prev // at cap — ignore
      return { ...prev, [col]: prev[col].map((r, i) => (i === idx ? { ...r, checked: !r.checked } : r)) }
    })
  }, [])

  const editRowText = useCallback((col, idx, text) => {
    setRows((prev) => ({ ...prev, [col]: prev[col].map((r, i) => (i === idx ? { ...r, text } : r)) }))
  }, [])

  const generate = async () => {
    setGenerating(true)
    setGenError('')
    try {
      const key_requests = {}
      for (const { key } of KEY_REQUEST_COLUMNS) {
        key_requests[key] = rows[key].filter((r) => r.checked).map((r) => r.text.trim()).filter(Boolean)
      }
      await downloadMarketingDeck(sessionId, dateFrom, dateTo, {
        key_requests,
        stories: stories.map((s) => ({ title: s.title.trim(), body: s.body.trim() })),
        updates: updates.map((u) => u.trim()),
        way_forward: wayForward.map((w) => w.trim()),
      })
      onClose()
    } catch (err) {
      if (err.sessionExpired) { onSessionExpired?.(); return }
      setGenError(err.message || 'Could not generate the deck.')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(20,20,20,0.45)', zIndex: 60,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, boxShadow: '0 20px 50px rgba(20,20,20,0.25)',
        width: '100%', maxWidth: 960, maxHeight: '88vh', display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #e8e2d6', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexShrink: 0 }}>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 800, color: '#141414', margin: 0 }}>Generate Monthly Deck</h2>
            <p style={{ fontSize: 12.5, color: '#6e6e6e', margin: '4px 0 0' }}>
              Reporting on <b style={{ color: '#1450f5' }}>{periodLabel}</b> — pick the key requests to feature and write the editorial sections below.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" style={{
            border: 'none', background: 'none', cursor: 'pointer', color: '#9c9c9c', fontSize: 20,
            lineHeight: 1, padding: 4,
          }}>×</button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          {loading && <div style={{ padding: 40, textAlign: 'center', color: '#9c9c9c', fontSize: 13 }}>Loading candidate tickets…</div>}
          {loadError && (
            <div style={{ background: '#ffdee5', border: '1px solid #ffcdd7', color: '#8c1a2e', borderRadius: 10, padding: '12px 16px', fontSize: 13, marginBottom: 16 }}>
              {loadError}
            </div>
          )}

          {!loading && !loadError && (<>
            <SectionLabel>Key Requests</SectionLabel>
            <p style={sectionHint}>Completed tickets in the selected period, most recently closed first. Check the ones to feature (up to each column's limit) and rewrite the wording if you like.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 28 }}>
              {KEY_REQUEST_COLUMNS.map(({ key, label, slots }) => (
                <div key={key} style={{ border: '1px solid #e8e2d6', borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ padding: '9px 12px', background: '#f3eee6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#141414', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: checkedCount(key) >= slots ? '#1450f5' : '#9c9c9c' }}>
                      {checkedCount(key)} / {slots} selected
                    </span>
                  </div>
                  <div style={{ maxHeight: 260, overflowY: 'auto', padding: 8 }}>
                    {rows[key].length === 0 && <div style={{ padding: 10, fontSize: 12, color: '#9c9c9c' }}>No completed tickets for this area in the selected period.</div>}
                    {rows[key].map((row, i) => {
                      const atCap = !row.checked && checkedCount(key) >= slots
                      return (
                        <div key={row.ticket + i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 4px', opacity: atCap ? 0.45 : 1 }}>
                          <input
                            type="checkbox"
                            checked={row.checked}
                            disabled={atCap}
                            onChange={() => toggleRow(key, i)}
                            style={{ marginTop: 6, flexShrink: 0, cursor: atCap ? 'default' : 'pointer' }}
                          />
                          <input
                            type="text"
                            value={row.text}
                            disabled={!row.checked}
                            onChange={(e) => editRowText(key, i, e.target.value)}
                            style={{
                              flex: 1, fontSize: 12.5, padding: '6px 8px', border: '1px solid #e8e2d6', borderRadius: 6,
                              fontFamily: 'Inter, sans-serif', color: row.checked ? '#141414' : '#9c9c9c',
                              background: row.checked ? '#fff' : '#faf8f3',
                            }}
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            <SectionLabel>Stories</SectionLabel>
            <p style={sectionHint}>Three feature stories — title + a couple of sentences on what was delivered.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
              {stories.map((s, i) => (
                <div key={i} style={{ border: '1px solid #e8e2d6', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#1450f5' }}>STORY {i + 1}</span>
                  <input
                    type="text" placeholder="Title" value={s.title}
                    onChange={(e) => setStories((prev) => prev.map((st, idx) => (idx === i ? { ...st, title: e.target.value } : st)))}
                    style={inputStyle}
                  />
                  <textarea
                    placeholder="What was delivered, and why it mattered…" value={s.body} rows={2}
                    onChange={(e) => setStories((prev) => prev.map((st, idx) => (idx === i ? { ...st, body: e.target.value } : st)))}
                    style={{ ...inputStyle, resize: 'vertical', fontFamily: 'Inter, sans-serif' }}
                  />
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
              <div>
                <SectionLabel>Updates</SectionLabel>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                  {updates.map((v, i) => (
                    <input
                      key={i} type="text" placeholder={`Update ${i + 1}`} value={v}
                      onChange={(e) => setUpdates((prev) => prev.map((u, idx) => (idx === i ? e.target.value : u)))}
                      style={inputStyle}
                    />
                  ))}
                </div>
              </div>
              <div>
                <SectionLabel>Way Forward</SectionLabel>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                  {wayForward.map((v, i) => (
                    <input
                      key={i} type="text" placeholder={`Way forward ${i + 1}`} value={v}
                      onChange={(e) => setWayForward((prev) => prev.map((w, idx) => (idx === i ? e.target.value : w)))}
                      style={inputStyle}
                    />
                  ))}
                </div>
              </div>
            </div>
          </>)}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid #e8e2d6', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, flexShrink: 0 }}>
          {genError && <span style={{ fontSize: 12, color: '#c0305a', fontWeight: 600, marginRight: 'auto' }}>{genError}</span>}
          <button onClick={onClose} style={{
            height: 36, padding: '0 16px', borderRadius: 8, border: '1px solid #e8e2d6', background: '#fff',
            color: '#6e6e6e', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif',
          }}>
            Cancel
          </button>
          <button
            onClick={generate}
            disabled={loading || !!loadError || generating}
            style={{
              height: 36, padding: '0 18px', borderRadius: 8, border: 'none', background: '#1450f5',
              color: '#fff', fontSize: 13, fontWeight: 700, cursor: (loading || loadError || generating) ? 'default' : 'pointer',
              opacity: (loading || loadError || generating) ? 0.6 : 1, fontFamily: 'Inter, sans-serif',
            }}
          >
            {generating ? 'Generating…' : 'Generate & Download'}
          </button>
        </div>
      </div>
    </div>
  )
}

function SectionLabel({ children }) {
  return (
    <h3 style={{ fontSize: 12.5, fontWeight: 700, color: '#141414', textTransform: 'uppercase', letterSpacing: '0.04em', margin: 0 }}>
      {children}
    </h3>
  )
}

const sectionHint = { fontSize: 11.5, color: '#9c9c9c', margin: '4px 0 12px' }

const inputStyle = {
  width: '100%', boxSizing: 'border-box', fontSize: 12.5, padding: '8px 10px',
  border: '1px solid #e8e2d6', borderRadius: 6, fontFamily: 'Inter, sans-serif', color: '#141414', outline: 'none',
}
