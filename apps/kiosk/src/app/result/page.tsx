'use client'

import { Suspense } from 'react'
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import QRCode from 'qrcode'

const BOOTH_API = process.env.NEXT_PUBLIC_BOOTH_API_URL || ''
// default bila timer_snapshot sesi tidak tersedia; nilai sebenarnya dari pengaturan admin
const QR_TIMER = 15

export default function ResultPage() {
  return <Suspense fallback={<main className="flex min-h-screen items-center justify-center text-cream">Menyiapkan QR...</main>}><ResultContent /></Suspense>
}

function ResultContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session')
  
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [publicCode, setPublicCode] = useState('')
  const [remainingSec, setRemainingSec] = useState(QR_TIMER)
  const [printStatus, setPrintStatus] = useState<string | null>(null)
  const [printError, setPrintError] = useState<string | null>(null)
  const [outputs, setOutputs] = useState<Array<{ type: string; status: string }>>([])
  const [failedTypes, setFailedTypes] = useState<string[]>([])
  const [outputMode, setOutputMode] = useState<'photo_only' | 'full'>('photo_only')
  const [sessionFailed, setSessionFailed] = useState(false)

  useEffect(() => {
    if (!sessionId) return
    let qrRendered = false
    
    async function fetchResult() {
      try {
        const res = await fetch(`${BOOTH_API}/api/sessions/${sessionId}/result`)
        if (res.ok) {
          const data = await res.json()
          setPublicCode(data.public_code)
          setPrintStatus(data.print_status)
          setPrintError(data.print_error)
          setOutputs(data.outputs || [])
          setFailedTypes((data.failed_jobs || []).map((j: { type: string }) => j.type))
          setSessionFailed(data.status === 'failed' || data.status === 'abandoned')
          
          if (data.qr_url && !qrRendered) {
            qrRendered = true
            const qrData = await QRCode.toDataURL(data.qr_url, {
              width: 256,
              margin: 2,
              color: {
                dark: '#26211F',
                light: '#FFFFFF'
              }
            })
            setQrDataUrl(qrData)
          }
        }
      } catch (err) {
        console.error('Failed to fetch result:', err)
      }
    }

    async function fetchTimer() {
      try {
        const res = await fetch(`${BOOTH_API}/api/sessions/${sessionId}`)
        if (res.ok) {
          const data = await res.json()
          const qrSec = Number(data.timer_snapshot?.qr)
          if (qrSec > 0) setRemainingSec(qrSec)
        }
      } catch (err) {
        console.error('Failed to fetch session timer:', err)
      }
    }
    
    async function fetchOutputMode() {
      try {
        const res = await fetch(`${BOOTH_API}/api/status`)
        if (res.ok && (await res.json()).output_mode === 'full') setOutputMode('full')
      } catch (err) {
        console.error('Failed to fetch output mode:', err)
      }
    }

    fetchResult()
    fetchTimer()
    fetchOutputMode()
    // cetak biasanya masih antre/berjalan saat QR tampil — ikuti statusnya
    const interval = setInterval(fetchResult, 2000)
    return () => clearInterval(interval)
  }, [sessionId])

  useEffect(() => {
    if (remainingSec <= 0) {
      router.push(`/closing?session=${sessionId}`)
      return
    }
    
    const timer = setTimeout(() => {
      setRemainingSec(remainingSec - 1)
    }, 1000)
    
    return () => clearTimeout(timer)
  }, [remainingSec, router, sessionId])

  return (
    <main className="relative flex min-h-screen flex-col overflow-y-auto p-5 md:p-8">
      {/* header sama dengan halaman Frame/Action/Preview: timer di kiri atas */}
      <header className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] items-center gap-2 md:gap-3">
        <div className="timer-pill justify-self-start">{formatTimer(remainingSec)}</div>
        <h1 className="text-center text-xl font-extrabold text-cream md:text-5xl">Soft file fotomu sudah siap</h1>
        <div />
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-6 py-5 text-center">
      <img src="/logo.png" alt="Chamera, Wear your memories" className="w-[min(30vw,180px)] object-contain" />

      <div className="rounded-[28px] bg-cream p-6 shadow-2xl">
          <div className="flex h-[min(58vw,360px)] w-[min(58vw,360px)] items-center justify-center bg-white">
            {qrDataUrl ? (
              <img 
                src={qrDataUrl} 
                alt="QR Code" 
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="text-sm font-bold text-char">Menyiapkan QR...</div>
            )}
          </div>
      </div>

      <div className="max-w-xl text-xl font-extrabold text-cream md:text-3xl">Scan QR untuk mengunduh hasil fotomu</div>

      {sessionFailed ? (
        <div role="alert" className="rounded-xl bg-cream px-5 py-3 font-bold text-cherry">Hasil foto gagal diproses. Hubungi petugas booth.</div>
      ) : (
        // file disiapkan di belakang; halaman download menampilkan tiap file begitu siap
        <ul className="flex flex-wrap justify-center gap-3" aria-label="Status file">
          {[
            { label: 'Foto Strip', types: ['strip'] },
            ...(outputMode === 'full' ? [{ label: 'GIF', types: ['gif'] }, { label: 'Live Photo', types: ['live_h264', 'live_h265'] }] : []),
          ].map(({ label, types }) => {
            const done = outputs.some((o) => types.includes(o.type) && o.status === 'done')
            const failed = !done && types.every((t) => failedTypes.includes(t))
            return (
              <li key={label} className={`rounded-full px-4 py-2 text-sm font-extrabold ${done ? 'bg-butter text-char' : 'bg-cream/20 text-cream'}`}>
                {done ? '✓' : failed ? '✕' : '…'} {label}{!done && !failed ? ' disiapkan' : ''}
              </li>
            )
          })}
        </ul>
      )}
      <div className="rounded-xl bg-cream px-5 py-3 text-cherry">
        <span className="font-bold">Kode:</span> <span className="font-mono font-extrabold">{publicCode || '...'}</span>
      </div>

      {printStatus && (
        <div className={`text-sm font-bold text-cream ${printStatus === 'failed' ? 'text-butter' : ''}`}>
          {printStatus === 'done' && 'Cetak berhasil'}
          {printStatus === 'failed' && `Cetak gagal: ${printError}`}
          {printStatus === 'printing' && 'Sedang mencetak...'}
          {printStatus === 'queued' && 'Menunggu antrean cetak'}
        </div>
      )}

      {printError && <div className="text-sm text-butter">{printError}</div>}
      </div>
    </main>
  )
}

function formatTimer(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}.${String(seconds % 60).padStart(2, '0')}`
}
