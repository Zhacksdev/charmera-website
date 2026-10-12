'use client'

import { useEffect } from 'react'

// Perilaku kiosk untuk tablet (Chrome Android / Chrome iPad):
// layar tetap menyala selama booth terbuka, dan fullscreen pada sentuhan pertama
// (browser hanya mengizinkan fullscreen dari gestur pengguna).
export function KioskRuntime() {
  useEffect(() => {
    let wakeLock: { release: () => Promise<void> } | null = null

    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator && document.visibilityState === 'visible') {
          wakeLock = await (navigator as any).wakeLock.request('screen')
        }
      } catch {
        // ditolak (baterai lemah / tidak didukung) — abaikan
      }
    }

    const enterFullscreen = () => {
      const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void }
      const doc = document as Document & { webkitFullscreenElement?: Element }
      if (document.fullscreenElement || doc.webkitFullscreenElement) return
      if (el.requestFullscreen) {
        el.requestFullscreen().catch(() => {})
      } else {
        el.webkitRequestFullscreen?.()
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') requestWakeLock()
    }

    requestWakeLock()
    document.addEventListener('visibilitychange', onVisibility)
    document.addEventListener('pointerdown', enterFullscreen)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      document.removeEventListener('pointerdown', enterFullscreen)
      wakeLock?.release().catch(() => {})
    }
  }, [])

  return null
}
