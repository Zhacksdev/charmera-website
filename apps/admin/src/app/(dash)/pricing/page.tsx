'use client'

import { useEffect, useState } from 'react'
import { adminFetch } from '../../../lib/supabase'

interface Settings {
  base_price: number
  config_version: number
  output_mode: 'photo_only' | 'full'
  print_mode: 'digital_only' | 'local' | 'custom_api'
}

export default function PricingPage() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function fetchSettings() {
      try {
        const res = await adminFetch('/api/admin/settings')
        if (res.ok) {
          const data = await res.json()
          setSettings(data)
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
    if (!settings) return
    setSaving(true)
    
    try {
      await adminFetch('/api/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify(settings)
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
      <h1 className="text-2xl font-bold mb-6">Harga</h1>
      
      <div className="card max-w-md">
        <div className="mb-4">
          <label className="block text-sm font-semibold mb-1">
            Harga Dasar per Sesi (Rp)
          </label>
          <input
            type="number"
            value={settings?.base_price || 0}
            onChange={(e) => setSettings({ ...settings!, base_price: parseInt(e.target.value) })}
            className="w-full px-3 py-2 border border-line rounded-lg"
          />
        </div>
        
        <div className="mb-4">
          <label className="block text-sm font-semibold mb-1">
            Mode Output
          </label>
          <select
            value={settings?.output_mode || 'photo_only'}
            onChange={(e) => setSettings({ ...settings!, output_mode: e.target.value as any })}
            className="w-full px-3 py-2 border border-line rounded-lg"
          >
            <option value="photo_only">Strip saja</option>
            <option value="full">Strip + GIF + Live</option>
          </select>
        </div>
        
        <div className="mb-4">
          <label className="block text-sm font-semibold mb-1">
            Mode Print
          </label>
          <select
            value={settings?.print_mode || 'digital_only'}
            onChange={(e) => setSettings({ ...settings!, print_mode: e.target.value as any })}
            className="w-full px-3 py-2 border border-line rounded-lg"
          >
            <option value="digital_only">Digital saja</option>
            <option value="local">Printer lokal</option>
            <option value="custom_api">Custom API</option>
          </select>
        </div>
        
        <div className="text-sm text-char opacity-50 mb-4">
          Config Version: {settings?.config_version}
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
