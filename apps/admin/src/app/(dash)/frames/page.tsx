'use client'

import { useEffect, useState } from 'react'
import { adminFetch } from '../../../lib/supabase'

interface Frame {
  id: string
  name: string
  orientation: string
  extra_price: number
  is_active: boolean
  sort_order: number
  slot_count?: number
}

export default function FramesPage() {
  const [frames, setFrames] = useState<Frame[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    fetchFrames()
  }, [])

  async function fetchFrames() {
    try {
      const res = await adminFetch('/api/admin/frames')
      if (res.ok) {
        const data = await res.json()
        setFrames(data)
      }
    } catch (err) {
      console.error('Failed to fetch frames:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    setUploading(true)
    
    try {
      const reader = new FileReader()
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1]
        
        const analyzeRes = await adminFetch('/api/admin/frames/analyze', {
          method: 'POST',
          body: JSON.stringify({ image: base64 })
        })
        
        if (analyzeRes.ok) {
          const analysis = await analyzeRes.json()
          alert(`Frame analyzed! ${analysis.slots.length} slots detected`)
          fetchFrames()
        } else {
          alert('Failed to analyze frame')
        }
      }
      reader.readAsDataURL(file)
    } catch (err) {
      console.error('Upload failed:', err)
      alert('Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleToggleActive = async (frame: Frame) => {
    try {
      await adminFetch(`/api/admin/frames/${frame.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !frame.is_active })
      })
      fetchFrames()
    } catch (err) {
      console.error('Failed to toggle frame:', err)
    }
  }

  if (loading) {
    return <div className="text-char opacity-75">Loading...</div>
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Frame</h1>
        <label className="bg-cherry text-cream px-4 py-2 rounded-lg cursor-pointer">
          {uploading ? 'Uploading...' : 'Upload Frame'}
          <input
            type="file"
            accept="image/png"
            onChange={handleUpload}
            className="hidden"
            disabled={uploading}
          />
        </label>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {frames.map((frame) => (
          <div key={frame.id} className="card">
            <div className="flex justify-between items-start mb-3">
              <div>
                <h3 className="font-bold">{frame.name}</h3>
                <p className="text-sm text-char opacity-75">
                  {frame.orientation} · {frame.slot_count || '?'} slot
                </p>
              </div>
              <button
                onClick={() => handleToggleActive(frame)}
                className={`px-3 py-1 text-xs rounded ${
                  frame.is_active ? 'bg-sky text-char' : 'bg-line text-char'
                }`}
              >
                {frame.is_active ? 'Aktif' : 'Nonaktif'}
              </button>
            </div>
            
            {frame.extra_price > 0 && (
              <p className="text-sm text-cherry font-semibold">
                +Rp {frame.extra_price.toLocaleString('id-ID')}
              </p>
            )}
          </div>
        ))}
        
        {frames.length === 0 && (
          <div className="col-span-full text-center py-12 text-char opacity-50">
            Belum ada frame. Upload frame green screen untuk mulai.
          </div>
        )}
      </div>
    </div>
  )
}
