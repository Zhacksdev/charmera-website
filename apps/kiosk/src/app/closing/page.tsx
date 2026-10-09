'use client'

import { Suspense } from 'react'
import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useKioskStore } from '../../stores/kioskStore'

const CLOSING_TIMER = 5

export default function ClosingPage() {
  return <Suspense fallback={<main className="flex min-h-screen items-center justify-center text-cream">Terima kasih sudah berfoto di Chamera</main>}><ClosingContent /></Suspense>
}

function ClosingContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session')
  const { reset } = useKioskStore()

  useEffect(() => {
    reset()
    
    const timer = setTimeout(() => {
      router.push('/')
    }, CLOSING_TIMER * 1000)
    
    return () => clearTimeout(timer)
  }, [reset, router])

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-10 px-6 py-10 text-center">
      <h1 className="text-3xl font-extrabold text-cream md:text-5xl">Terima kasih sudah berfoto di</h1>
      <img src="/logo.png" alt="Chamera, Wear your memories" className="w-[min(70vw,500px)] object-contain" />
      <p className="text-lg font-extrabold text-cream/80">#WearYourChamera</p>
    </main>
  )
}
