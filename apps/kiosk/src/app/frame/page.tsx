'use client'

import { Suspense } from 'react'
import { useEffect, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useKioskStore, type Frame } from '../../stores/kioskStore'

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
  const [remainingSec, setRemainingSec] = useState(30)
  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null)
  const selectedIndex = Math.max(0, frames.findIndex((frame) => frame.id === selectedFrameId))
  const selectedFrame = frames[selectedIndex]

  useEffect(() => {
    async function fetchFrames() {
      try {
        const res = await fetch(`${BOOTH_API}/api/frames`)
        if (res.ok) {
          const data = await res.json()
          setFrames(data)
          setSelectedFrameId((current) => current ?? data[0]?.id ?? null)
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
    if (!selectedFrameId && frames.length > 0) {
      setSelectedFrameId(frames[0].id)
    }
  }, [frames, selectedFrameId])

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
  }, [sessionId, frames, selectedFrameId])

  const handleSelect = useCallback(async (frame: Frame, selectedBy: 'user' | 'timeout') => {
    if (!frame || !sessionId) return
    
    setSelectedFrameId(frame.id)
    
    try {
      const res = await fetch(`${BOOTH_API}/api/sessions/${sessionId}/frame`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frame_id: frame.id, selected_by: selectedBy }),
      })
      
      if (res.ok) {
        selectFrame(frame)
        router.push(`/action?session=${sessionId}`)
      } else {
        setSelectedFrameId(null)
      }
    } catch (err) {
      console.error('Failed to select frame:', err)
      setSelectedFrameId(null)
    }
  }, [sessionId, selectFrame, router])

  const handleContinue = () => {
    if (selectedFrame) void handleSelect(selectedFrame, 'user')
  }

  const handleTimeout = useCallback(() => {
    if (frames.length > 0 && sessionId) {
      const frame = selectedFrameId 
        ? frames.find(f => f.id === selectedFrameId) 
        : frames[0]
      
      if (frame) {
        handleSelect(frame, 'timeout')
      }
    }
  }, [frames, selectedFrameId, sessionId, handleSelect])

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
      <div className="text-2xl font-extrabold text-cream">Memuat pilihan frame...</div>
      </main>
    )
  }

  const shouldShowReminder = remainingSec <= 15 && remainingSec > 0

  return (
    <main className="relative flex min-h-screen flex-col overflow-y-auto p-5 md:p-8">
      <header className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] items-center gap-2 md:gap-3">
        <div className="timer-pill justify-self-start">{formatTimer(remainingSec)}</div>
        <h1 className="text-center text-xl font-extrabold text-cream md:text-5xl">Pilih Frame kamu dulu ya</h1>
        <button onClick={handleContinue} disabled={!selectedFrame} className="btn-primary min-h-14 justify-self-end px-3 text-base md:min-h-16 md:px-8 md:text-lg">
          Lanjut
        </button>
      </header>
      
      {shouldShowReminder && (
        <div role="status" className="fixed left-1/2 top-24 z-50 -translate-x-1/2 rounded-xl bg-cream px-6 py-3 font-extrabold text-cherry shadow-lg">
          Waktu hampir habis! Pilih frame sekarang.
        </div>
      )}

      {selectedFrame ? (
        <section className="flex flex-1 items-center justify-center gap-5 py-5 md:gap-12" aria-label="Pilihan frame">
          <button aria-label="Frame sebelumnya" disabled={frames.length < 2} onClick={() => setSelectedFrameId(frames[(selectedIndex - 1 + frames.length) % frames.length].id)} className="carousel-arrow hidden md:flex">‹</button>
          <button onClick={() => setSelectedFrameId(selectedFrame.id)} className="frame-choice w-[min(54vw,430px)]" aria-label={`Pilih ${selectedFrame.name}`}>
            <FrameArtwork frame={selectedFrame} />
            <span className="mt-3 block text-xl font-extrabold text-cream">{selectedFrame.name}</span>
            <span className="mt-1 block text-cream/80">{selectedFrame.layout?.slots?.length || 0} foto{selectedFrame.extra_price > 0 ? ` · +Rp ${selectedFrame.extra_price.toLocaleString('id-ID')}` : ''}</span>
          </button>
          <button aria-label="Frame berikutnya" disabled={frames.length < 2} onClick={() => setSelectedFrameId(frames[(selectedIndex + 1) % frames.length].id)} className="carousel-arrow hidden md:flex">›</button>
          {frames.length > 1 && <div className="absolute bottom-5 flex gap-3 md:hidden">{frames.map((frame) => <button key={frame.id} aria-label={`Lihat ${frame.name}`} onClick={() => setSelectedFrameId(frame.id)} className={`h-3 w-3 min-h-0 rounded-full p-0 ${frame.id === selectedFrameId ? 'bg-cream' : 'bg-cream/40'}`} />)}</div>}
        </section>
      ) : (
        <div className="flex flex-1 items-center justify-center text-xl font-bold text-cream">
          {frames.length === 0 ? 'Belum ada frame tersedia' : 'Pilih frame untuk melanjutkan'}
        </div>
      )}
    </main>
  )
}

function formatTimer(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}.${String(seconds % 60).padStart(2, '0')}`
}

function FrameArtwork({ frame }: { frame: Frame }) {
  const canvas = frame.layout?.canvas || { w: frame.canvas_w, h: frame.canvas_h }
  const slots = frame.layout?.slots || []

  return (
    <div className="frame-artwork" style={{ aspectRatio: `${canvas.w}/${canvas.h}` }}>
      {slots.map((slot, index) => (
        <div key={`${slot.n}-${index}`} className="frame-artwork-slot" style={{ left: `${slot.x / canvas.w * 100}%`, top: `${slot.y / canvas.h * 100}%`, width: `${slot.w / canvas.w * 100}%`, height: `${slot.h / canvas.h * 100}%` }}>
          <img src={`/examples/example${index % 3 + 1}.jpg`} alt="" />
        </div>
      ))}
      <div className="frame-artwork-caption">{frame.name}</div>
    </div>
  )
}
