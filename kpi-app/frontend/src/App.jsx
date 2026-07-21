import { useState, useCallback, useEffect } from 'react'
import UploadZone        from './components/UploadZone'
import { uploadFromSheetUrl } from './api'

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzaW_Z6bgnEO6SYLVQdh7M7JyouoGwwyR8UZ5G3V8MrRh-YcZv5FFGMpPn37aJ7GncOAA/exec'
import DashboardPage     from './pages/DashboardPage'
import UserActivityPage  from './pages/UserActivityPage'
import FeedbackPage      from './pages/FeedbackPage'
import ExperimentalReportsPage from './pages/ExperimentalReportsPage'
import SlaConfigModal    from './components/SlaConfigModal'
import PasswordGateModal from './components/PasswordGateModal'

const TABS = [
  { id: 'dashboard',     label: 'Dashboard',       icon: <GridIcon /> },
  { id: 'user-activity', label: 'User Activity',    icon: <UsersIcon /> },
  { id: 'feedback',      label: 'Feedback',         icon: <SmileIcon /> },
]

const EXPERIMENTAL_PASSWORD = 'Whiteshadows'

export default function App() {
  const [sessionId,  setSessionId]  = useState(() => localStorage.getItem('ticketSessionId'))
  const [uploadMeta, setUploadMeta] = useState(() => {
    try { return JSON.parse(localStorage.getItem('ticketMeta') || 'null') } catch { return null }
  })
  const [activeTab,      setActiveTab]     = useState('dashboard')
  const [showUpload,     setShowUpload]    = useState(false)
  const [showSlaConfig,  setShowSlaConfig] = useState(false)
  const [autoConnecting, setAutoConnecting] = useState(false)
  const [autoError,      setAutoError]     = useState(null)

  // Experimental Reports stays behind a password for the session (cleared on tab close)
  const [experimentalUnlocked, setExperimentalUnlocked] = useState(
    () => sessionStorage.getItem('experimentalUnlocked') === 'true'
  )
  const [showPasswordGate, setShowPasswordGate] = useState(false)

  const openExperimental = useCallback(() => {
    if (experimentalUnlocked) { setActiveTab('experimental'); return }
    setShowPasswordGate(true)
  }, [experimentalUnlocked])

  const handleUnlockAttempt = useCallback((password) => {
    if (password !== EXPERIMENTAL_PASSWORD) return false
    sessionStorage.setItem('experimentalUnlocked', 'true')
    setExperimentalUnlocked(true)
    setShowPasswordGate(false)
    setActiveTab('experimental')
    return true
  }, [])

  const handleUpload = useCallback((result, isAutoConnect = false) => {
    localStorage.setItem('ticketSessionId', result.session_id)
    localStorage.setItem('ticketMeta', JSON.stringify(result))
    setSessionId(result.session_id)
    setUploadMeta(result)
    setShowUpload(false)
    if (!isAutoConnect) setActiveTab('dashboard')
  }, [])

  const handleSessionExpired = useCallback(() => {
    localStorage.removeItem('ticketSessionId')
    localStorage.removeItem('ticketMeta')
    setSessionId(null)
    setUploadMeta(null)
    // Don't show upload zone — trigger auto-reconnect instead by bumping reconnectKey
    setReconnectKey(k => k + 1)
  }, [])

  const [reconnectKey, setReconnectKey] = useState(0)

  // Re-fetch fresh sheet data on EVERY page load (and when a session expires).
  // A stored session is only used to render instantly while the refresh runs
  // in the background — otherwise the browser keeps showing stale data forever.
  useEffect(() => {
    if (showUpload) return
    const hadSession = !!localStorage.getItem('ticketSessionId')
    if (!hadSession) {
      setAutoConnecting(true)
      setAutoError(null)
    }
    uploadFromSheetUrl(APPS_SCRIPT_URL, () => {})
      .then(result => {
        handleUpload(result, true)
        setAutoConnecting(false)
      })
      .catch(err => {
        // Silent failure when stale data is still on screen; error page otherwise
        if (!hadSession) setAutoError(err.message || 'Could not load sheet data')
        setAutoConnecting(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showUpload, reconnectKey, handleUpload])

  if (autoConnecting) {
    return (
      <div style={{ minHeight: '100vh', background: '#f3eee6', display: 'flex', flexDirection: 'column' }}>
        <AppHeader onSlaConfig={() => setShowSlaConfig(true)} />
        <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            border: '3px solid #e8e2d6', borderTopColor: '#1450f5',
            animation: 'spin 0.8s linear infinite',
          }} />
          <p style={{ fontSize: 14, color: '#6e6e6e', fontFamily: 'Inter, sans-serif' }}>Loading ticket data…</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </main>
      </div>
    )
  }

  if (autoError && !sessionId) {
    return (
      <div style={{ minHeight: '100vh', background: '#f3eee6', display: 'flex', flexDirection: 'column' }}>
        <AppHeader onSlaConfig={() => setShowSlaConfig(true)} />
        <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ textAlign: 'center', maxWidth: 420 }}>
            <p style={{ fontSize: 15, color: '#c0305a', marginBottom: 16, fontFamily: 'Inter, sans-serif' }}>
              Could not load sheet: {autoError}
            </p>
            <UploadZone onUpload={handleUpload} />
          </div>
        </main>
      </div>
    )
  }

  if (showUpload) {
    return (
      <div style={{ minHeight: '100vh', background: '#f3eee6', display: 'flex', flexDirection: 'column' }}>
        <AppHeader hasSession onBack={() => setShowUpload(false)} onSlaConfig={() => setShowSlaConfig(true)} />
        <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <UploadZone onUpload={handleUpload} />
        </main>
        {showSlaConfig && <SlaConfigModal onClose={() => setShowSlaConfig(false)} />}
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f3eee6', display: 'flex', flexDirection: 'column' }}>
      <AppHeader
        filename={uploadMeta?.filename}
        totalRows={uploadMeta?.total_rows}
        onReupload={() => setShowUpload(true)}
        onSlaConfig={() => setShowSlaConfig(true)}
      />

      {/* Tab bar */}
      <div style={{ background: '#ffffff', borderBottom: '1px solid #e8e2d6', padding: '0 24px', position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ maxWidth: 1600, margin: '0 auto', display: 'flex', gap: 4 }}>
          {TABS.map((t) => {
            const active = activeTab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '12px 16px',
                  fontSize: 13, fontWeight: active ? 600 : 500,
                  color: active ? '#1450f5' : '#6e6e6e',
                  background: 'none', border: 'none', cursor: 'pointer',
                  borderBottom: active ? '2px solid #1450f5' : '2px solid transparent',
                  transition: 'all 0.15s',
                  fontFamily: 'Inter, sans-serif',
                  marginBottom: -1,
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = '#404040' }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = '#6e6e6e' }}
              >
                <span style={{ opacity: active ? 1 : 0.7 }}>{t.icon}</span>
                {t.label}
              </button>
            )
          })}
        </div>
      </div>

      <main style={{ flex: 1, padding: '24px', paddingBottom: 48 }}>
        <div style={{ maxWidth: 1600, margin: '0 auto' }}>
          {activeTab === 'dashboard'     && <DashboardPage    sessionId={sessionId} onSessionExpired={handleSessionExpired} onOpenExperimental={openExperimental} />}
          {activeTab === 'user-activity' && <UserActivityPage sessionId={sessionId} onSessionExpired={handleSessionExpired} />}
          {activeTab === 'feedback'      && <FeedbackPage sessionId={sessionId} />}
          {activeTab === 'experimental'  && experimentalUnlocked && <ExperimentalReportsPage sessionId={sessionId} onSessionExpired={handleSessionExpired} onBack={() => setActiveTab('dashboard')} />}
        </div>
      </main>

      {showSlaConfig && <SlaConfigModal onClose={() => setShowSlaConfig(false)} />}
      {showPasswordGate && (
        <PasswordGateModal onSubmit={handleUnlockAttempt} onCancel={() => setShowPasswordGate(false)} />
      )}
    </div>
  )
}

const HUB_URL = '/'

function AppHeader({ filename, totalRows, onReupload, onBack, onSlaConfig }) {
  return (
    <header style={{
      background: '#1450f5',
      padding: '0 24px',
      height: 56,
      display: 'flex', alignItems: 'center', gap: 16,
      flexShrink: 0,
    }}>

      {/* â”€â”€ Back to Aegis Hub â”€â”€ */}
      {HUB_URL && (
        <>
          <a
            href={HUB_URL}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.85)',
              textDecoration: 'none', flexShrink: 0,
              padding: '5px 10px',
              border: '1px solid rgba(255,255,255,0.35)',
              borderRadius: 7,
              transition: 'all 0.15s',
              fontFamily: 'Inter, sans-serif',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#ffffff'; e.currentTarget.style.color = '#ffffff'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.35)'; e.currentTarget.style.color = 'rgba(255,255,255,0.85)'; }}
          >
            {/* Shield icon */}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            Hub
          </a>
          <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.25)', flexShrink: 0 }} />
        </>
      )}

      {/* Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: '#ffffff',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <span style={{ color: '#1450f5', fontSize: 12, fontWeight: 800, letterSpacing: '-0.5px' }}>IQ</span>
        </div>
        <span style={{ fontSize: 16, fontWeight: 700, color: '#ffffff', letterSpacing: '-0.3px' }}>TicketIQ</span>
      </div>

      {/* Separator */}
      <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.25)', flexShrink: 0 }} />

      {/* File info */}
      {filename && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, overflow: 'hidden' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
          </svg>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>{filename}</span>
          <span style={{
            fontSize: 11, fontWeight: 700, color: '#141414',
            background: '#d2f5ff',
            borderRadius: 20, padding: '3px 9px', flexShrink: 0,
          }}>
            {totalRows?.toLocaleString()} rows
          </span>
        </div>
      )}

      {!filename && <div style={{ flex: 1 }} />}

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <button
          onClick={onSlaConfig}
          style={{
            background: 'none', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 8,
            padding: '6px 12px', fontSize: 13, fontWeight: 500, color: '#ffffff',
            cursor: 'pointer', fontFamily: 'Inter, sans-serif',
          }}
        >
          SLA Config
        </button>
        {onBack && (
          <button onClick={onBack} style={{ background: 'none', border: 'none', fontSize: 13, color: 'rgba(255,255,255,0.85)', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
            â† Back
          </button>
        )}
        {onReupload && (
          <button
            onClick={onReupload}
            style={{
              background: '#ffe141', color: '#141414',
              border: 'none', borderRadius: 8,
              padding: '7px 14px', fontSize: 13, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'Inter, sans-serif',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Upload File
          </button>
        )}
      </div>
    </header>
  )
}

function GridIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
}
function UsersIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
}
function SmileIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
}

