'use client'

import { Suspense } from 'react'
import { useEffect, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useKioskStore, type Frame } from '../../stores/kioskStore'
import { FrameComposite } from '../../components/FrameComposite'
import { shotNumbers } from '../../lib/frame-layout'

const BOOTH_API = process.env.NEXT_PUBLIC_BOOTH_API_URL || ''

export default function FrameSelectPage() {
  return <Suspense fallback={<main className="flex min-h-screen items-center justify-center text-cream">Memuat pilihan frame...</main>}><FrameSelectContent /></Suspense>
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

  useEffect(() => {
    if (!sessionId) return

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${BOOTH_API}/api/sessions/${sessionId}`)
        if (res.ok) {
          const data = await res.json()
          setSession(data)
          setRemainingSec(data.remaining_sec || 0)

          if (data.status === 'frame_selected' && data.frame_id) {
            const frame = frames.find(f => f.id === data.frame_id)
            if (frame) {
              selectFrame(frame)
              router.push(`/action?session=${sessionId}`)
            }
          }

          if (data.remaining_sec <= 0 && data.status === 'created') {
            handleTimeout()
          }
        }
      } catch (err) {
        console.error('Failed to poll session:', err)
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [sessionId, frames, pickedFrameId, viewFrameId])

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

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
      <div className="text-2xl font-extrabold text-cream">Memuat pilihan frame...</div>
      </main>
    )
  }

  const shouldShowReminder = remainingSec <= 15 && remainingSec > 0
  const showFrame = (index: number) => setViewFrameId(frames[(index + frames.length) % frames.length].id)

  return (
    <main className="relative flex min-h-screen flex-col overflow-y-auto p-5 md:p-8">
      <header className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] items-center gap-2 md:gap-3">
        <div className="timer-pill justify-self-start">{formatTimer(remainingSec)}</div>
        <h1 className="text-center text-xl font-extrabold text-cream md:text-5xl">Pilih Frame kamu dulu ya</h1>
        {/* aktif hanya setelah tamu mengetuk salah satu frame */}
        <button onClick={() => setConfirmOpen(true)} disabled={!pickedFrame || submitting} className="btn-primary min-h-14 justify-self-end px-3 text-base md:min-h-16 md:px-8 md:text-lg">
          Lanjut
        </button>
      </header>

      {shouldShowReminder && (
        <div role="status" className="fixed left-1/2 top-24 z-50 -translate-x-1/2 rounded-xl bg-cream px-6 py-3 font-extrabold text-cherry shadow-lg">
          Waktu hampir habis! Pilih frame sekarang.
        </div>
      )}

      {viewFrame ? (
        <section className="flex flex-1 flex-col items-center justify-center gap-4 py-5" aria-label="Pilihan frame">
          <div className="flex items-center justify-center gap-5 md:gap-12">
            <button aria-label="Frame sebelumnya" disabled={frames.length < 2} onClick={() => showFrame(viewIndex - 1)} className="carousel-arrow hidden md:flex">‹</button>
            <button
              onClick={() => setPickedFrameId(viewFrame.id)}
              aria-pressed={pickedFrameId === viewFrame.id}
              className={`frame-choice relative w-[min(54vw,430px)] ${pickedFrameId === viewFrame.id ? 'frame-choice-picked' : ''}`}
              aria-label={`Pilih ${viewFrame.name}`}
            >
              <FrameArtwork frame={viewFrame} />
              {pickedFrameId === viewFrame.id && <span className="frame-picked-badge">✓ Dipilih</span>}
              <span className="mt-3 block text-xl font-extrabold text-cream">{viewFrame.name}</span>
              <span className="mt-1 block text-cream/80">{shotNumbers(viewFrame.layout?.slots || []).length} foto{viewFrame.extra_price > 0 ? ` · +Rp ${viewFrame.extra_price.toLocaleString('id-ID')}` : ''}</span>
            </button>
            <button aria-label="Frame berikutnya" disabled={frames.length < 2} onClick={() => showFrame(viewIndex + 1)} className="carousel-arrow hidden md:flex">›</button>
          </div>
          <div className="text-center text-lg font-bold text-cream/90">
            {pickedFrame ? `Frame dipilih: ${pickedFrame.name}` : 'Ketuk frame untuk memilih'}
          </div>
          {frames.length > 1 && <div className="flex gap-3 md:hidden">{frames.map((frame) => <button key={frame.id} aria-label={`Lihat ${frame.name}`} onClick={() => setViewFrameId(frame.id)} className={`h-3 w-3 min-h-0 rounded-full p-0 ${frame.id === viewFrameId ? 'bg-cream' : 'bg-cream/40'}`} />)}</div>}
        </section>
      ) : (
        <div className="flex flex-1 items-center justify-center text-xl font-bold text-cream">
          {frames.length === 0 ? 'Belum ada frame tersedia' : 'Pilih frame untuk melanjutkan'}
        </div>
      )}

      {confirmOpen && pickedFrame && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-char/70 p-6" role="dialog" aria-modal="true" aria-labelledby="confirm-frame-title">
          <div className="w-full max-w-md rounded-[24px] bg-cream p-6 text-center shadow-2xl">
            <h2 id="confirm-frame-title" className="mb-4 text-2xl font-extrabold text-cherry">Pakai frame ini?</h2>
            <div className="mx-auto mb-4 w-[min(50vw,220px)]">
              <FrameArtwork frame={pickedFrame} />
            </div>
            <p className="mb-6 text-char">
              <span className="font-extrabold">{pickedFrame.name}</span> · {shotNumbers(pickedFrame.layout?.slots || []).length} foto.
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

function formatTimer(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}.${String(seconds % 60).padStart(2, '0')}`
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
