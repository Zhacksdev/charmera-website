'use client'

import { useEffect, useState } from 'react'
import { adminFetch, adminSend, errorMessage } from '../../../lib/supabase'
import { defaultPattern, detectPattern, renumberSlots, shotCount, type LayoutSlot, type SlotPattern } from '../../../lib/slot-numbering'
import { TextAreaEditor, type TextArea } from '../../../components/TextAreaEditor'

interface Frame {
  id: string
  name: string
  orientation: string
  extra_price: number
  is_active: boolean
  sort_order: number
  slot_count?: number
  canvas_w?: number
  canvas_h?: number
  image_url?: string | null
  layout?: { slots?: LayoutSlot[]; text_area?: TextArea; canvas?: { w: number; h: number }; [key: string]: unknown }
}

export default function FramesPage() {
  const [frames, setFrames] = useState<Frame[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [editingText, setEditingText] = useState<Frame | null>(null)
  const [savingText, setSavingText] = useState(false)

  const handleSaveTextArea = async (frame: Frame, layout: { slots: LayoutSlot[]; text_area?: TextArea }) => {
    setSavingText(true)
    try {
      // text_area kosong = dihapus (JSON.stringify membuang undefined)
      await adminSend(`/api/admin/frames/${frame.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ layout: { ...frame.layout, slots: layout.slots, text_area: layout.text_area } })
      })
      setEditingText(null)
      fetchFrames()
    } catch (err) {
      alert(`Gagal menyimpan area teks: ${errorMessage(err, 'unknown')}`)
    } finally {
      setSavingText(false)
    }
  }

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
    const input = e.target
    const file = input.files?.[0]
    if (!file) return
    
    setUploading(true)
    
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve((reader.result as string).split(',')[1])
        reader.onerror = () => reject(new Error('File tidak bisa dibaca'))
        reader.readAsDataURL(file)
      })

      const analysis = await adminSend('/api/admin/frames/analyze', {
        method: 'POST',
        body: JSON.stringify({ image: base64 })
      })

      if (!analysis.slots?.length) {
        throw new Error('Tidak ada slot hijau terdeteksi di frame ini')
      }

      // simpan frame: PNG keyed (slot transparan) diunggah ke storage lalu ditarik booth
      await adminSend('/api/admin/frames', {
        method: 'POST',
        body: JSON.stringify({
          name: file.name.replace(/\.[^.]+$/, ''),
          orientation: analysis.orientation,
          canvas_w: analysis.canvas?.w,
          canvas_h: analysis.canvas?.h,
          // frame berisi beberapa strip sama panjang: foto 1 2 3 diulang tiap strip (1 2 3 · 1 2 3)
          layout: { ...analysis.layout, slots: renumberSlots(analysis.layout.slots, defaultPattern(analysis.layout.slots)) },
          sort_order: frames.length,
          image_base64: analysis.keyed_preview
        })
      })

      alert(`Frame tersimpan: ${analysis.slots.length} slot terdeteksi, ${shotCount(renumberSlots(analysis.layout.slots, defaultPattern(analysis.layout.slots)))} foto per sesi`)
      fetchFrames()
    } catch (err) {
      console.error('Upload failed:', err)
      alert(`Upload gagal: ${errorMessage(err, 'unknown')}`)
    } finally {
      setUploading(false)
      input.value = ''
    }
  }

  const handleSlotPattern = async (frame: Frame, pattern: SlotPattern) => {
    const slots = frame.layout?.slots
    if (!slots?.length) return
    try {
      await adminSend(`/api/admin/frames/${frame.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ layout: { ...frame.layout, slots: renumberSlots(slots, pattern) } })
      })
      fetchFrames()
    } catch (err) {
      alert(`Gagal mengubah urutan foto: ${errorMessage(err, 'unknown')}`)
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
                  {frame.orientation} · {frame.slot_count || '?'} slot · {frame.layout?.slots?.length ? shotCount(frame.layout.slots) : '?'} foto
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
            
            {(frame.layout?.slots?.length ?? 0) > 1 && (
              <div className="mb-3">
                <p className="text-xs font-semibold text-char opacity-75 mb-1">Urutan foto di slot</p>
                <div className="flex gap-2">
                  {([
                    { pattern: 'per_column', label: '1 2 3 · 1 2 3', hint: 'Foto sama di tiap strip' },
                    { pattern: 'per_slot', label: '1 – ' + frame.layout!.slots!.length, hint: 'Foto berbeda tiap slot' },
                  ] as const).map(({ pattern, label, hint }) => {
                    const active = detectPattern(frame.layout!.slots!) === pattern
                    return (
                      <button
                        key={pattern}
                        onClick={() => !active && handleSlotPattern(frame, pattern)}
                        title={hint}
                        className={`flex-1 rounded px-2 py-1 text-xs ${active ? 'bg-cherry text-cream' : 'bg-line text-char'}`}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-xs text-char opacity-75">
                Custom text: {frame.layout?.text_area ? 'ada' : 'tidak ada (tamu tidak diminta mengisi)'}
              </p>
              <button
                onClick={() => setEditingText(frame)}
                disabled={!frame.image_url || !frame.layout?.slots?.length}
                title={frame.image_url ? undefined : 'Gambar frame belum tersedia (storage belum dikonfigurasi)'}
                className="rounded bg-line px-2 py-1 text-xs text-char"
                style={{ minHeight: 0 }}
              >
                Atur area teks
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

      {editingText?.image_url && editingText.layout?.slots && (
        <TextAreaEditor
          imageUrl={editingText.image_url}
          canvas={editingText.layout.canvas || { w: editingText.canvas_w || 1200, h: editingText.canvas_h || 1800 }}
          slots={editingText.layout.slots}
          textArea={editingText.layout.text_area}
          saving={savingText}
          onSave={(layout) => handleSaveTextArea(editingText, layout)}
          onCancel={() => setEditingText(null)}
        />
      )}
    </div>
  )
}
