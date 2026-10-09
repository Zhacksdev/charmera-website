'use client'

import { Suspense } from 'react'
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import QRCode from 'qrcode'

const BOOTH_API = process.env.NEXT_PUBLIC_BOOTH_API_URL || 'http://127.0.0.1:4000'
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
  
  useEffect(() => {
    if (!sessionId) return
    
    async function fetchResult() {
      try {
        const res = await fetch(`${BOOTH_API}/api/sessions/${sessionId}/result`)
        if (res.ok) {
          const data = await res.json()
          setPublicCode(data.public_code)
          setPrintStatus(data.print_status)
          setPrintError(data.print_error)
          
          if (data.qr_url) {
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
    
    fetchResult()
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
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 overflow-y-auto px-6 py-8 text-center">
      <img src="/logo.png" alt="Chamera, Wear your memories" className="w-[min(38vw,220px)] object-contain" />
      <div className="text-2xl font-extrabold text-cream md:text-4xl">Soft file fotomu sudah siap</div>

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
      <div className="timer-pill">{formatTimer(remainingSec)}</div>
    </main>
  )
}

function formatTimer(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}.${String(seconds % 60).padStart(2, '0')}`
}
