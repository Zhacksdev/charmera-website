'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

const PUBLIC_API = process.env.NEXT_PUBLIC_API_URL || 'https://domain.com/api/public'

interface DownloadFile {
  type: string
  s3_key: string
  url?: string | null
  download_url?: string | null
}

// QR biasanya di-scan sebelum file selesai: tunggu sesi muncul, lalu muat ulang sampai semua file masuk
const RETRY_MS = 4000
const MAX_WAIT_MS = 10 * 60 * 1000

export default function DownloadPage() {
  const params = useParams()
  const code = typeof params?.code === 'string' ? params.code : Array.isArray(params?.code) ? params.code[0] : null

  const [status, setStatus] = useState<'loading' | 'processing' | 'ready' | 'error'>('loading')
  const [files, setFiles] = useState<DownloadFile[]>([])
  const [complete, setComplete] = useState(false)
  const [error, setError] = useState<string>('')
  const [expiresAt, setExpiresAt] = useState<string>('')

  useEffect(() => {
    if (!code) {
      setStatus('error')
      setError('Kode tidak valid')
      return
    }

    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout>
    const startedAt = Date.now()

    const retryLater = () => {
      if (Date.now() - startedAt > MAX_WAIT_MS) return false
      retryTimer = setTimeout(fetchDownloads, RETRY_MS)
      return true
    }

    const waitForSession = (message: string) => {
      if (retryLater()) {
        setStatus('processing')
        setError(message)
      } else {
        setStatus('error')
        setError('Hasil foto belum tersedia. Coba buka lagi link ini beberapa menit lagi.')
      }
    }

    async function fetchDownloads() {
      if (cancelled) return
      try {
        const res = await fetch(`${PUBLIC_API}/download/${code}`)
        const data = await res.json()

        if (cancelled) return

        if (res.status === 202 || res.status === 404 || data.status === 'processing') {
          waitForSession(data.message || 'Fotomu sedang disiapkan...')
        } else if (res.ok && data.status === 'ready') {
          const incoming: DownloadFile[] = data.files || []
          // link presigned berubah tiap request — pertahankan yang lama agar preview tidak memuat ulang
          setFiles((current) => [
            ...current,
            ...incoming.filter((file) => !current.some((existing) => existing.type === file.type))
          ])
          setExpiresAt(data.expires_at)
          const isComplete = data.complete !== false
          setComplete(isComplete)
          if (incoming.length === 0 && !isComplete) {
            waitForSession('Fotomu sedang disiapkan...')
            return
          }
          setStatus('ready')
          if (!isComplete && !retryLater()) setComplete(true)
        } else {
          setStatus('error')
          setError(data.message || data.error || 'File tidak ditemukan')
        }
      } catch (err) {
        // jaringan HP putus sesaat — coba lagi, jangan langsung gagal
        if (!cancelled) waitForSession('Menghubungkan...')
      }
    }

    fetchDownloads()

    return () => {
      cancelled = true
      clearTimeout(retryTimer)
    }
  }, [code])

  const byType = (type: string) => files.find((file) => file.type === type && file.url)
  const strip = byType('strip')
  const gif = byType('gif')
  const livePreview = byType('live_h264') || byType('live_h265')
  const liveDownload = byType('live_h265') || byType('live_h264')

  return (
    <main className="flex flex-col items-center min-h-screen px-5 py-10">
      <div className="max-w-md w-full">
        {/* sama dengan layar booth: logo krem di atas latar cherry */}
        <header className="text-center mb-8">
          {/* basePath /download: aset public disajikan di /download/... */}
          <img src="/download/logo.png" alt="Chamera, Wear your memories" className="mx-auto w-[min(56vw,220px)] object-contain" />
          <h1 className="mt-4 text-2xl font-extrabold text-cream">Download hasil foto kamu</h1>
        </header>

        {status === 'loading' && (
          <div className="text-center font-bold text-cream/80">
            Memuat...
          </div>
        )}

        {status === 'processing' && (
          <div className="card text-center">
            <div className="mb-4">
              <div className="w-12 h-12 border-4 border-cherry border-t-transparent rounded-full animate-spin mx-auto" />
            </div>
            <p className="text-char opacity-75">
              {error}
            </p>
          </div>
        )}

        {status === 'ready' && (
          <div className="space-y-4">
            {strip && (
              <OutputCard title="Foto Strip" downloadUrl={strip.download_url || strip.url!}>
                <img src={strip.url!} alt="Foto strip" className="w-full rounded-lg" />
              </OutputCard>
            )}
            {gif && (
              <OutputCard title="GIF" downloadUrl={gif.download_url || gif.url!}>
                <img src={gif.url!} alt="GIF animasi" className="w-full rounded-lg" />
              </OutputCard>
            )}
            {livePreview && liveDownload && (
              <OutputCard title="Live Photo" downloadUrl={liveDownload.download_url || liveDownload.url!}>
                <video src={livePreview.url!} autoPlay muted loop playsInline className="w-full rounded-lg" />
              </OutputCard>
            )}

            {!complete && (
              <div className="card flex items-center justify-center gap-3 text-char">
                <div className="w-6 h-6 border-4 border-cherry border-t-transparent rounded-full animate-spin" />
                <span className="opacity-75">File lainnya sedang disiapkan...</span>
              </div>
            )}

            <div className="text-xs text-cream/70 text-center">
              Link berlaku sampai {new Date(expiresAt).toLocaleDateString('id-ID')}
            </div>

            <div className="text-base font-extrabold text-cream text-center mt-6">
              #WearYourChamera
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="card text-center">
            <p className="text-cherry mb-4">⚠️ {error}</p>
            <p className="text-sm text-char opacity-75">
              Coba refresh halaman atau periksa kode QR kamu
            </p>
          </div>
        )}
      </div>
    </main>
  )
}

function OutputCard({ title, downloadUrl, children }: { title: string; downloadUrl: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <div className="text-xl font-extrabold text-cherry mb-3">{title}</div>
      <div className="mb-3">{children}</div>
      <a href={downloadUrl} download className="btn-primary w-full block text-center">
        Download
      </a>
    </div>
  )
}
