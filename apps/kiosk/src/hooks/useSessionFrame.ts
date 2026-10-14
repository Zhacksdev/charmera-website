'use client'

import { useEffect } from 'react'
import { useKioskStore, type Frame } from '../stores/kioskStore'

const BOOTH_API = process.env.NEXT_PUBLIC_BOOTH_API_URL || ''

/**
 * Frame sesi dari store; bila kosong (tablet di-refresh di tengah sesi), dimuat ulang dari booth-api
 * memakai frame_id sesi agar halaman Action/Preview tidak kosong.
 */
export function useSessionFrame(sessionId: string | null): Frame | null {
  const selectedFrame = useKioskStore((state) => state.selectedFrame)
  const selectFrame = useKioskStore((state) => state.selectFrame)

  useEffect(() => {
    if (selectedFrame || !sessionId) return
    let cancelled = false

    ;(async () => {
      try {
        const [sessionRes, framesRes] = await Promise.all([
          fetch(`${BOOTH_API}/api/sessions/${sessionId}`),
          fetch(`${BOOTH_API}/api/frames`),
        ])
        if (!sessionRes.ok || !framesRes.ok) return
        const session = await sessionRes.json()
        const frames: Frame[] = await framesRes.json()
        const frame = frames.find((f) => f.id === session.frame_id)
        if (frame && !cancelled) selectFrame(frame)
      } catch (err) {
        console.error('Failed to restore session frame:', err)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [selectedFrame, sessionId, selectFrame])

  return selectedFrame
}
