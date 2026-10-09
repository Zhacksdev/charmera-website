'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useKioskStore } from '../stores/kioskStore'
import { usePreflight } from '../hooks'

const BOOTH_API = process.env.NEXT_PUBLIC_BOOTH_API_URL || 'http://127.0.0.1:4000'

export default function HomePage() {
  const router = useRouter()
  const { reset } = useKioskStore()
  const { result: preflight, isChecking, canStart, hasError, hasWarning } = usePreflight()
  
  const [loading, setLoading] = useState(false)
  const [startError, setStartError] = useState('')

  useEffect(() => {
    reset()
  }, [reset])

  const handleStart = async () => {
    if (loading || !canStart) return
    setLoading(true)
    setStartError('')
    
    try {
      const res = await fetch(`${BOOTH_API}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      
      if (!res.ok) throw new Error('Failed to create session')
      
      const data = await res.json()
      router.push(`/frame?session=${data.id}`)
    } catch (err) {
      console.error('Failed to start session:', err)
      setStartError('Sesi belum bisa dimulai. Coba sekali lagi ya.')
      setLoading(false)
    }
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-y-auto px-6 py-10 text-center">
      <div className="welcome-content flex w-full flex-col items-center">
        <img
          src="/logo.png"
          alt="Chamera, Wear your memories"
          className="mb-14 w-[min(72vw,420px)] object-contain drop-shadow-sm"
        />
        
        {isChecking && !preflight && (
          <div className="mb-6 text-cream/80">
            Memeriksa sistem...
          </div>
        )}
        
        {hasError && preflight && (
          <div role="alert" className="mb-6 max-w-xl space-y-2 rounded-xl bg-cream px-5 py-4 text-left text-cherry shadow-lg">
            {preflight.camera.status === 'error' && (
              <div className="text-sm">
                {preflight.camera.message}
              </div>
            )}
            {preflight.disk.status === 'error' && (
              <div className="text-sm">
                {preflight.disk.message}
              </div>
            )}
            {preflight.config.status === 'error' && (
              <div className="text-sm">
                {preflight.config.message}
              </div>
            )}
          </div>
        )}
        
        {hasWarning && preflight && !hasError && (
          <div className="mb-6 space-y-1 text-sm text-cream/85">
            {preflight.camera.status === 'warning' && (
              <div>⚠️ {preflight.camera.message}</div>
            )}
            {preflight.disk.status === 'warning' && (
              <div>⚠️ {preflight.disk.message}</div>
            )}
          </div>
        )}
        
        <button
          onClick={handleStart}
          disabled={loading || !canStart}
          className="btn-primary min-h-24 w-full max-w-[min(88vw,1120px)] rounded-full px-10 py-5 text-2xl shadow-xl md:text-3xl"
        >
          {loading ? 'Menyiapkan sesi...' : 'Mulai aja dulu!'}
        </button>
        {startError && <p role="alert" className="mt-4 text-sm text-cream">{startError}</p>}

        <div className="mt-8 text-sm font-extrabold text-cream/70">
          #WearYourChamera
        </div>
      </div>
    </main>
  )
}
