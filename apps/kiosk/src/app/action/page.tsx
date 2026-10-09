'use client'

import { Suspense } from 'react'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useKioskStore } from '../../stores/kioskStore'
import { useCamera, useClipRecorder, useStageTimer } from '../../hooks'

const BOOTH_API = process.env.NEXT_PUBLIC_BOOTH_API_URL || 'http://127.0.0.1:4000'

export default function ActionPage() {
  return <Suspense fallback={<main className="flex min-h-screen items-center justify-center text-cream">Menyiapkan kamera...</main>}><ActionContent /></Suspense>
}

function ActionContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session')
  
  const { selectedFrame, photos, setPhoto, setSession, customText, setCustomText } = useKioskStore()
  
  const { videoRef, isReady, error: cameraError, startCamera, stopCamera, capturePhoto } = useCamera({
    width: 1920,
    height: 1080,
    mirror: true
  })
  
  const { isRecording, startRecording, getClipDataUrl } = useClipRecorder()
  
  const [currentSlot, setCurrentSlot] = useState(0)
  const [countdown, setCountdown] = useState(0)
  const [isCapturing, setIsCapturing] = useState(false)
  const [retakeCount, setRetakeCount] = useState(0)
  const [showReminder, setShowReminder] = useState(false)
  const [timerSnapshot, setTimerSnapshot] = useState<any>(null)
  
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const slots = selectedFrame?.layout?.slots || []
  const totalSlots = slots.length
  const maxRetake = timerSnapshot?.max_retake || 3

  useEffect(() => {
    startCamera()
    return () => stopCamera()
  }, [startCamera, stopCamera])

  const { remainingSec, isExpired } = useStageTimer({
    sessionId,
    onComplete: () => {
      if (photos.size >= totalSlots) {
        router.push(`/preview?session=${sessionId}`)
      } else {
        const lastPhoto = Array.from(photos.values()).pop()
        if (lastPhoto) {
          router.push(`/preview?session=${sessionId}`)
        }
      }
    }
  })

  useEffect(() => {
    if (!sessionId) return
    
    const fetchSession = async () => {
      try {
        const res = await fetch(`${BOOTH_API}/api/sessions/${sessionId}`)
        if (res.ok) {
          const data = await res.json()
          setSession(data)
          
          if (data.timer_snapshot) {
            setTimerSnapshot(data.timer_snapshot)
          }
          
          const reminderThreshold = data.timer_snapshot?.reminder_sec || 15
          setShowReminder(data.remaining_sec <= reminderThreshold && data.remaining_sec > 0)
        }
      } catch (err) {
        console.error('Failed to poll session:', err)
      }
    }
    
    fetchSession()
    const interval = setInterval(fetchSession, 1000)
    return () => clearInterval(interval)
  }, [sessionId, setSession, photos.size, totalSlots])

  const handleCapture = useCallback(async (requestedSlot?: number) => {
    if (!isReady || !sessionId || isCapturing) return
    const slotIndex = requestedSlot ?? currentSlot
    if (slotIndex >= totalSlots) return
    
    setIsCapturing(true)
    
    try {
      const stream = videoRef.current?.srcObject as MediaStream
      if (stream) {
        startRecording(stream)
      }
      
      const countdownSec = timerSnapshot?.countdown || 5
      setCountdown(countdownSec)
      
      countdownIntervalRef.current = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            if (countdownIntervalRef.current) {
              clearInterval(countdownIntervalRef.current)
            }
            return 0
          }
          return prev - 1
        })
      }, 1000)
      
      await new Promise(resolve => setTimeout(resolve, countdownSec * 1000))
      
      const photoDataUrl = capturePhoto()
      if (!photoDataUrl) throw new Error('Failed to capture photo')
      
      const clipDataUrl = await getClipDataUrl()
      
      const photoBase64 = photoDataUrl.split(',')[1]
      const clipBase64 = clipDataUrl ? clipDataUrl.split(',')[1] : undefined
      
      await fetch(`${BOOTH_API}/api/sessions/${sessionId}/photos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slot_index: slotIndex,
          photo_data: photoBase64,
          clip_data: clipBase64,
        }),
      })
      
      setPhoto(slotIndex, { 
        slot_index: slotIndex, 
        dataUrl: photoDataUrl, 
        clipDataUrl: clipDataUrl ?? undefined
      })
      
      if (slotIndex >= currentSlot && slotIndex < totalSlots - 1) {
        setCurrentSlot(slotIndex + 1)
      }
      
    } catch (err) {
      console.error('Capture failed:', err)
    } finally {
      setIsCapturing(false)
      setCountdown(0)
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current)
      }
    }
  }, [isReady, sessionId, isCapturing, currentSlot, totalSlots, startRecording, getClipDataUrl, capturePhoto, setPhoto, videoRef, timerSnapshot])

  const allSlotsFilled = photos.size >= totalSlots

  const handleRetake = useCallback(async () => {
    if (retakeCount >= maxRetake || isCapturing) return
    
    setRetakeCount(retakeCount + 1)
    await handleCapture(allSlotsFilled ? currentSlot : Math.max(0, currentSlot - 1))
  }, [retakeCount, maxRetake, isCapturing, handleCapture, allSlotsFilled, currentSlot])

  const handleContinue = useCallback(() => {
    if (!sessionId) return
    router.push(`/preview?session=${sessionId}`)
  }, [sessionId, router])

  const handleCustomText = useCallback(async (text: string) => {
    if (!sessionId) return
    setCustomText(text)
    
    try {
      await fetch(`${BOOTH_API}/api/sessions/${sessionId}/text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ custom_text: text }),
      })
    } catch (err) {
      console.error('Failed to save custom text:', err)
    }
  }, [sessionId, setCustomText])

  const minPhotoTime = 8
  const canRetake = remainingSec >= minPhotoTime && retakeCount < maxRetake && !isCapturing && (currentSlot > 0 || allSlotsFilled)

  if (cameraError) {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen p-8">
        <div role="alert" className="mb-4 text-2xl font-extrabold text-cream">Kamera belum siap</div>
        <div className="mb-6 text-cream/80">{cameraError}</div>
        <button
          onClick={() => startCamera()}
          className="btn-primary"
        >
          Coba kamera lagi
        </button>
      </main>
    )
  }

  return (
    <main className="relative flex min-h-screen flex-col overflow-y-auto p-5 md:p-8">
      <header className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] items-center gap-2 md:gap-3">
        <div className="timer-pill justify-self-start">{formatTimer(remainingSec)}</div>
        <h1 className="text-center text-xl font-extrabold text-cream md:text-5xl">Saatnya berekspresi!</h1>
        <button onClick={handleContinue} disabled={!allSlotsFilled} className="btn-primary min-h-14 justify-self-end px-3 text-base md:min-h-16 md:px-8 md:text-lg">Lanjut</button>
      </header>
      <div className="mt-2 text-center text-sm font-bold text-cream/80">Slot {Math.min(currentSlot + 1, totalSlots)} / {totalSlots}{retakeCount > 0 ? ` · Retake ${retakeCount}/${maxRetake}` : ''}</div>
      
      {showReminder && !isCapturing && (
        <div className="reminder-banner">
          Waktu hampir habis! {remainingSec} detik tersisa.
        </div>
      )}
      
      <div className="grid flex-1 grid-cols-1 items-center gap-6 py-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)] lg:gap-12">
        <div className="mx-auto w-full max-w-[min(42vh,340px)] lg:max-w-[440px]">
          {selectedFrame && <div className="action-frame" style={{ aspectRatio: `${selectedFrame.layout.canvas.w}/${selectedFrame.layout.canvas.h}` }}>
            {slots.map((slot, index) => {
              const photo = photos.get(index)
              return <div key={`${slot.n}-${index}`} className="action-frame-slot" style={{ left: `${slot.x / selectedFrame.layout.canvas.w * 100}%`, top: `${slot.y / selectedFrame.layout.canvas.h * 100}%`, width: `${slot.w / selectedFrame.layout.canvas.w * 100}%`, height: `${slot.h / selectedFrame.layout.canvas.h * 100}%` }}>
                {photo ? <img src={photo.dataUrl} alt={`Foto slot ${index + 1}`} /> : <span>Foto {index + 1}</span>}
              </div>
            })}
            <div className="action-frame-caption">{customText || selectedFrame.name}</div>
          </div>}
        </div>
        <div className="relative mx-auto aspect-[4/3] w-full max-w-2xl overflow-hidden rounded-[24px] border-4 border-cream bg-char shadow-xl">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
            style={{ transform: 'scaleX(-1)' }}
          />
          <canvas ref={canvasRef} className="hidden" />
          
          {isCapturing && countdown > 0 && (
            <div className="countdown-overlay">
              <div className="countdown-number">
                {countdown}
              </div>
            </div>
          )}
          {!isReady && !cameraError && <div className="absolute inset-0 flex items-center justify-center bg-char/80 text-lg font-bold text-cream">Menyiapkan kamera...</div>}
        </div>
      </div>
      
      <div className="flex flex-wrap justify-center gap-3">
        <button
          onClick={() => handleCapture()}
          disabled={isCapturing || !isReady || currentSlot >= totalSlots}
          className="btn-primary min-w-52 text-xl"
        >
          {isCapturing ? 'Mengambil foto...' : `Ambil foto ${Math.min(currentSlot + 1, totalSlots)}`}
        </button>
        
        {canRetake && currentSlot > 0 && (
          <button
            onClick={handleRetake}
            className="btn-secondary min-w-40 text-lg"
          >
            Retake
          </button>
        )}
        
        {allSlotsFilled && (
          <button
            onClick={handleContinue}
            className="btn-primary text-xl px-8 py-4"
          >
            Lanjut
          </button>
        )}
      </div>
      
      <div className="mx-auto mt-4 w-full max-w-xl">
        <label htmlFor="custom-text" className="mb-2 block text-center text-xl font-extrabold text-cream">Custom textnya di sini ya!</label>
        <input
          id="custom-text"
          type="text"
          value={customText}
          onChange={(e) => handleCustomText(e.target.value)}
          placeholder="Tulis pesan pendek..."
          maxLength={30}
          className="w-full rounded-xl border-0 bg-cream px-5 py-4 text-center text-lg font-bold text-cherry placeholder:text-cherry/55 focus:outline focus:outline-4 focus:outline-butter"
        />
        <div className="mt-1 text-right text-sm text-cream/75">{customText.length}/30</div>
      </div>
    </main>
  )
}

function formatTimer(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}.${String(seconds % 60).padStart(2, '0')}`
}
