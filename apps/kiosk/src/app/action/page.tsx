'use client'

import { Suspense } from 'react'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useKioskStore } from '../../stores/kioskStore'
import { useCamera, useClipRecorder, useStageTimer } from '../../hooks'
import { FrameComposite } from '../../components/FrameComposite'
import { shotNumbers } from '../../lib/frame-layout'

const BOOTH_API = process.env.NEXT_PUBLIC_BOOTH_API_URL || ''
// jeda sebelum foto pertama (countdown langsung mulai setelah kamera siap) dan antar-foto (ganti gaya)
const FIRST_SHOT_DELAY_MS = 800
const NEXT_SHOT_DELAY_MS = 1500
const UPLOAD_ATTEMPTS = 3

export default function ActionPage() {
  return <Suspense fallback={<main className="flex min-h-screen items-center justify-center text-cream">Menyiapkan kamera...</main>}><ActionContent /></Suspense>
}

type UploadState = 'uploading' | 'done' | 'failed'

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

  const { startRecording, getClipBlob } = useClipRecorder()

  const [countdown, setCountdown] = useState(0)
  const [isCapturing, setIsCapturing] = useState(false)
  const [retakeCount, setRetakeCount] = useState(0)
  const [showReminder, setShowReminder] = useState(false)
  const [timerSnapshot, setTimerSnapshot] = useState<any>(null)
  const [outputMode, setOutputMode] = useState<'photo_only' | 'full'>('photo_only')
  const [captureError, setCaptureError] = useState('')
  const [uploads, setUploads] = useState<Record<number, UploadState>>({})
  const [continuing, setContinuing] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const capturingRef = useRef(false)
  const uploadPromisesRef = useRef(new Map<number, Promise<boolean>>())

  const slots = selectedFrame?.layout?.slots || []
  // slot bernomor sama berbagi satu foto — jumlah jepretan = nomor slot unik
  const totalSlots = shotNumbers(slots).length
  const maxRetake = timerSnapshot?.max_retake || 3

  // foto berikutnya dalam urutan otomatis = indeks pertama yang belum terisi
  let nextShot = 0
  while (nextShot < totalSlots && photos.has(nextShot)) nextShot++
  const allSlotsFilled = totalSlots > 0 && nextShot >= totalSlots
  const failedShots = Object.entries(uploads).filter(([, state]) => state === 'failed').map(([slot]) => Number(slot))

  useEffect(() => {
    startCamera()
    return () => stopCamera()
  }, [startCamera, stopCamera])

  useEffect(() => {
    fetch(`${BOOTH_API}/api/status`)
      .then(async (res) => {
        if (!res.ok) return
        const data = await res.json()
        if (data.output_mode === 'full') setOutputMode('full')
      })
      .catch((err) => console.error('Failed to load output mode:', err))
  }, [])

  const { remainingSec } = useStageTimer({
    sessionId,
    activeStatuses: ['frame_selected', 'capturing'],
    // timer Action habis: server memindahkan sesi ke Preview bila ada foto, atau abandoned bila kosong
    onComplete: (status) => {
      if (status === 'abandoned' || status === 'failed') {
        router.push('/')
      } else {
        router.push(`/preview?session=${sessionId}`)
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
  }, [sessionId, setSession])

  /** Unggah di belakang layar (dengan retry) — tamu tidak menunggu upload sebelum foto berikutnya */
  const uploadShot = useCallback((slotIndex: number, photoBlob: Blob, clipBlob: Blob | null) => {
    setUploads((current) => ({ ...current, [slotIndex]: 'uploading' }))

    const run = async (): Promise<boolean> => {
      for (let attempt = 1; attempt <= UPLOAD_ATTEMPTS; attempt++) {
        try {
          const formData = new FormData()
          formData.append('slot_index', slotIndex.toString())
          formData.append('photo', photoBlob, `slot_${slotIndex}.jpg`)
          if (clipBlob) formData.append('clip', clipBlob, `slot_${slotIndex}.${clipBlob.type.includes('mp4') ? 'mp4' : 'webm'}`)

          const res = await fetch(`${BOOTH_API}/api/sessions/${sessionId}/photos`, { method: 'POST', body: formData })
          if (res.ok) {
            setUploads((current) => ({ ...current, [slotIndex]: 'done' }))
            return true
          }
          console.error(`Upload slot ${slotIndex} HTTP ${res.status}`)
        } catch (err) {
          console.error(`Upload slot ${slotIndex} failed:`, err)
        }
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000))
      }
      setUploads((current) => ({ ...current, [slotIndex]: 'failed' }))
      setCaptureError(`Foto ${slotIndex + 1} belum terkirim. Periksa Wi-Fi, lalu ambil ulang foto itu.`)
      return false
    }

    const promise = run()
    uploadPromisesRef.current.set(slotIndex, promise)
    return promise
  }, [sessionId])

  const handleCapture = useCallback(async (slotIndex: number) => {
    if (!isReady || !sessionId || capturingRef.current) return
    if (slotIndex >= totalSlots) return

    capturingRef.current = true
    setIsCapturing(true)
    setCaptureError('')

    try {
      const stream = videoRef.current?.srcObject as MediaStream
      // Chrome Android/desktop merekam WebM, Chrome/Safari iPad hanya MP4
      const canRecordClip = outputMode === 'full'
        && typeof MediaRecorder !== 'undefined'
        && (MediaRecorder.isTypeSupported('video/webm') || MediaRecorder.isTypeSupported('video/mp4'))
      if (stream && canRecordClip) {
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

      const photoBlob = await capturePhoto()
      if (!photoBlob) throw new Error('Failed to capture photo')

      const clipBlob = canRecordClip ? await getClipBlob() : null

      // tampil langsung dari blob lokal; upload menyusul
      setPhoto(slotIndex, {
        slot_index: slotIndex,
        dataUrl: URL.createObjectURL(photoBlob),
        clipDataUrl: clipBlob ? URL.createObjectURL(clipBlob) : undefined
      })
      void uploadShot(slotIndex, photoBlob, clipBlob)
    } catch (err) {
      console.error('Capture failed:', err)
      setCaptureError('Kamera gagal mengambil foto. Coba ulangi.')
    } finally {
      capturingRef.current = false
      setIsCapturing(false)
      setCountdown(0)
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current)
      }
    }
  }, [isReady, sessionId, totalSlots, startRecording, getClipBlob, capturePhoto, setPhoto, videoRef, timerSnapshot, outputMode, uploadShot])

  // nilai yang berubah tiap detik (polling) dibaca lewat ref — bila jadi dependency effect di bawah,
  // jeda sebelum jepretan ter-reset tiap detik dan foto tidak pernah diambil
  const handleCaptureRef = useRef(handleCapture)
  handleCaptureRef.current = handleCapture
  const remainingRef = useRef(remainingSec)
  remainingRef.current = remainingSec
  const countdownSecRef = useRef(5)
  countdownSecRef.current = timerSnapshot?.countdown || 5

  // urutan otomatis: foto 1 → 2 → ... tanpa tombol, dengan jeda singkat untuk ganti gaya
  useEffect(() => {
    if (!isReady || !sessionId || isCapturing || allSlotsFilled || totalSlots === 0) return
    const timer = setTimeout(() => {
      const remaining = remainingRef.current
      // sisa waktu tidak cukup untuk satu countdown lagi — server akan memindahkan ke Preview
      if (remaining > 0 && remaining < countdownSecRef.current + 2) return
      void handleCaptureRef.current(nextShot)
    }, nextShot === 0 ? FIRST_SHOT_DELAY_MS : NEXT_SHOT_DELAY_MS)
    return () => clearTimeout(timer)
  }, [isReady, sessionId, isCapturing, allSlotsFilled, totalSlots, nextShot])

  const handleRetake = useCallback(async (slotIndex: number) => {
    if (isCapturing) return
    if (uploads[slotIndex] !== 'failed') {
      if (retakeCount >= maxRetake) return
      setRetakeCount((count) => count + 1)
    }
    await handleCapture(slotIndex)
  }, [isCapturing, uploads, retakeCount, maxRetake, handleCapture])

  const handleContinue = useCallback(async () => {
    if (!sessionId || continuing) return
    setContinuing(true)
    // pastikan semua foto sudah sampai di booth sebelum Preview/render
    const results = await Promise.all(Array.from(uploadPromisesRef.current.values()))
    if (results.some((ok) => !ok)) {
      setContinuing(false)
      return
    }
    try {
      // server pindah ke tahap Preview dengan timer preview sendiri
      await fetch(`${BOOTH_API}/api/sessions/${sessionId}/advance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: 'frame_selected' })
      })
    } catch (err) {
      console.error('Failed to advance session:', err)
    }
    router.push(`/preview?session=${sessionId}`)
  }, [sessionId, router, continuing])

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
  const lastShot = totalSlots - 1
  const canRetake = allSlotsFilled && remainingSec >= minPhotoTime && retakeCount < maxRetake && !isCapturing
  const uploadsPending = Object.values(uploads).some((state) => state === 'uploading')
  const canContinue = allSlotsFilled && !isCapturing && failedShots.length === 0 && !continuing

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

  const statusText = !isReady
    ? 'Menyiapkan kamera...'
    : isCapturing
      ? `Foto ${Math.min(nextShot + 1, totalSlots)} dari ${totalSlots}`
      : allSlotsFilled
        ? (continuing && uploadsPending ? 'Mengirim foto...' : 'Semua foto sudah diambil!')
        : nextShot === 0 ? 'Bersiap, countdown dimulai...' : `Ganti gaya! Foto ${nextShot + 1} sebentar lagi`

  return (
    <main className="relative flex min-h-screen flex-col overflow-y-auto p-5 md:p-8">
      <header className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] items-center gap-2 md:gap-3">
        <div className="timer-pill justify-self-start">{formatTimer(remainingSec)}</div>
        <h1 className="text-center text-xl font-extrabold text-cream md:text-5xl">Saatnya berekspresi!</h1>
        <button onClick={handleContinue} disabled={!canContinue} className="btn-primary min-h-14 justify-self-end px-3 text-base md:min-h-16 md:px-8 md:text-lg">Lanjut</button>
      </header>
      <div className="mt-2 text-center text-base font-bold text-cream/90" role="status">{statusText}{retakeCount > 0 ? ` · Retake ${retakeCount}/${maxRetake}` : ''}</div>

      {showReminder && !isCapturing && (
        <div className="reminder-banner">
          Waktu hampir habis! {remainingSec} detik tersisa.
        </div>
      )}

      <div className="grid flex-1 grid-cols-1 items-center gap-6 py-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)] lg:gap-12">
        <div className="mx-auto w-full max-w-[min(42vh,340px)] lg:max-w-[440px]">
          {selectedFrame && <FrameComposite
            frame={selectedFrame}
            customText={customText}
            renderSlot={(shotIndex) => {
              const photo = photos.get(shotIndex)
              if (photo) return <img src={photo.dataUrl} alt={`Foto ${shotIndex + 1}`} />
              return <span className={`flex h-full w-full items-center justify-center ${shotIndex === nextShot ? 'frame-composite-current' : ''}`}>Foto {shotIndex + 1}</span>
            }}
          />}
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

      {/* tidak ada tombol ambil foto: urutan berjalan otomatis; tombol hanya muncul setelah semua foto */}
      <div className="flex flex-wrap justify-center gap-3">
        {failedShots.map((slotIndex) => (
          <button key={slotIndex} onClick={() => handleRetake(slotIndex)} disabled={isCapturing} className="btn-secondary min-w-40 text-lg">
            Ambil ulang foto {slotIndex + 1}
          </button>
        ))}

        {canRetake && failedShots.length === 0 && (
          <button
            onClick={() => handleRetake(lastShot)}
            className="btn-secondary min-w-40 text-lg"
          >
            Ulangi foto terakhir
          </button>
        )}

        {allSlotsFilled && (
          <button
            onClick={handleContinue}
            disabled={!canContinue}
            className="btn-primary text-xl px-8 py-4"
          >
            {continuing ? 'Mengirim foto...' : 'Lanjut'}
          </button>
        )}
      </div>

      {captureError && <div role="alert" className="mx-auto mt-3 max-w-xl rounded-lg bg-cream px-4 py-3 text-center font-bold text-cherry">{captureError}</div>}

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
