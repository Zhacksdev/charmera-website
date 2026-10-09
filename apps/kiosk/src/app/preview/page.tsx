'use client'

import { Suspense } from 'react'
import { useEffect, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useKioskStore } from '../../stores/kioskStore'
import { useStageTimer } from '../../hooks'

const BOOTH_API = process.env.NEXT_PUBLIC_BOOTH_API_URL || ''

export default function PreviewPage() {
  return <Suspense fallback={<main className="flex min-h-screen items-center justify-center text-cream">Menyiapkan preview...</main>}><PreviewContent /></Suspense>
}

function PreviewContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session')
  
  const { selectedFrame, photos, customText } = useKioskStore()
  const [loading, setLoading] = useState(false)
  const [config, setConfig] = useState<any>(null)

  const { remainingSec, isExpired } = useStageTimer({
    sessionId,
    onComplete: () => handleFinalize()
  })

  useEffect(() => {
    async function fetchConfig() {
      try {
        const res = await fetch(`${BOOTH_API}/api/status`)
        if (res.ok) {
          const data = await res.json()
          setConfig(data)
        }
      } catch (err) {
        console.error('Failed to fetch config:', err)
      }
    }
    
    fetchConfig()
  }, [])

  const handleFinalize = useCallback(async () => {
    if (!sessionId || loading) return
    setLoading(true)
    
    try {
      const res = await fetch(`${BOOTH_API}/api/sessions/${sessionId}/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ print: config?.print_mode !== 'digital_only' }),
      })
      
      if (res.ok) {
        router.push(`/processing?session=${sessionId}`)
      }
    } catch (err) {
      console.error('Failed to finalize:', err)
    } finally {
      setLoading(false)
    }
  }, [sessionId, loading, config, router])

  const outputMode = config?.output_mode || 'photo_only'
  const showPrintButton = config?.print_mode !== 'digital_only'
  const capturedPhotos = Array.from(photos.values()).sort((first, second) => first.slot_index - second.slot_index)
  const firstClip = capturedPhotos.find((photo) => photo.clipDataUrl)?.clipDataUrl

  return (
    <main className="relative flex min-h-screen flex-col overflow-y-auto p-5 md:p-8">
      <header className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] items-center gap-2 md:gap-3">
        <div className="timer-pill justify-self-start">{formatTimer(remainingSec)}</div>
        <h1 className="text-center text-xl font-extrabold text-cream md:text-5xl">Hasil fotomu!</h1>
        <div className="justify-self-end text-lg font-bold text-cream/85">{remainingSec} dtk</div>
      </header>

      <div className="grid flex-1 grid-cols-1 items-center gap-5 py-5 md:grid-cols-3 md:gap-8">
        <OutputPreview title="Foto Strip" photos={capturedPhotos} frame={selectedFrame} customText={customText} />
        {outputMode === 'full' && <OutputPreview title="GIF" photos={capturedPhotos} frame={selectedFrame} customText={customText} animated />}
        {outputMode === 'full' && <OutputPreview title="Live Photo" photos={capturedPhotos} frame={selectedFrame} customText={customText} clip={firstClip} />}
      </div>

      <div className="flex justify-center pb-2">
        <button
          onClick={handleFinalize}
          disabled={loading}
          className="btn-primary min-h-20 min-w-80 px-10 text-2xl shadow-xl"
        >
          {loading ? 'Menyiapkan hasil...' : showPrintButton ? 'Print sekarang' : 'Lanjut'}
        </button>
      </div>
    </main>
  )
}

function OutputPreview({
  title,
  photos,
  frame,
  customText,
  animated = false,
  clip,
}: {
  title: string
  photos: Array<{ slot_index: number; dataUrl: string; clipDataUrl?: string }>
  frame: ReturnType<typeof useKioskStore.getState>['selectedFrame']
  customText: string
  animated?: boolean
  clip?: string
}) {
  const canvas = frame?.layout.canvas || { w: 2, h: 3 }
  const slots = frame?.layout.slots || []

  return (
    <section className="mx-auto flex w-full max-w-[340px] flex-col items-center" aria-label={title}>
      <h2 className="mb-2 text-center text-2xl font-extrabold text-cream">{title}</h2>
      <div className="output-preview" style={{ aspectRatio: `${canvas.w}/${canvas.h}` }}>
        {clip ? (
          <video src={clip} poster={photos[0]?.dataUrl} autoPlay muted loop playsInline className="absolute inset-0 h-full w-full object-cover" />
        ) : slots.length > 0 ? slots.map((slot, index) => {
          const photo = photos.find((item) => item.slot_index === index)
          return <div key={`${slot.n}-${index}`} className={`output-photo ${animated ? 'output-photo-animated' : ''}`} style={{ left: `${slot.x / canvas.w * 100}%`, top: `${slot.y / canvas.h * 100}%`, width: `${slot.w / canvas.w * 100}%`, height: `${slot.h / canvas.h * 100}%`, animationDelay: `${index * 0.8}s` }}>
            {photo && <img src={photo.dataUrl} alt={`Foto ${index + 1}`} />}
          </div>
        }) : photos.map((photo) => <img key={photo.slot_index} src={photo.dataUrl} alt={`Foto ${photo.slot_index + 1}`} className="output-grid-photo" />)}
        <div className="output-caption">{customText || frame?.name || 'Chamera · 2026'}</div>
      </div>
    </section>
  )
}

function formatTimer(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}.${String(seconds % 60).padStart(2, '0')}`
}
