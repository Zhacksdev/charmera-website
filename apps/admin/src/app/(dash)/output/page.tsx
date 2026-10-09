'use client'

import { useEffect, useState } from 'react'
import { adminFetch } from '../../../lib/supabase'

export default function OutputPage() {
  const [outputMode, setOutputMode] = useState<'photo_only' | 'full'>('full')
  const [gifDuration, setGifDuration] = useState(800)
  const [clipSec, setClipSec] = useState(5)
  const [codec, setCodec] = useState<'h265' | 'h264'>('h265')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function fetchOutput() {
      try {
        const res = await adminFetch('/api/admin/settings')
        if (res.ok) {
          const data = await res.json()
          if (data.output_mode) setOutputMode(data.output_mode)
          if (data.gif_config?.frame_duration_ms) setGifDuration(data.gif_config.frame_duration_ms)
          if (data.live_config?.clip_sec) setClipSec(data.live_config.clip_sec)
          if (data.live_config?.codec) setCodec(data.live_config.codec)
        }
      } catch (err) {
        console.error('Failed to fetch output settings:', err)
      } finally {
        setLoading(false)
      }
    }
    
    fetchOutput()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await adminFetch('/api/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          output_mode: outputMode,
          gif_config: { frame_duration_ms: gifDuration },
          live_config: { clip_sec: clipSec, codec }
        })
      })
      alert('Output settings saved')
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
      <h1 className="text-2xl font-bold mb-6">Output</h1>
      
      <div className="card max-w-md">
        <div className="mb-4">
          <label className="block text-sm font-semibold mb-1">Mode Output</label>
          <select
            value={outputMode}
            onChange={(e) => setOutputMode(e.target.value as any)}
            className="w-full px-3 py-2 border border-line rounded-lg"
          >
            <option value="photo_only">Strip saja</option>
            <option value="full">Strip + GIF + Live Photo</option>
          </select>
        </div>
        
        <div className="mb-4">
          <label className="block text-sm font-semibold mb-1">
            Durasi GIF per frame (ms)
          </label>
          <input
            type="number"
            value={gifDuration}
            onChange={(e) => setGifDuration(parseInt(e.target.value))}
            className="w-full px-3 py-2 border border-line rounded-lg"
          />
        </div>
        
        <div className="mb-4">
          <label className="block text-sm font-semibold mb-1">
            Durasi Klip Live Photo (detik)
          </label>
          <input
            type="number"
            min={3}
            max={10}
            value={clipSec}
            onChange={(e) => setClipSec(parseInt(e.target.value))}
            className="w-full px-3 py-2 border border-line rounded-lg"
          />
        </div>
        
        <div className="mb-4">
          <label className="block text-sm font-semibold mb-1">Codec Live Photo</label>
          <select
            value={codec}
            onChange={(e) => setCodec(e.target.value as any)}
            className="w-full px-3 py-2 border border-line rounded-lg"
          >
            <option value="h265">H.265 (lebih kecil, butuh preview H.264)</option>
            <option value="h264">H.264 saja (lebih kompatibel)</option>
          </select>
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
