import { useState, useCallback, useEffect } from 'react'
import UploadZone        from './components/UploadZone'
import { uploadFromSheetUrl } from './api'

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzaW_Z6bgnEO6SYLVQdh7M7JyouoGwwyR8UZ5G3V8MrRh-YcZv5FFGMpPn37aJ7GncOAA/exec'
import DashboardPage     from './pages/DashboardPage'
import PriorityPage      from './pages/PriorityPage'
import AnalyticsPage     from './pages/AnalyticsPage'
import UserActivityPage  from './pages/UserActivityPage'
import BandwidthPage     from './pages/BandwidthPage'
import InsightsPage      from './pages/InsightsPage'
import SlaConfigModal    from './components/SlaConfigModal'

const TABS = [
  { id: 'dashboard',     label: 'Dashboard',       icon: <GridIcon /> },
  { id: 'priority',      label: 'Priority Tracker', icon: <FlagIcon /> },
  { id: 'analytics',     label: 'Analytics',        icon: <ChartIcon /> },
  { id: 'user-activity', label: 'User Activity',    icon: <UsersIcon /> },
  { id: 'bandwidth',     label: 'Bandwidth',        icon: <BoltIcon /> },
  { id: 'insights',      label: 'Insights',         icon: <SparklesIcon /> },
]

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

  const handleUpload = useCallback((result) => {
    localStorage.setItem('ticketSessionId', result.session_id)
    localStorage.setItem('ticketMeta', JSON.stringify(result))
    setSessionId(result.session_id)
    setUploadMeta(result)
    setShowUpload(false)
    setActiveTab('dashboard')
  }, [])

  const handleSessionExpired = useCallback(() => {
    localStorage.removeItem('ticketSessionId')
    localStorage.removeItem('ticketMeta')
    setSessionId(null)
    setUploadMeta(null)
  }, [])

  // Auto-connect from Apps Script on every load (no session or manual refresh)
  useEffect(() => {
    if (showUpload) return
    setAutoConnecting(true)
    setAutoError(null)
    uploadFromSheetUrl(APPS_SCRIPT_URL, () => {})
      .then(result => {
        handleUpload(result)
        setAutoConnecting(false)
      })
      .catch(err => {
        setAutoError(err.message || 'Could not load sheet data')
        setAutoConnecting(false)
      })
  }, [showUpload])

  if (autoConnecting) {
    return (
      <div style={{ minHeight: '100vh', background: '#f0f3fa', display: 'flex', flexDirection: 'column' }}>
        <AppHeader onSlaConfig={() => setShowSlaConfig(true)} />
        <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            border: '3px solid #e5e7eb', borderTopColor: '#1450f5',
            animation: 'spin 0.8s linear infinite',
          }} />
          <p style={{ fontSize: 14, color: '#6b7280', fontFamily: 'Inter, sans-serif' }}>Loading ticket data…</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </main>
      </div>
    )
  }

  if (autoError && !sessionId) {
    return (
      <div style={{ minHeight: '100vh', background: '#f0f3fa', display: 'flex', flexDirection: 'column' }}>
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
      <div style={{ minHeight: '100vh', background: '#f0f3fa', display: 'flex', flexDirection: 'column' }}>
        <AppHeader hasSession onBack={() => setShowUpload(false)} onSlaConfig={() => setShowSlaConfig(true)} />
        <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <UploadZone onUpload={handleUpload} />
        </main>
        {showSlaConfig && <SlaConfigModal onClose={() => setShowSlaConfig(false)} />}
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f0f3fa', display: 'flex', flexDirection: 'column' }}>
      <AppHeader
        filename={uploadMeta?.filename}
        totalRows={uploadMeta?.total_rows}
        onReupload={() => setShowUpload(true)}
        onSlaConfig={() => setShowSlaConfig(true)}
      />

      {/* Tab bar */}
      <div style={{ background: '#ffffff', borderBottom: '1px solid #e5e8ef', padding: '0 24px', position: 'sticky', top: 0, zIndex: 20 }}>
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
                  color: active ? '#1450f5' : '#6b7280',
                  background: 'none', border: 'none', cursor: 'pointer',
                  borderBottom: active ? '2px solid #1450f5' : '2px solid transparent',
                  transition: 'all 0.15s',
                  fontFamily: 'Inter, sans-serif',
                  marginBottom: -1,
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = '#374151' }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = '#6b7280' }}
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
          {activeTab === 'dashboard'     && <DashboardPage    sessionId={sessionId} onSessionExpired={handleSessionExpired} />}
          {activeTab === 'priority'      && <PriorityPage     sessionId={sessionId} onSessionExpired={handleSessionExpired} />}
          {activeTab === 'analytics'     && <AnalyticsPage    sessionId={sessionId} onSessionExpired={handleSessionExpired} />}
          {activeTab === 'user-activity' && <UserActivityPage sessionId={sessionId} onSessionExpired={handleSessionExpired} />}
          {activeTab === 'bandwidth'     && <BandwidthPage    sessionId={sessionId} onSessionExpired={handleSessionExpired} />}
          {activeTab === 'insights'      && <InsightsPage     sessionId={sessionId} onSessionExpired={handleSessionExpired} />}
        </div>
      </main>

      {showSlaConfig && <SlaConfigModal onClose={() => setShowSlaConfig(false)} />}
    </div>
  )
}

const HUB_URL = '/'

function AppHeader({ filename, totalRows, onReupload, onBack, onSlaConfig }) {
  return (
    <header style={{
      background: '#ffffff',
      borderBottom: '1px solid #e5e8ef',
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
              fontSize: 12, fontWeight: 600, color: '#6b7280',
              textDecoration: 'none', flexShrink: 0,
              padding: '5px 10px',
              border: '1px solid #e5e7eb',
              borderRadius: 7,
              transition: 'all 0.15s',
              fontFamily: 'Inter, sans-serif',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#1450f5'; e.currentTarget.style.color = '#1450f5'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.color = '#6b7280'; }}
          >
            {/* Shield icon */}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            Hub
          </a>
          <div style={{ width: 1, height: 20, background: '#e5e8ef', flexShrink: 0 }} />
        </>
      )}

      {/* Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: 'linear-gradient(135deg, #1450f5 0%, #3b70f7 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <span style={{ color: '#fff', fontSize: 12, fontWeight: 800, letterSpacing: '-0.5px' }}>IQ</span>
        </div>
        <span style={{ fontSize: 16, fontWeight: 700, color: '#111827', letterSpacing: '-0.3px' }}>TicketIQ</span>
      </div>

      {/* Separator */}
      <div style={{ width: 1, height: 20, background: '#e5e8ef', flexShrink: 0 }} />

      {/* File info */}
      {filename && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, overflow: 'hidden' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
          </svg>
          <span style={{ fontSize: 13, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>{filename}</span>
          <span style={{
            fontSize: 11, fontWeight: 600, color: '#1450f5',
            background: '#eff4ff', border: '1px solid #c7d7fd',
            borderRadius: 20, padding: '2px 8px', flexShrink: 0,
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
            background: 'none', border: '1px solid #e5e7eb', borderRadius: 8,
            padding: '6px 12px', fontSize: 13, fontWeight: 500, color: '#374151',
            cursor: 'pointer', fontFamily: 'Inter, sans-serif',
          }}
        >
          SLA Config
        </button>
        {onBack && (
          <button onClick={onBack} style={{ background: 'none', border: 'none', fontSize: 13, color: '#6b7280', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
            â† Back
          </button>
        )}
        {onReupload && (
          <button
            onClick={onReupload}
            style={{
              background: '#1450f5', color: '#ffffff',
              border: 'none', borderRadius: 8,
              padding: '7px 14px', fontSize: 13, fontWeight: 600,
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
function FlagIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
}
function ChartIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg>
}
function UsersIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
}
function BoltIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
}
function SparklesIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3L13.5 8.5L19 10L13.5 11.5L12 17L10.5 11.5L5 10L10.5 8.5Z"/><path d="M19 3L19.75 5.25L22 6L19.75 6.75L19 9L18.25 6.75L16 6L18.25 5.25Z"/><path d="M5 17L5.5 18.5L7 19L5.5 19.5L5 21L4.5 19.5L3 19L4.5 18.5Z"/></svg>
}

