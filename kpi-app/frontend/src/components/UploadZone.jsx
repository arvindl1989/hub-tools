import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { uploadFile, uploadFromSheetUrl } from '../api'

const SHEET_URL_KEY = 'aegis_sheet_url'

export default function UploadZone({ onUpload }) {
  const [uploading, setUploading]   = useState(false)
  const [progress,  setProgress]    = useState(0)
  const [error,     setError]       = useState(null)
  const [mode,      setMode]        = useState('file') // 'file' | 'sheet'
  const [sheetUrl,  setSheetUrl]    = useState(() => localStorage.getItem(SHEET_URL_KEY) || '')

  const run = useCallback(async (fn) => {
    setError(null)
    setUploading(true)
    setProgress(0)
    try {
      const result = await fn(setProgress)
      onUpload(result)
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Failed')
    } finally {
      setUploading(false)
    }
  }, [onUpload])

  const onDrop = useCallback((accepted) => {
    const file = accepted[0]
    if (!file) return
    run((prog) => uploadFile(file, prog))
  }, [run])

  const connectSheet = () => {
    if (!sheetUrl.trim()) { setError('Paste your Apps Script URL first.'); return }
    localStorage.setItem(SHEET_URL_KEY, sheetUrl.trim())
    run((prog) => uploadFromSheetUrl(sheetUrl.trim(), prog))
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
    },
    maxFiles: 1,
    disabled: uploading || mode !== 'file',
  })

  const blue = '#1450f5'
  const blueFaint = 'rgba(20,80,245,0.08)'

  return (
    <div style={{ width: '100%', maxWidth: 540 }}>

      {/* Logo */}
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div style={{
          width: 52, height: 52, borderRadius: 14,
          background: '#1450f5',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 16px',
          boxShadow: '0 4px 14px rgba(20,80,245,0.3)',
        }}>
          <span style={{ color: '#fff', fontSize: 18, fontWeight: 800, letterSpacing: '-0.5px' }}>IQ</span>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#141414', margin: '0 0 6px', letterSpacing: '-0.3px' }}>TicketIQ</h1>
        <p style={{ fontSize: 14, color: '#6e6e6e', margin: 0 }}>Connect your ticket data to get started</p>
      </div>

      {/* Mode toggle */}
      <div style={{
        display: 'flex', background: '#f1ede3', borderRadius: 10,
        padding: 3, marginBottom: 20, gap: 3,
      }}>
        {[['file', '⬆ Upload Excel'], ['sheet', '⚡ Google Sheet']].map(([m, label]) => (
          <button key={m} onClick={() => { setMode(m); setError(null) }} disabled={uploading} style={{
            flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: 600, fontFamily: 'Inter, sans-serif',
            background: mode === m ? '#ffffff' : 'transparent',
            color: mode === m ? blue : '#6e6e6e',
            boxShadow: mode === m ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
            transition: 'all 0.15s',
          }}>{label}</button>
        ))}
      </div>

      {/* Loading state (shared) */}
      {uploading ? (
        <div style={{
          border: '2px dashed #d8d8d8', borderRadius: 16,
          padding: '40px 32px', textAlign: 'center', background: '#fff',
        }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: blueFaint, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={blue} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
          </div>
          <p style={{ fontSize: 14, color: '#404040', fontWeight: 500, marginBottom: 12 }}>
            {mode === 'sheet' ? 'Fetching & processing sheet…' : 'Processing your file…'}
          </p>
          <div style={{ height: 6, background: '#e8e2d6', borderRadius: 99, overflow: 'hidden', marginBottom: 6 }}>
            <div style={{ height: '100%', background: blue, borderRadius: 99, width: `${progress}%`, transition: 'width 0.3s' }} />
          </div>
          <p style={{ fontSize: 12, color: '#9c9c9c' }}>{progress}%</p>
        </div>
      ) : mode === 'file' ? (
        /* ── File upload ── */
        <div {...getRootProps()} style={{
          border: `2px dashed ${isDragActive ? blue : '#d8d8d8'}`,
          borderRadius: 16, padding: '40px 32px', textAlign: 'center',
          cursor: 'pointer',
          background: isDragActive ? blueFaint : '#ffffff',
          transition: 'all 0.2s',
          boxShadow: isDragActive ? `0 0 0 4px rgba(20,80,245,0.1)` : 'none',
        }}>
          <input {...getInputProps()} />
          <div style={{
            width: 56, height: 56, borderRadius: 14,
            background: isDragActive ? '#dbe6fd' : '#f1ede3',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 18px', transition: 'background 0.2s',
          }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={isDragActive ? blue : '#6e6e6e'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="12" y1="18" x2="12" y2="12"/>
              <line x1="9" y1="15" x2="15" y2="15"/>
            </svg>
          </div>
          <p style={{ fontSize: 15, fontWeight: 600, color: '#141414', marginBottom: 6 }}>
            {isDragActive ? 'Drop your file here' : 'Drag & drop your Excel file'}
          </p>
          <p style={{ fontSize: 13, color: '#6e6e6e', marginBottom: 20 }}>
            or <span style={{ color: blue, fontWeight: 500, textDecoration: 'underline', cursor: 'pointer' }}>browse to upload</span> · .xlsx / .xls
          </p>
          <div style={{ background: '#faf8f3', border: '1px solid #e8e2d6', borderRadius: 10, padding: '12px 16px', textAlign: 'left' }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: '#6e6e6e', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Expected columns</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 8px' }}>
              {['Number', 'Assigned to', 'State', 'Created', 'Sub-Category', 'Area', 'Team'].map(col => (
                <span key={col} style={{ fontSize: 11, color: '#404040', background: '#fff', border: '1px solid #e8e2d6', borderRadius: 4, padding: '2px 6px' }}>{col}</span>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* ── Google Sheet ── */
        <div style={{ border: '2px solid #e8e2d6', borderRadius: 16, padding: '28px 28px', background: '#fff' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, background: blueFaint, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={blue} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
              </svg>
            </div>
            <div>
              <p style={{ fontSize: 14, fontWeight: 600, color: '#141414', margin: 0 }}>Connect via Google Apps Script</p>
              <p style={{ fontSize: 12, color: '#6e6e6e', margin: 0 }}>Uses the same URL already saved in Email Tracker</p>
            </div>
          </div>

          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6e6e6e', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
            Apps Script Web App URL
          </label>
          <input
            type="url"
            value={sheetUrl}
            onChange={e => setSheetUrl(e.target.value)}
            placeholder="https://script.google.com/macros/s/…/exec"
            style={{
              width: '100%', padding: '10px 12px', border: '1px solid #e8e2d6',
              borderRadius: 8, fontSize: 13, fontFamily: 'Inter, sans-serif',
              color: '#141414', outline: 'none', marginBottom: 14,
              background: '#faf8f3',
            }}
            onFocus={e => e.target.style.borderColor = blue}
            onBlur={e => e.target.style.borderColor = '#e8e2d6'}
          />

          <button onClick={connectSheet} style={{
            width: '100%', padding: '11px', borderRadius: 9, border: 'none',
            background: blue, color: '#fff', fontSize: 14, fontWeight: 600,
            fontFamily: 'Inter, sans-serif', cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(20,80,245,0.35)',
            transition: 'filter 0.15s',
          }}
            onMouseEnter={e => e.currentTarget.style.filter = 'brightness(1.1)'}
            onMouseLeave={e => e.currentTarget.style.filter = 'none'}
          >
            Load from Sheet
          </button>

          <p style={{ fontSize: 11, color: '#9c9c9c', textAlign: 'center', marginTop: 12, marginBottom: 0 }}>
            URL is saved locally and shared with the Email Tracker
          </p>
        </div>
      )}

      {error && (
        <div style={{
          marginTop: 16, padding: '12px 16px',
          background: '#fff0f3', border: '1px solid #ffcdd7',
          borderRadius: 10, fontSize: 13, color: '#c0305a',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          {error}
        </div>
      )}
    </div>
  )
}
