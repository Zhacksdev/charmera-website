'use client'

import { useEffect, useState } from 'react'
import { adminFetch } from '../../../lib/supabase'

export default function CameraPage() {
  const [camera, setCamera] = useState({
    width: 1920,
    height: 1080,
    mirror_preview: true
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function fetchCamera() {
      try {
        const res = await adminFetch('/api/admin/settings')
        if (res.ok) {
          const data = await res.json()
          if (data.camera) setCamera(data.camera)
        }
      } catch (err) {
        console.error('Failed to fetch camera settings:', err)
      } finally {
        setLoading(false)
      }
    }
    
    fetchCamera()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await adminFetch('/api/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify({ camera })
      })
      alert('Camera settings saved')
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
      <h1 className="text-2xl font-bold mb-6">Kamera</h1>
      
      <div className="card max-w-md">
        <div className="mb-4">
          <label className="block text-sm font-semibold mb-1">Resolusi Lebar</label>
          <input
            type="number"
            value={camera.width}
            onChange={(e) => setCamera({ ...camera, width: parseInt(e.target.value) })}
            className="w-full px-3 py-2 border border-line rounded-lg"
          />
        </div>
        
        <div className="mb-4">
          <label className="block text-sm font-semibold mb-1">Resolusi Tinggi</label>
          <input
            type="number"
            value={camera.height}
            onChange={(e) => setCamera({ ...camera, height: parseInt(e.target.value) })}
            className="w-full px-3 py-2 border border-line rounded-lg"
          />
        </div>
        
        <div className="mb-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={camera.mirror_preview}
              onChange={(e) => setCamera({ ...camera, mirror_preview: e.target.checked })}
            />
            <span className="text-sm">Mirror preview (tidak mempengaruhi hasil)</span>
          </label>
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
