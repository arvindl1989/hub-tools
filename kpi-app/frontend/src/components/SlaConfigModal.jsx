import { useEffect, useState } from 'react'
import { getSlaRules, updateSlaRules } from '../api'

export default function SlaConfigModal({ onClose }) {
  const [rules, setRules] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    getSlaRules().then(setRules).catch(() => {})
  }, [])

  const handleChange = (key, val) => {
    setRules((r) => ({ ...r, [key]: parseInt(val, 10) || 0 }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateSlaRules(rules)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-800">SLA Configuration</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        {!rules ? (
          <p className="text-gray-400 text-sm">Loading…</p>
        ) : (
          <div className="space-y-3">
            {Object.entries(rules).map(([key, days]) => (
              <div key={key} className="flex items-center gap-3">
                <label className="flex-1 text-sm text-gray-700">{key}</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={1}
                    value={days}
                    onChange={(e) => handleChange(key, e.target.value)}
                    className="w-16 border border-gray-200 rounded-lg px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <span className="text-xs text-gray-400">days</span>
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-gray-400 mt-4">
          Changes apply to new uploads only. Re-upload your file to recalculate SLA dates.
        </p>

        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={handleSave} disabled={saving || !rules} className="btn-primary">
            {saved ? '✓ Saved' : saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
