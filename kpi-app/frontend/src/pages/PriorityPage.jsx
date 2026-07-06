import { useEffect, useState } from 'react'
import { getOverview } from '../api'
import PriorityTracker from '../components/PriorityTracker'

export default function PriorityPage({ sessionId, onSessionExpired }) {
  const [overview, setOverview] = useState(null)

  useEffect(() => {
    getOverview(sessionId)
      .then(setOverview)
      .catch((err) => { if (err.sessionExpired) onSessionExpired() })
  }, [sessionId, onSessionExpired])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#141414', margin: 0 }}>Priority Tracker</h2>
        <p style={{ fontSize: 13, color: '#9c9c9c', margin: '3px 0 0' }}>
          Ranked by SLA urgency · preferred live date · ticket age. Excludes Closed Completed &amp; Closed Rejected.
        </p>
      </div>
      <PriorityTracker sessionId={sessionId} onSessionExpired={onSessionExpired} overview={overview} />
    </div>
  )
}
