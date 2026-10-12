'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useKioskStore } from '../stores/kioskStore'

const BOOTH_API = process.env.NEXT_PUBLIC_BOOTH_API_URL || ''
const HOLD_MS = 5000
// indikator baru tampil setelah jeda ini, agar sentuhan biasa tidak memunculkan apa pun
const SHOW_PROGRESS_AFTER_MS = 1000
const MOVE_TOLERANCE_PX = 30
// tahap yang masih boleh dibatalkan; setelah Preview (QR tampil) hasil tamu tidak dihapus
const RESETTABLE_PAGES = ['/frame', '/action', '/preview']

/**
 * Tekan & tahan layar 5 detik di mana saja selama sesi berjalan → konfirmasi reset → kembali ke awal.
 * Untuk petugas booth bila tamu pergi di tengah sesi.
 */
export function LongPressReset() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session')
  const resetStore = useKioskStore((state) => state.reset)

  const [progress, setProgress] = useState(0)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [resetting, setResetting] = useState(false)
  const swallowClickRef = useRef(false)

  const active = pathname !== '/' && pathname !== '/operator'

  useEffect(() => {
    if (!active || confirmOpen) return

    let pointerId: number | null = null
    let startX = 0
    let startY = 0
    let startedAt = 0
    let frame = 0

    const stop = () => {
      pointerId = null
      cancelAnimationFrame(frame)
      setProgress(0)
    }

    const tick = () => {
      if (pointerId === null) return
      const elapsed = Date.now() - startedAt
      setProgress(elapsed < SHOW_PROGRESS_AFTER_MS ? 0 : Math.min(1, elapsed / HOLD_MS))
      if (elapsed >= HOLD_MS) {
        stop()
        // jari dilepas setelah popup muncul akan memicu klik pada tombol di bawahnya — telan sekali
        swallowClickRef.current = true
        setConfirmOpen(true)
        return
      }
      frame = requestAnimationFrame(tick)
    }

    const onDown = (event: PointerEvent) => {
      if (pointerId !== null) return stop() // dua jari = bukan tekan-lama
      pointerId = event.pointerId
      startX = event.clientX
      startY = event.clientY
      startedAt = Date.now()
      frame = requestAnimationFrame(tick)
    }

    const onMove = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return
      if (Math.hypot(event.clientX - startX, event.clientY - startY) > MOVE_TOLERANCE_PX) stop()
    }

    const onUp = (event: PointerEvent) => {
      if (event.pointerId === pointerId) stop()
    }

    document.addEventListener('pointerdown', onDown)
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onUp)
    return () => {
      stop()
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onUp)
    }
  }, [active, confirmOpen])

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!swallowClickRef.current) return
      swallowClickRef.current = false
      event.preventDefault()
      event.stopPropagation()
    }
    // tekan-lama di tablet juga bisa membuka menu konteks
    const onContextMenu = (event: Event) => {
      if (active) event.preventDefault()
    }
    document.addEventListener('click', onClick, true)
    document.addEventListener('contextmenu', onContextMenu)
    return () => {
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('contextmenu', onContextMenu)
    }
  }, [active])

  const handleReset = async () => {
    setResetting(true)
    try {
      if (sessionId && RESETTABLE_PAGES.includes(pathname)) {
        await fetch(`${BOOTH_API}/api/sessions/${sessionId}/reset`, { method: 'POST' })
      }
    } catch (err) {
      console.error('Failed to reset session:', err)
    }
    resetStore()
    setConfirmOpen(false)
    setResetting(false)
    router.push('/')
  }

  if (!active) return null

  return (
    <>
      {progress > 0 && (
        <div className="pointer-events-none fixed left-1/2 top-1/2 z-[60] -translate-x-1/2 -translate-y-1/2 text-center" aria-hidden="true">
          <svg width="120" height="120" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="50" fill="rgba(38,33,31,0.7)" stroke="rgba(255,244,227,0.3)" strokeWidth="8" />
            <circle
              cx="60" cy="60" r="50" fill="none" stroke="var(--butter)" strokeWidth="8" strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 50}
              strokeDashoffset={2 * Math.PI * 50 * (1 - progress)}
              transform="rotate(-90 60 60)"
            />
          </svg>
          <div className="mt-2 rounded-lg bg-char/80 px-3 py-1 text-sm font-bold text-cream">Tahan untuk reset sesi</div>
        </div>
      )}

      {confirmOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-char/70 p-6" role="dialog" aria-modal="true" aria-labelledby="reset-title">
          <div className="w-full max-w-md rounded-[24px] bg-cream p-6 text-center shadow-2xl">
            <h2 id="reset-title" className="mb-2 text-2xl font-extrabold text-cherry">Reset sesi?</h2>
            <p className="mb-6 text-char">
              {RESETTABLE_PAGES.includes(pathname)
                ? 'Sesi ini dibatalkan dan foto yang sudah diambil dihapus. Booth kembali ke halaman awal.'
                : 'Booth kembali ke halaman awal. Hasil foto sesi ini tetap tersimpan.'}
            </p>
            <div className="flex justify-center gap-3">
              <button onClick={() => setConfirmOpen(false)} disabled={resetting} className="btn-secondary min-w-32">Batal</button>
              <button onClick={handleReset} disabled={resetting} className="btn-primary min-w-32">{resetting ? 'Mereset...' : 'Reset'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
