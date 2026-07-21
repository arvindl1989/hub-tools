import { useState } from 'react'
import PriorityPage        from './PriorityPage'
import AnalyticsPage       from './AnalyticsPage'
import BandwidthPage       from './BandwidthPage'
import InsightsPage        from './InsightsPage'
import UtilityRatePage     from './UtilityRatePage'
import DashboardExtrasPage from './DashboardExtrasPage'

const REPORTS = [
  { id: 'priority',    label: 'Priority Tracker', icon: <FlagIcon /> },
  { id: 'analytics',   label: 'Analytics',        icon: <ChartIcon /> },
  { id: 'bandwidth',   label: 'Bandwidth',        icon: <BoltIcon /> },
  { id: 'insights',    label: 'Insights',         icon: <SparklesIcon /> },
  { id: 'utility-rate',label: 'Utility Rate',     icon: <GaugeIcon /> },
  { id: 'extras',      label: 'Dashboard Extras', icon: <GridIcon /> },
]

export default function ExperimentalReportsPage({ sessionId, onSessionExpired, onBack, initialReport }) {
  const [active, setActive] = useState(initialReport ?? 'priority')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <button
            onClick={onBack}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none',
              color: '#1450f5', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0,
              fontFamily: 'Inter, sans-serif', marginBottom: 6,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
            </svg>
            Back to Dashboard
          </button>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: '#141414', margin: 0, letterSpacing: '-0.02em' }}>Experimental Reports</h2>
          <p style={{ fontSize: 12, color: '#6e6e6e', margin: '4px 0 0' }}>
            Legacy and in-progress views, still fed by the same connected sheet.
          </p>
        </div>
      </div>

      {/* Report pills */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, background: '#fff', border: '1px solid #e8e2d6', borderRadius: 12, padding: 8 }}>
        {REPORTS.map(r => {
          const isActive = active === r.id
          return (
            <button
              key={r.id}
              onClick={() => setActive(r.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', fontSize: 13, fontWeight: isActive ? 700 : 500,
                border: 'none', borderRadius: 8, cursor: 'pointer',
                background: isActive ? '#1450f5' : 'transparent',
                color: isActive ? '#fff' : '#6e6e6e',
                fontFamily: 'Inter, sans-serif', transition: 'all 0.15s',
              }}
            >
              <span style={{ opacity: isActive ? 1 : 0.7 }}>{r.icon}</span>
              {r.label}
            </button>
          )
        })}
      </div>

      <div>
        {active === 'priority'     && <PriorityPage        sessionId={sessionId} onSessionExpired={onSessionExpired} />}
        {active === 'analytics'    && <AnalyticsPage        sessionId={sessionId} onSessionExpired={onSessionExpired} />}
        {active === 'bandwidth'    && <BandwidthPage        sessionId={sessionId} onSessionExpired={onSessionExpired} />}
        {active === 'insights'     && <InsightsPage         sessionId={sessionId} onSessionExpired={onSessionExpired} />}
        {active === 'utility-rate' && <UtilityRatePage      sessionId={sessionId} onSessionExpired={onSessionExpired} />}
        {active === 'extras'       && <DashboardExtrasPage  sessionId={sessionId} onSessionExpired={onSessionExpired} />}
      </div>

    </div>
  )
}

function FlagIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
}
function ChartIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg>
}
function BoltIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
}
function SparklesIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3L13.5 8.5L19 10L13.5 11.5L12 17L10.5 11.5L5 10L10.5 8.5Z"/><path d="M19 3L19.75 5.25L22 6L19.75 6.75L19 9L18.25 6.75L16 6L18.25 5.25Z"/><path d="M5 17L5.5 18.5L7 19L5.5 19.5L5 21L4.5 19.5L3 19L4.5 18.5Z"/></svg>
}
function GaugeIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10"/><path d="M12 16V12"/><path d="M8 12H4"/><path d="M16 12h-1"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg>
}
function GridIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
}
