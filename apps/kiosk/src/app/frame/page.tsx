'use client'

import { Suspense } from 'react'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useKioskStore, type Frame } from '../../stores/kioskStore'
import { FrameComposite } from '../../components/FrameComposite'
import { shotNumbers } from '../../lib/frame-layout'
import { StageHeader } from '../../components/StageHeader'

const BOOTH_API = process.env.NEXT_PUBLIC_BOOTH_API_URL || ''

export default function FrameSelectPage() {
  return <Suspense fallback={<main className="kiosk-page items-center justify-center text-cream">Memuat pilihan frame...</main>}><FrameSelectContent /></Suspense>
}

function FrameSelectContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session')

  const { frames, setFrames, selectFrame, setSession } = useKioskStore()
  const [loading, setLoading] = useState(true)
  const [remainingSec, setRemainingSec] = useState(60)
  // frame yang sedang ditampilkan di carousel ≠ frame yang dipilih tamu (harus diketuk dulu)
  const [viewFrameId, setViewFrameId] = useState<string | null>(null)
  const [pickedFrameId, setPickedFrameId] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const viewIndex = Math.max(0, frames.findIndex((frame) => frame.id === viewFrameId))
  const viewFrame = frames[viewIndex]
  const pickedFrame = frames.find((frame) => frame.id === pickedFrameId) || null

  useEffect(() => {
    async function fetchFrames() {
      try {
        const res = await fetch(`${BOOTH_API}/api/frames`)
        if (res.ok) {
          const data = await res.json()
          setFrames(data)
          setViewFrameId((current) => current ?? data[0]?.id ?? null)
        }
      } catch (err) {
        console.error('Failed to fetch frames:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchFrames()
  }, [setFrames])

  useEffect(() => {
    if (!viewFrameId && frames.length > 0) {
      setViewFrameId(frames[0].id)
    }
  }, [frames, viewFrameId])

  // nilai yang berubah saat tamu menggeser/memilih frame dibaca lewat ref: polling tidak di-restart
  // tiap pergantian frame (dulu membuat timer berhenti selama tamu menggeser carousel)
  const framesRef = useRef(frames)
  framesRef.current = frames
  const handleTimeoutRef = useRef<() => void>(() => {})

  // sisa waktu: angka server saat polling + hitung mundur lokal di antaranya, agar timer selalu jalan
  const remainingBaseRef = useRef<{ sec: number; at: number } | null>(null)
  useEffect(() => {
    const tick = setInterval(() => {
      const base = remainingBaseRef.current
      if (base) setRemainingSec(Math.max(0, base.sec - Math.floor((Date.now() - base.at) / 1000)))
    }, 250)
    return () => clearInterval(tick)
  }, [])

  useEffect(() => {
    if (!sessionId) return
    let polling = false

    const interval = setInterval(async () => {
      if (polling) return
      polling = true
      try {
        const res = await fetch(`${BOOTH_API}/api/sessions/${sessionId}`)
        if (res.ok) {
          const data = await res.json()
          setSession(data)
          remainingBaseRef.current = { sec: data.remaining_sec || 0, at: Date.now() }

          if (data.status === 'frame_selected' && data.frame_id) {
            const frame = framesRef.current.find(f => f.id === data.frame_id)
            if (frame) {
              selectFrame(frame)
              router.push(`/action?session=${sessionId}`)
            }
          }

          if (data.remaining_sec <= 0 && data.status === 'created') {
            handleTimeoutRef.current()
          }
        }
      } catch (err) {
        console.error('Failed to poll session:', err)
      } finally {
        polling = false
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [sessionId, selectFrame, setSession, router])

  const handleSelect = useCallback(async (frame: Frame, selectedBy: 'user' | 'timeout') => {
    if (!frame || !sessionId) return
    setSubmitting(true)

    try {
      const res = await fetch(`${BOOTH_API}/api/sessions/${sessionId}/frame`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frame_id: frame.id, selected_by: selectedBy }),
      })

      if (res.ok) {
        selectFrame(frame)
        router.push(`/action?session=${sessionId}`)
        return
      }
    } catch (err) {
      console.error('Failed to select frame:', err)
    }
    setSubmitting(false)
    setConfirmOpen(false)
  }, [sessionId, selectFrame, router])

  const handleTimeout = useCallback(() => {
    if (frames.length > 0 && sessionId) {
      // waktu habis: pakai frame yang sudah dipilih, atau yang sedang ditampilkan
      const frame = pickedFrame || viewFrame || frames[0]
      if (frame) handleSelect(frame, 'timeout')
    }
  }, [frames, pickedFrame, viewFrame, sessionId, handleSelect])
  handleTimeoutRef.current = handleTimeout

  if (loading) {
    return (
      <main className="kiosk-page items-center justify-center">
      <div className="text-2xl font-extrabold text-cream">Memuat pilihan frame...</div>
      </main>
    )
  }

  const shouldShowReminder = remainingSec <= 15 && remainingSec > 0
  const showFrame = (index: number) => setViewFrameId(frames[(index + frames.length) % frames.length].id)

  return (
    <main className="kiosk-page gap-[clamp(8px,1.6vmin,20px)]">
      <StageHeader title="Pilih Frame kamu dulu ya" remainingSec={remainingSec} />

      {shouldShowReminder && (
        <div role="status" className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-cream px-6 py-3 text-center font-extrabold text-cherry shadow-lg">
          Waktu hampir habis! Pilih frame sekarang.
        </div>
      )}

      {viewFrame ? (
        <section className="flex min-h-0 flex-1 flex-col items-center gap-[clamp(6px,1.4vmin,16px)]" aria-label="Pilihan frame">
          {/* frame mengisi ruang tersisa: utuh terlihat di portrait & landscape */}
          <div className="flex min-h-[240px] w-full flex-1 items-stretch justify-center gap-[clamp(8px,3vw,48px)]">
            <button aria-label="Frame sebelumnya" disabled={frames.length < 2} onClick={() => showFrame(viewIndex - 1)} className="carousel-arrow shrink-0 self-center">‹</button>
            <div className="fit-box max-w-[min(100%,720px)]">
              <button
                onClick={() => setPickedFrameId(viewFrame.id)}
                aria-pressed={pickedFrameId === viewFrame.id}
                className={`frame-choice fit-item relative ${pickedFrameId === viewFrame.id ? 'frame-choice-picked' : ''}`}
                style={{ ['--ar' as string]: frameAspect(viewFrame) }}
                aria-label={`Pilih frame ${viewIndex + 1}`}
              >
                <FrameArtwork frame={viewFrame} />
                {pickedFrameId === viewFrame.id && <span className="frame-picked-badge">✓ Dipilih</span>}
              </button>
            </div>
            <button aria-label="Frame berikutnya" disabled={frames.length < 2} onClick={() => showFrame(viewIndex + 1)} className="carousel-arrow shrink-0 self-center">›</button>
          </div>
          <div className="shrink-0 text-center">
            {/* nama/ID frame tidak ditampilkan ke tamu */}
            {frames.length > 1 && <div className="text-lg font-extrabold text-cream">Frame {viewIndex + 1} dari {frames.length}</div>}
            <div className="text-cream/80">{shotNumbers(viewFrame.layout?.slots || []).length} foto{viewFrame.extra_price > 0 ? ` · +Rp ${viewFrame.extra_price.toLocaleString('id-ID')}` : ''}</div>
            <div className="mt-1 text-lg font-bold text-cream/90">
              {pickedFrame ? '✓ Frame dipilih' : 'Ketuk frame untuk memilih'}
            </div>
          </div>
          {frames.length > 1 && <div className="flex shrink-0 gap-3">{frames.map((frame, index) => <button key={frame.id} aria-label={`Lihat frame ${index + 1}`} onClick={() => setViewFrameId(frame.id)} className={`h-3 w-3 min-h-0 rounded-full p-0 ${frame.id === viewFrameId ? 'bg-cream' : 'bg-cream/40'}`} />)}</div>}
          {/* aktif hanya setelah tamu mengetuk salah satu frame */}
          <button onClick={() => setConfirmOpen(true)} disabled={!pickedFrame || submitting} className="btn-primary shrink-0 min-w-60 px-10 text-xl">
            Lanjut
          </button>
        </section>
      ) : (
        <div className="flex flex-1 items-center justify-center text-xl font-bold text-cream">
          {frames.length === 0 ? 'Belum ada frame tersedia' : 'Pilih frame untuk melanjutkan'}
        </div>
      )}

      {confirmOpen && pickedFrame && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-char/70 p-6" role="dialog" aria-modal="true" aria-labelledby="confirm-frame-title">
          <div className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-[24px] bg-cream p-6 text-center shadow-2xl">
            <h2 id="confirm-frame-title" className="mb-4 text-2xl font-extrabold text-cherry">Pakai frame ini?</h2>
            <div className="mx-auto mb-4 w-[min(50vw,220px,22dvh)]">
              <FrameArtwork frame={pickedFrame} />
            </div>
            <p className="mb-6 text-char">
              Frame ini berisi <span className="font-extrabold">{shotNumbers(pickedFrame.layout?.slots || []).length} foto</span>.
              Setelah lanjut, countdown foto langsung dimulai.
            </p>
            <div className="flex justify-center gap-3">
              <button onClick={() => setConfirmOpen(false)} disabled={submitting} className="btn-secondary min-w-32">Ganti frame</button>
              <button onClick={() => void handleSelect(pickedFrame, 'user')} disabled={submitting} className="btn-primary min-w-32">
                {submitting ? 'Menyiapkan...' : 'Ya, lanjut'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

function frameAspect(frame: Frame): number {
  const canvas = frame.layout?.canvas || { w: frame.canvas_w, h: frame.canvas_h }
  return canvas.w / canvas.h
}

function FrameArtwork({ frame }: { frame: Frame }) {
  // frame asli yang diunggah admin, slot kosong berlabel — sama dengan tampilan di halaman Action
  return (
    <FrameComposite
      frame={frame}
      renderSlot={(shotIndex) => <span className="flex h-full w-full items-center justify-center">Foto {shotIndex + 1}</span>}
    />
  )
}
