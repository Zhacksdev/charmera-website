'use client'

import { Suspense } from 'react'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useKioskStore } from '../../stores/kioskStore'
import { useStageTimer } from '../../hooks'
import { FrameComposite } from '../../components/FrameComposite'
import { PHOTO_FILTER_OPTIONS, filterCss, type PhotoFilter } from '../../lib/photo-filters'
import { useUploadStates, waitForUploads } from '../../lib/upload-queue'
import { StageHeader } from '../../components/StageHeader'

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
  const [filter, setFilter] = useState<PhotoFilter>('none')
  const [uploadError, setUploadError] = useState('')
  const uploads = useUploadStates(sessionId)
  const uploadsPending = Object.values(uploads).some((state) => state === 'uploading')
  // finalize menunggu filter terakhir tersimpan agar render memakai filter yang benar
  const filterSaveRef = useRef<Promise<unknown>>(Promise.resolve())

  const handleFilter = useCallback((next: PhotoFilter) => {
    setFilter(next)
    if (!sessionId) return
    filterSaveRef.current = filterSaveRef.current.then(() => fetch(`${BOOTH_API}/api/sessions/${sessionId}/filter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filter: next }),
    }).catch((err) => console.error('Failed to save filter:', err)))
  }, [sessionId])

  // timer Preview habis: server memproses & mencetak otomatis; finalize di sini idempotent
  const { remainingSec, isExpired } = useStageTimer({
    sessionId,
    activeStatuses: ['previewing', 'frame_selected', 'capturing'],
    onComplete: () => void handleFinalizeRef.current()
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

  const finalizingRef = useRef(false)
  const handleFinalize = useCallback(async () => {
    if (!sessionId || finalizingRef.current) return
    finalizingRef.current = true
    setLoading(true)

    try {
      await filterSaveRef.current
      // foto/klip dari halaman Action mungkin masih terkirim di belakang
      if (!(await waitForUploads(sessionId))) {
        setUploadError('Sebagian foto gagal terkirim ke booth. Periksa Wi-Fi tablet, lalu panggil petugas.')
        finalizingRef.current = false
        setLoading(false)
        return
      }
      const res = await fetch(`${BOOTH_API}/api/sessions/${sessionId}/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ print: config?.print_mode === 'local' }),
      })
      
      if (res.ok) {
        // QR langsung tampil; render & unggah berjalan di belakang, halaman download menyusul
        router.push(`/result?session=${sessionId}`)
        return
      }
    } catch (err) {
      console.error('Failed to finalize:', err)
    }
    finalizingRef.current = false
    setLoading(false)
  }, [sessionId, config, router])
  const handleFinalizeRef = useRef(handleFinalize)
  handleFinalizeRef.current = handleFinalize

  const outputMode = config?.output_mode || 'photo_only'
  const showPrintButton = config?.print_mode === 'local'
  const capturedPhotos = Array.from(photos.values()).sort((first, second) => first.slot_index - second.slot_index)

  return (
    <main className="relative flex min-h-screen flex-col overflow-y-auto p-5 md:p-8">
      <StageHeader title="Hasil fotomu!" remainingSec={remainingSec} />

      <div className="grid flex-1 grid-cols-1 items-center gap-5 py-5 md:grid-cols-3 md:gap-8">
        <OutputPreview title="Foto Strip" photos={capturedPhotos} frame={selectedFrame} customText={customText} filter={filter} />
        {outputMode === 'full' && <OutputPreview title="GIF" photos={capturedPhotos} frame={selectedFrame} customText={customText} filter={filter} variant="gif" />}
        {outputMode === 'full' && <OutputPreview title="Live Photo" photos={capturedPhotos} frame={selectedFrame} customText={customText} filter={filter} variant="live" />}
      </div>

      {/* filter berlaku untuk semua hasil (strip, GIF, Live); frame tetap warna asli */}
      <div className="mb-4 flex flex-col items-center gap-2">
        <div className="text-lg font-extrabold text-cream">Pilih filter</div>
        <div className="flex flex-wrap justify-center gap-2" role="radiogroup" aria-label="Filter foto">
          {PHOTO_FILTER_OPTIONS.map((option) => (
            <button
              key={option.id}
              role="radio"
              aria-checked={filter === option.id}
              onClick={() => handleFilter(option.id)}
              disabled={loading}
              className={`filter-chip ${filter === option.id ? 'filter-chip-active' : ''}`}
            >
              {capturedPhotos[0] && <img src={capturedPhotos[0].dataUrl} alt="" style={{ filter: option.css }} />}
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-center pb-2">
        <button
          onClick={handleFinalize}
          disabled={loading}
          className="btn-primary min-h-20 min-w-80 px-10 text-2xl shadow-xl"
        >
          {loading ? (uploadsPending ? 'Mengirim foto...' : 'Menyiapkan hasil...') : showPrintButton ? 'Print sekarang' : 'Lanjut'}
        </button>
      </div>
      {uploadsPending && !loading && <div className="text-center text-sm font-bold text-cream/80" role="status">Mengirim foto ke booth...</div>}
      {uploadError && <div role="alert" className="mx-auto mt-2 max-w-xl rounded-lg bg-cream px-4 py-3 text-center font-bold text-cherry">{uploadError}</div>}
    </main>
  )
}

type CapturedPhoto = { slot_index: number; dataUrl: string; clipDataUrl?: string }

// sama dengan render-gif (booth-api): foto mentah tanpa frame, ganti tiap ±0,8 detik
const GIF_FRAME_MS = 800

function OutputPreview({
  title,
  photos,
  frame,
  customText,
  filter,
  variant = 'strip',
}: {
  title: string
  photos: CapturedPhoto[]
  frame: ReturnType<typeof useKioskStore.getState>['selectedFrame']
  customText: string
  filter: PhotoFilter
  variant?: 'strip' | 'gif' | 'live'
}) {
  const photoAt = (shotIndex: number) => photos.find((item) => item.slot_index === shotIndex)
  // filter hanya pada foto/video, bukan PNG frame — sama dengan hasil render
  const style = { filter: filterCss(filter) }

  return (
    <section className="mx-auto flex w-full max-w-[340px] flex-col items-center" aria-label={title}>
      <h2 className="mb-2 text-center text-2xl font-extrabold text-cream">{title}</h2>
      {variant === 'gif' ? (
        <GifPreview photos={photos} filter={filter} />
      ) : frame ? (
        <FrameComposite
          frame={frame}
          customText={customText}
          renderSlot={(shotIndex) => {
            const photo = photoAt(shotIndex)
            if (!photo) return null
            if (variant === 'live' && photo.clipDataUrl) {
              return <video src={photo.clipDataUrl} poster={photo.dataUrl} autoPlay muted loop playsInline style={style} />
            }
            return <img src={photo.dataUrl} alt={`Foto ${shotIndex + 1}`} style={style} />
          }}
        />
      ) : null}
    </section>
  )
}

function GifPreview({ photos, filter }: { photos: CapturedPhoto[]; filter: PhotoFilter }) {
  const [index, setIndex] = useState(0)
  const [aspect, setAspect] = useState('9/16')

  useEffect(() => {
    if (photos.length < 2) return
    const timer = setInterval(() => setIndex((current) => (current + 1) % photos.length), GIF_FRAME_MS)
    return () => clearInterval(timer)
  }, [photos.length])

  const photo = photos[index % Math.max(1, photos.length)]
  return (
    <div className="gif-preview" style={{ aspectRatio: aspect }}>
      {photo && (
        <img
          src={photo.dataUrl}
          alt={`Foto ${photo.slot_index + 1}`}
          style={{ filter: filterCss(filter) }}
          // GIF mengikuti rasio foto kamera (foto pertama)
          onLoad={(event) => {
            const { naturalWidth, naturalHeight } = event.currentTarget
            if (index === 0 && naturalWidth && naturalHeight) setAspect(`${naturalWidth}/${naturalHeight}`)
          }}
        />
      )}
    </div>
  )
}
