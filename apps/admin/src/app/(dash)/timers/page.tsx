'use client'

import { useEffect, useState } from 'react'
import { adminFetch } from '../../../lib/supabase'

interface Timers {
  frame: number
  action: number
  preview: number
  qr: number
  closing: number
  countdown: number
  max_retake: number
}

export default function TimersPage() {
  const [timers, setTimers] = useState<Timers>({
    frame: 30,
    action: 120,
    preview: 45,
    qr: 15,
    closing: 5,
    countdown: 5,
    max_retake: 3
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function fetchTimers() {
      try {
        const res = await adminFetch('/api/admin/settings')
        if (res.ok) {
          const data = await res.json()
          if (data.timers) {
            setTimers(data.timers)
          }
        }
      } catch (err) {
        console.error('Failed to fetch timers:', err)
      } finally {
        setLoading(false)
      }
    }
    
    fetchTimers()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await adminFetch('/api/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify({ timers })
      })
      alert('Timer settings saved')
    } catch (err) {
      console.error('Failed to save:', err)
      alert('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const timerFields = [
    { key: 'frame', label: 'Pilih Frame (detik)' },
    { key: 'action', label: 'Action / Foto (detik)' },
    { key: 'preview', label: 'Preview (detik)' },
    { key: 'qr', label: 'QR Display (detik)' },
    { key: 'closing', label: 'Closing (detik)' },
    { key: 'countdown', label: 'Countdown Foto (detik)' },
    { key: 'max_retake', label: 'Max Retake' },
  ]

  if (loading) {
    return <div className="text-char opacity-75">Loading...</div>
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Timer</h1>
      
      <div className="card max-w-md">
        {timerFields.map((field) => (
          <div key={field.key} className="mb-4">
            <label className="block text-sm font-semibold mb-1">
              {field.label}
            </label>
            <input
              type="number"
              min={field.key === 'countdown' ? 3 : 1}
              max={field.key === 'countdown' ? 8 : undefined}
              value={timers[field.key as keyof Timers]}
              onChange={(e) => setTimers({ 
                ...timers, 
                [field.key]: parseInt(e.target.value) || 0 
              })}
              className="w-full px-3 py-2 border border-line rounded-lg"
            />
          </div>
        ))}
        
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
