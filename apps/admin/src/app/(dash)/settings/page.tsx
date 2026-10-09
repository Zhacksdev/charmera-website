'use client'

import { useEffect, useState } from 'react'
import { adminFetch } from '../../../lib/supabase'

export default function SettingsPage() {
  const [retentionDays, setRetentionDays] = useState(30)
  const [homeText, setHomeText] = useState('Wear your memories.')
  const [closingText, setClosingText] = useState('Momen kamu, jadi charm kamu.')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function fetchSettings() {
      try {
        const res = await adminFetch('/api/admin/settings')
        if (res.ok) {
          const data = await res.json()
          if (data.retention_days) setRetentionDays(data.retention_days)
          if (data.home_text) setHomeText(data.home_text)
          if (data.closing_text) setClosingText(data.closing_text)
        }
      } catch (err) {
        console.error('Failed to fetch settings:', err)
      } finally {
        setLoading(false)
      }
    }
    
    fetchSettings()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await adminFetch('/api/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          retention_days: retentionDays,
          home_text: homeText,
          closing_text: closingText
        })
      })
      alert('Settings saved')
    } catch (err) {
      console.error('Failed to save:', err)
      alert('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="text-char opacity-75">Loading...</div>
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Pengaturan</h1>
      
      <div className="card max-w-md">
        <div className="mb-4">
          <label className="block text-sm font-semibold mb-1">
            Retensi File (hari)
          </label>
          <input
            type="number"
            min={1}
            max={90}
            value={retentionDays}
            onChange={(e) => setRetentionDays(parseInt(e.target.value))}
            className="w-full px-3 py-2 border border-line rounded-lg"
          />
        </div>
        
        <div className="mb-4">
          <label className="block text-sm font-semibold mb-1">
            Teks Home
          </label>
          <input
            type="text"
            value={homeText}
            onChange={(e) => setHomeText(e.target.value)}
            className="w-full px-3 py-2 border border-line rounded-lg"
          />
        </div>
        
        <div className="mb-4">
          <label className="block text-sm font-semibold mb-1">
            Teks Closing
          </label>
          <input
            type="text"
            value={closingText}
            onChange={(e) => setClosingText(e.target.value)}
            className="w-full px-3 py-2 border border-line rounded-lg"
          />
        </div>
        
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-cherry text-cream px-6 py-3 rounded-lg font-semibold disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Simpan'}
        </button>
      </div>
    </div>
  )
}
