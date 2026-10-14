'use client'

import { Suspense } from 'react'
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

const BOOTH_API = process.env.NEXT_PUBLIC_BOOTH_API_URL || ''

export default function ProcessingPage() {
  return <Suspense fallback={<main className="kiosk-page items-center justify-center text-cream">Memproses hasil...</main>}><ProcessingContent /></Suspense>
}

function ProcessingContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session')
  
  const [status, setStatus] = useState<string>('processing')
  const [outputs, setOutputs] = useState<any[]>([])
  const [progress, setProgress] = useState(0)
  const [config, setConfig] = useState<any>(null)
  const [errorMessage, setErrorMessage] = useState('')

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

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined
    let polling = false

    const pollResult = async () => {
      if (!sessionId || polling || errorMessage) return
      polling = true
      try {
        const res = await fetch(`${BOOTH_API}/api/sessions/${sessionId}/result`)
        if (res.status === 404) {
          setErrorMessage('Sesi tidak ditemukan. Silakan mulai sesi baru.')
          if (interval) clearInterval(interval)
          return
        }
        if (res.ok) {
          const data = await res.json()
          setStatus(data.status)
          setOutputs(data.outputs || [])
          
          const doneCount = (data.outputs || []).filter((o: any) => o.status === 'done').length
          const totalOutputs = data.total_jobs || data.outputs?.length || 1
          setProgress(Math.floor((doneCount / totalOutputs) * 100))

          // sesi 'completed' = strip jadi; GIF/Live yang gagal tidak membatalkan QR & cetak
          if (data.status === 'abandoned' || data.status === 'failed') {
            setErrorMessage('Sesi foto tidak selesai diproses. Silakan kembali dan mulai sesi baru.')
            if (interval) clearInterval(interval)
            return
          }
          
          if (data.status === 'completed') {
            if (interval) clearInterval(interval)
            setTimeout(() => {
              router.push(`/result?session=${sessionId}`)
            }, 500)
          }
        }
      } catch (err) {
        console.error('Failed to poll result:', err)
      } finally {
        polling = false
      }
    }

    void pollResult()
    interval = setInterval(() => void pollResult(), 2000)
    
    return () => clearInterval(interval)
  }, [sessionId, router, errorMessage])

  const outputMode = config?.output_mode || 'photo_only'

  return (
    <main className="kiosk-page items-center justify-center gap-8 text-center">
      <img src="/logo.png" alt="Chamera, Wear your memories" className="w-[min(38vw,250px)] object-contain" />
      <div className="w-full max-w-5xl">
        <div className="mb-4 text-2xl font-extrabold text-cream md:text-4xl">Fotomu sedang diproses</div>
        {errorMessage ? (
          <div role="alert" className="mx-auto mb-8 max-w-xl space-y-5 rounded-xl bg-cream p-6 text-char">
            <p className="text-lg font-bold text-cherry">{errorMessage}</p>
            <button onClick={() => router.push('/')} className="btn-primary">Mulai sesi baru</button>
          </div>
        ) : (
          <>
            <div className="mb-8 text-xl font-bold text-cream/85 md:text-3xl">Tunggu sebentar ya</div>
            <div className="mb-8 h-12 w-full overflow-hidden rounded-full bg-cream p-1">
              <div className="h-full rounded-full bg-butter transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
          </>
        )}
        <div className="mx-auto grid max-w-3xl grid-cols-1 gap-3 text-left sm:grid-cols-3">
          <div className="flex items-center gap-3">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
              outputs.find(o => o.type === 'strip')?.status === 'done' 
                ? 'bg-cherry text-cream' 
                : 'bg-line text-char'
            }`}>
              {outputs.find(o => o.type === 'strip')?.status === 'done' ? '✓' : '1'}
            </div>
            <span className="text-lg font-bold text-cream">Foto Strip</span>
          </div>
          
          {outputMode === 'full' && (
            <>
              <div className="flex items-center gap-3">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                  outputs.find(o => o.type === 'gif')?.status === 'done' 
                    ? 'bg-cherry text-cream' 
                    : 'bg-line text-char'
                }`}>
                  {outputs.find(o => o.type === 'gif')?.status === 'done' ? '✓' : '2'}
                </div>
                <span className="text-lg font-bold text-cream">GIF</span>
              </div>
              
              <div className="flex items-center gap-3">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                  outputs.find(o => o.type === 'live_h264' || o.type === 'live_h265')?.status === 'done' 
                    ? 'bg-cherry text-cream' 
                    : 'bg-line text-char'
                }`}>
                  {outputs.find(o => o.type === 'live_h264' || o.type === 'live_h265')?.status === 'done' ? '✓' : '3'}
                </div>
                <span className="text-lg font-bold text-cream">Live Photo</span>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  )
}
