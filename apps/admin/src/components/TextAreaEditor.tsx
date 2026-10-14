'use client'

import { useRef, useState } from 'react'
import type { LayoutSlot } from '../lib/slot-numbering'

export interface TextArea {
  x: number
  y: number
  w: number
  h: number
}

interface Props {
  imageUrl: string
  canvas: { w: number; h: number }
  slots: LayoutSlot[]
  textArea?: TextArea
  saving: boolean
  onSave: (layout: { slots: LayoutSlot[]; text_area?: TextArea }) => void
  onCancel: () => void
}

// kotak teks terlalu kecil tidak terbaca di cetakan 4R
const MIN_SIZE = 40

/**
 * Atur area custom text sebuah frame: gambar kotak langsung di atas frame, atau jadikan salah satu
 * kotak hijau (slot terdeteksi) sebagai area teks. Tanpa area teks, kiosk tidak menampilkan isian custom text.
 */
export function TextAreaEditor({ imageUrl, canvas, slots: initialSlots, textArea: initialArea, saving, onSave, onCancel }: Props) {
  const [slots, setSlots] = useState(initialSlots)
  const [textArea, setTextArea] = useState<TextArea | undefined>(initialArea)
  const [draft, setDraft] = useState<TextArea | null>(null)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  const pct = (r: TextArea | LayoutSlot) => ({
    left: `${r.x / canvas.w * 100}%`,
    top: `${r.y / canvas.h * 100}%`,
    width: `${r.w / canvas.w * 100}%`,
    height: `${r.h / canvas.h * 100}%`,
  })

  // posisi pointer → koordinat kanvas frame (px asli)
  const toCanvas = (event: React.PointerEvent) => {
    const rect = boxRef.current!.getBoundingClientRect()
    return {
      x: Math.round(Math.min(Math.max(event.clientX - rect.left, 0), rect.width) / rect.width * canvas.w),
      y: Math.round(Math.min(Math.max(event.clientY - rect.top, 0), rect.height) / rect.height * canvas.h),
    }
  }

  const onPointerDown = (event: React.PointerEvent) => {
    if ((event.target as HTMLElement).closest('[data-slot]')) return
    event.currentTarget.setPointerCapture(event.pointerId)
    startRef.current = toCanvas(event)
    setDraft({ ...startRef.current, w: 0, h: 0 })
  }

  const onPointerMove = (event: React.PointerEvent) => {
    if (!startRef.current) return
    const p = toCanvas(event)
    const s = startRef.current
    setDraft({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) })
  }

  const onPointerUp = () => {
    if (draft && draft.w >= MIN_SIZE && draft.h >= MIN_SIZE) setTextArea(draft)
    startRef.current = null
    setDraft(null)
  }

  // kotak hijau yang ternyata dimaksudkan untuk teks: keluarkan dari slot foto
  const slotToTextArea = (index: number) => {
    const slot = slots[index]
    if (textArea && !window.confirm('Ganti area teks yang sudah ada dengan kotak ini?')) return
    setSlots(slots.filter((_, i) => i !== index))
    setTextArea({ x: slot.x, y: slot.y, w: slot.w, h: slot.h })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-char/60 p-4" role="dialog" aria-modal="true" aria-labelledby="text-area-title">
      <div className="flex max-h-full w-full max-w-3xl flex-col gap-4 overflow-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div>
          <h2 id="text-area-title" className="text-xl font-bold">Area custom text</h2>
          <p className="text-sm text-char opacity-75">
            Tarik kotak di atas frame untuk menandai tempat custom text, atau klik kotak foto (biru) yang sebenarnya
            area teks hijau. Tanpa area teks, tamu tidak diminta mengisi custom text.
          </p>
        </div>

        <div className="mx-auto w-full max-w-sm">
          <div
            ref={boxRef}
            className="relative w-full cursor-crosshair touch-none select-none overflow-hidden border border-line bg-[repeating-conic-gradient(#eee_0_25%,#fff_0_50%)] bg-[length:16px_16px]"
            style={{ aspectRatio: `${canvas.w}/${canvas.h}` }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            {/* slot foto: transparan di PNG keyed, ditandai biru */}
            {slots.map((slot, index) => (
              <button
                key={index}
                type="button"
                data-slot
                onClick={() => slotToTextArea(index)}
                title="Jadikan area custom text"
                className="absolute flex items-center justify-center bg-sky/60 text-xs font-bold text-char hover:bg-butter/80"
                style={{ ...pct(slot), minHeight: 0, borderRadius: 0 }}
              >
                Foto {slot.n}
              </button>
            ))}
            <img src={imageUrl} alt="Frame" className="pointer-events-none absolute inset-0 h-full w-full" draggable={false} />
            {textArea && (
              <div className="pointer-events-none absolute flex items-center justify-center border-2 border-dashed border-cherry bg-butter/60 text-xs font-bold text-cherry" style={pct(textArea)}>
                Custom text
              </div>
            )}
            {draft && <div className="pointer-events-none absolute border-2 border-cherry bg-cherry/20" style={pct(draft)} />}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-char opacity-75">
            {textArea ? `Area teks: ${textArea.w} × ${textArea.h} px` : 'Belum ada area teks'}
          </span>
          <div className="flex gap-2">
            {textArea && (
              <button type="button" onClick={() => setTextArea(undefined)} className="rounded-lg bg-line px-4 py-2 text-sm text-char" style={{ minHeight: 0 }}>
                Hapus area teks
              </button>
            )}
            <button type="button" onClick={onCancel} disabled={saving} className="rounded-lg bg-line px-4 py-2 text-sm text-char" style={{ minHeight: 0 }}>
              Batal
            </button>
            <button
              type="button"
              onClick={() => onSave({ slots, text_area: textArea })}
              disabled={saving || slots.length === 0}
              className="rounded-lg bg-cherry px-4 py-2 text-sm text-cream"
              style={{ minHeight: 0 }}
            >
              {saving ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
