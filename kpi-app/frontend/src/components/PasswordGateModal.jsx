import { useState } from 'react'

export default function PasswordGateModal({ onSubmit, onCancel }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState(false)

  const submit = (e) => {
    e.preventDefault()
    if (onSubmit(value)) return
    setError(true)
    setValue('')
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(20,20,20,0.45)', zIndex: 60,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <form onSubmit={submit} style={{
        background: '#fff', borderRadius: 16, boxShadow: '0 20px 50px rgba(20,20,20,0.25)',
        width: '100%', maxWidth: 360, padding: 28,
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: 10, background: '#eef3fe',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1450f5', marginBottom: 14,
        }}>
          <LockIcon />
        </div>
        <h2 style={{ fontSize: 16, fontWeight: 800, color: '#141414', margin: 0 }}>Experimental Reports</h2>
        <p style={{ fontSize: 12.5, color: '#6e6e6e', margin: '6px 0 16px' }}>
          This section is password-protected. Enter the password to continue.
        </p>

        <input
          type="password"
          autoFocus
          value={value}
          onChange={(e) => { setValue(e.target.value); setError(false) }}
          placeholder="Password"
          style={{
            width: '100%', height: 38, padding: '0 12px', fontSize: 13,
            border: `1px solid ${error ? '#c0305a' : '#e8e2d6'}`, borderRadius: 8, outline: 'none',
            fontFamily: 'Inter, sans-serif', boxSizing: 'border-box',
          }}
        />
        {error && (
          <p style={{ fontSize: 11.5, color: '#c0305a', margin: '6px 0 0' }}>Incorrect password — try again.</p>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              flex: 1, height: 36, borderRadius: 8, border: '1px solid #e8e2d6', background: '#fff',
              color: '#6e6e6e', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif',
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            style={{
              flex: 1, height: 36, borderRadius: 8, border: 'none', background: '#1450f5',
              color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, sans-serif',
            }}
          >
            Unlock
          </button>
        </div>
      </form>
    </div>
  )
}

function LockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
    </svg>
  )
}
