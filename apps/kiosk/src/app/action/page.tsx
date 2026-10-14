'use client'

import { Suspense } from 'react'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useKioskStore } from '../../stores/kioskStore'
import { useCamera, useClipRecorder, useStageTimer, useSessionFrame } from '../../hooks'
import { FrameComposite } from '../../components/FrameComposite'
import { shotNumbers } from '../../lib/frame-layout'
import { enqueueUpload, useUploadStates } from '../../lib/upload-queue'
import { useMirrorMode } from '../../lib/mirror-mode'
import { StageHeader } from '../../components/StageHeader'

const BOOTH_API = process.env.NEXT_PUBLIC_BOOTH_API_URL || ''
// jeda sebelum foto pertama (countdown langsung mulai setelah kamera siap) dan antar-foto (ganti gaya)
const FIRST_SHOT_DELAY_MS = 800
const NEXT_SHOT_DELAY_MS = 1500

export default function ActionPage() {
  return <Suspense fallback={<main className="kiosk-page items-center justify-center text-cream">Menyiapkan kamera...</main>}><ActionContent /></Suspense>
}

function ActionContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session')

  const { photos, setPhoto, setSession, customText, setCustomText } = useKioskStore()
  const selectedFrame = useSessionFrame(sessionId)

  const { videoRef, isReady, error: cameraError, startCamera, stopCamera, capturePhoto } = useCamera({
    width: 1920,
    height: 1080,
    // non-mirror di mana pun: yang dilihat tamu = hasil foto/GIF/Live
    mirror: false
  })

  const { startRecording, getClipBlob } = useClipRecorder()

  const [countdown, setCountdown] = useState(0)
  const [isCapturing, setIsCapturing] = useState(false)
  const [retakeCount, setRetakeCount] = useState(0)
  const [showReminder, setShowReminder] = useState(false)
  const [timerSnapshot, setTimerSnapshot] = useState<any>(null)
  const [outputMode, setOutputMode] = useState<'photo_only' | 'full'>('photo_only')
  const [captureError, setCaptureError] = useState('')
  const uploads = useUploadStates(sessionId)
  // mode kamera (disimpan di tablet): Non-mirror = dibalik horizontal, Mirror = kamera apa adanya
  const [mirrorMode, setMirrorMode] = useMirrorMode()
  const flip = mirrorMode === 'non_mirror'
  const flipRef = useRef(flip)
  flipRef.current = flip
  const [continuing, setContinuing] = useState(false)
  const [retakeMode, setRetakeMode] = useState(false)
  const [capturingShot, setCapturingShot] = useState<number | null>(null)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const capturingRef = useRef(false)

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

  /** Unggah di belakang layar (antrean tingkat modul, dengan retry) — tamu tidak menunggu upload */
  const uploadShot = useCallback((slotIndex: number, photoBlob: Blob, clipBlob: Blob | null, flip: boolean) => {
    if (!sessionId) return
    void enqueueUpload(sessionId, slotIndex, photoBlob, clipBlob, flip).then((ok) => {
      if (!ok) setCaptureError(`Foto ${slotIndex + 1} belum terkirim. Periksa Wi-Fi, lalu ambil ulang foto itu.`)
    })
  }, [sessionId])

  const handleCapture = useCallback(async (slotIndex: number) => {
    if (!isReady || !sessionId || capturingRef.current) return
    if (slotIndex >= totalSlots) return

    capturingRef.current = true
    setIsCapturing(true)
    setCapturingShot(slotIndex)
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

      // mode dibaca saat jepret: foto dibalik di sini, klip dibalik booth-api saat render
      const flipShot = flipRef.current
      const photoBlob = await capturePhoto(flipShot)
      if (!photoBlob) throw new Error('Failed to capture photo')

      const clipBlob = canRecordClip ? await getClipBlob() : null

      // tampil langsung dari blob lokal; upload menyusul
      setPhoto(slotIndex, {
        slot_index: slotIndex,
        dataUrl: URL.createObjectURL(photoBlob),
        clipDataUrl: clipBlob ? URL.createObjectURL(clipBlob) : undefined
      })
      uploadShot(slotIndex, photoBlob, clipBlob, flipShot)
    } catch (err) {
      console.error('Capture failed:', err)
      setCaptureError('Kamera gagal mengambil foto. Coba ulangi.')
    } finally {
      capturingRef.current = false
      setIsCapturing(false)
      setCapturingShot(null)
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
    // langsung ke Preview: upload yang tersisa berjalan di belakang, booth-api menunggu semua
    // foto/klip masuk sebelum merender, dan tombol Print menunggu antrean selesai
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
  const canRetake = allSlotsFilled && remainingSec >= minPhotoTime && retakeCount < maxRetake && !isCapturing
  const uploadsPending = Object.values(uploads).some((state) => state === 'uploading')
  const canContinue = allSlotsFilled && !isCapturing && failedShots.length === 0 && !continuing && !retakeMode

  const pickRetakeShot = (shotIndex: number) => {
    setRetakeMode(false)
    void handleRetake(shotIndex)
  }

  if (cameraError) {
    return (
      <main className="kiosk-page items-center justify-center text-center">
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
      : retakeMode
        ? 'Ketuk foto yang mau diulang'
      : allSlotsFilled
        ? (continuing && uploadsPending ? 'Mengirim foto...' : 'Semua foto sudah diambil!')
        : nextShot === 0 ? 'Bersiap, countdown dimulai...' : `Ganti gaya! Foto ${nextShot + 1} sebentar lagi`

  return (
    <main className="kiosk-page gap-[clamp(6px,1.4vmin,16px)]">
      <StageHeader title="Saatnya berekspresi!" remainingSec={remainingSec} />
      <div className="shrink-0 text-center text-base font-bold text-cream/90" role="status">{statusText}{retakeCount > 0 ? ` · Retake ${retakeCount}/${maxRetake}` : ''}</div>

      {showReminder && !isCapturing && (
        <div className="reminder-banner">
          Waktu hampir habis! {remainingSec} detik tersisa.
        </div>
      )}

      {/* landscape: frame | kamera berdampingan; portrait: ditumpuk. Keduanya utuh dalam satu layar */}
      <div className="grid min-h-[320px] flex-1 gap-[clamp(8px,2vmin,32px)] portrait:grid-rows-[minmax(0,1fr)_minmax(0,1fr)] landscape:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div className="fit-box">
          {selectedFrame && <FrameComposite
            fit
            frame={selectedFrame}
            customText={customText}
            renderSlot={(shotIndex) => {
              const photo = photos.get(shotIndex)
              // slot yang sedang difoto (urutan otomatis atau retake) disorot
              if (shotIndex === capturingShot || (!photo && shotIndex === nextShot)) {
                return <span className="frame-composite-current flex h-full w-full items-center justify-center">Foto {shotIndex + 1}</span>
              }
              if (photo && retakeMode) {
                return (
                  <button onClick={() => pickRetakeShot(shotIndex)} className="retake-slot" aria-label={`Ulangi foto ${shotIndex + 1}`}>
                    <img src={photo.dataUrl} alt="" />
                    <span>↻ Ulangi foto {shotIndex + 1}</span>
                  </button>
                )
              }
              if (photo) return <img src={photo.dataUrl} alt={`Foto ${shotIndex + 1}`} />
              return <span className="flex h-full w-full items-center justify-center">Foto {shotIndex + 1}</span>
            }}
          />}
        </div>
        <div className="fit-box">
        <div className="fit-item relative aspect-[4/3] overflow-hidden rounded-[24px] border-4 border-cream bg-char shadow-xl" style={{ ['--ar' as string]: 4 / 3 }}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
            style={flip ? { transform: 'scaleX(-1)' } : undefined}
          />
          <canvas ref={canvasRef} className="hidden" />

          {/* flip horizontal kamera; label = mode yang sedang aktif */}
          <button
            onClick={() => setMirrorMode(flip ? 'mirror' : 'non_mirror')}
            disabled={isCapturing}
            className="mirror-toggle"
            aria-pressed={flip}
            aria-label={`Mode kamera: ${flip ? 'Non-mirror' : 'Mirror'}. Ketuk untuk membalik`}
          >
            ⇋ {flip ? 'Non-mirror' : 'Mirror'}
          </button>

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
      </div>

      {/* tidak ada tombol ambil foto: urutan berjalan otomatis; tombol hanya muncul setelah semua foto */}
      <div className="flex shrink-0 flex-wrap items-center justify-center gap-3">
        {failedShots.map((slotIndex) => (
          <button key={slotIndex} onClick={() => handleRetake(slotIndex)} disabled={isCapturing} className="btn-secondary min-w-40 text-lg">
            Ambil ulang foto {slotIndex + 1}
          </button>
        ))}

        {/* Retake: masuk mode pilih, lalu tamu mengetuk foto di frame yang mau diulang */}
        {allSlotsFilled && failedShots.length === 0 && (retakeMode ? (
          <button onClick={() => setRetakeMode(false)} className="btn-secondary min-w-40 text-lg">
            Batal retake
          </button>
        ) : (
          <button
            onClick={() => setRetakeMode(true)}
            disabled={!canRetake || continuing}
            className="btn-secondary min-w-40 text-lg"
          >
            {retakeCount >= maxRetake ? 'Retake habis' : `Retake (${maxRetake - retakeCount}x)`}
          </button>
        ))}

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

      {captureError && <div role="alert" className="mx-auto max-w-xl shrink-0 rounded-lg bg-cream px-4 py-3 text-center font-bold text-cherry">{captureError}</div>}

      {/* hanya bila admin menandai area custom text di frame ini */}
      {selectedFrame?.layout?.text_area && (
        <div className="mx-auto flex w-full max-w-2xl shrink-0 flex-wrap items-center justify-center gap-x-3 gap-y-1">
          <label htmlFor="custom-text" className="text-lg font-extrabold text-cream">Custom textnya di sini ya!</label>
          <div className="relative min-w-[14rem] flex-1">
            <input
              id="custom-text"
              type="text"
              value={customText}
              onChange={(e) => handleCustomText(e.target.value)}
              placeholder="Tulis pesan pendek..."
              maxLength={30}
              className="w-full rounded-xl border-0 bg-cream py-3 pl-4 pr-14 text-center text-lg font-bold text-cherry placeholder:text-cherry/55 focus:outline focus:outline-4 focus:outline-butter"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-cherry/60">{customText.length}/30</span>
          </div>
        </div>
      )}
    </main>
  )
}
