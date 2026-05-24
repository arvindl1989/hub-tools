import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { uploadFile } from '../api'

export default function UploadZone({ onUpload }) {
  const [uploading, setUploading] = useState(false)
  const [progress,  setProgress]  = useState(0)
  const [error,     setError]     = useState(null)

  const onDrop = useCallback(async (accepted) => {
    const file = accepted[0]
    if (!file) return
    setError(null)
    setUploading(true)
    setProgress(0)
    try {
      const result = await uploadFile(file, setProgress)
      onUpload(result)
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }, [onUpload])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
    },
    maxFiles: 1,
    disabled: uploading,
  })

  return (
    <div style={{ width: '100%', maxWidth: 520 }}>

      {/* Logo + headline above the drop zone */}
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{
          width: 52, height: 52, borderRadius: 14,
          background: 'linear-gradient(135deg, #1450f5 0%, #3b70f7 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 16px',
          boxShadow: '0 4px 14px rgba(20,80,245,0.3)',
        }}>
          <span style={{ color: '#fff', fontSize: 18, fontWeight: 800, letterSpacing: '-0.5px' }}>IQ</span>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: '0 0 6px', letterSpacing: '-0.3px' }}>TicketIQ</h1>
        <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>Upload your ticket export to get started</p>
      </div>

      {/* Drop zone */}
      <div
        {...getRootProps()}
        style={{
          border: `2px dashed ${isDragActive ? '#1450f5' : '#d1d5db'}`,
          borderRadius: 16,
          padding: '40px 32px',
          textAlign: 'center',
          cursor: uploading ? 'not-allowed' : 'pointer',
          background: isDragActive ? '#eff4ff' : '#ffffff',
          transition: 'all 0.2s',
          boxShadow: isDragActive ? '0 0 0 4px rgba(20,80,245,0.1)' : 'none',
          opacity: uploading ? 0.7 : 1,
        }}
      >
        <input {...getInputProps()} />

        {uploading ? (
          <div>
            <div style={{
              width: 48, height: 48, borderRadius: '50%',
              background: '#eff4ff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px',
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1450f5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            </div>
            <p style={{ fontSize: 14, color: '#374151', fontWeight: 500, marginBottom: 12 }}>Processing your file…</p>
            <div style={{ height: 6, background: '#e5e7eb', borderRadius: 99, overflow: 'hidden', marginBottom: 6 }}>
              <div style={{ height: '100%', background: '#1450f5', borderRadius: 99, width: `${progress}%`, transition: 'width 0.3s' }} />
            </div>
            <p style={{ fontSize: 12, color: '#9ca3af' }}>{progress}%</p>
          </div>
        ) : (
          <div>
            <div style={{
              width: 56, height: 56, borderRadius: 14,
              background: isDragActive ? '#dbeafe' : '#f3f4f6',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 18px',
              transition: 'background 0.2s',
            }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={isDragActive ? '#1450f5' : '#6b7280'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="12" y1="18" x2="12" y2="12"/>
                <line x1="9" y1="15" x2="15" y2="15"/>
              </svg>
            </div>

            <p style={{ fontSize: 15, fontWeight: 600, color: '#111827', marginBottom: 6 }}>
              {isDragActive ? 'Drop your file here' : 'Drag & drop your Excel file'}
            </p>
            <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>
              or{' '}
              <span style={{ color: '#1450f5', fontWeight: 500, textDecoration: 'underline', cursor: 'pointer' }}>
                browse to upload
              </span>
              {' '}· .xlsx / .xls
            </p>

            <div style={{
              background: '#f9fafb', border: '1px solid #e5e7eb',
              borderRadius: 10, padding: '12px 16px', textAlign: 'left',
            }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                Expected columns
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 8px' }}>
                {['Ticket Number', 'Assigned To', 'State', 'Created Date', 'Sub Category', 'Area', 'Team'].map((col) => (
                  <span key={col} style={{
                    fontSize: 11, color: '#374151', background: '#fff',
                    border: '1px solid #e5e7eb', borderRadius: 4, padding: '2px 6px',
                  }}>{col}</span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div style={{
          marginTop: 16, padding: '12px 16px',
          background: '#fff0f4', border: '1px solid #ffcdd7',
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
