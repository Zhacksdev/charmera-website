'use client'

import { useState, useEffect, useRef } from 'react'

interface UseStageTimerOptions {
  sessionId: string | null
  /** Status server yang termasuk tahap halaman ini. Bila status keluar dari daftar, tahap dianggap selesai. */
  activeStatuses?: string[]
  /** Dipanggil sekali saat timer habis atau server sudah memajukan sesi ke tahap lain. */
  onComplete?: (status: string) => void
}

export function useStageTimer({ sessionId, activeStatuses, onComplete }: UseStageTimerOptions) {
  const [remainingSec, setRemainingSec] = useState(0)
  const [isExpired, setIsExpired] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  // ref: callback dari parent berubah tiap render — jangan me-restart polling karenanya
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete
  const activeRef = useRef(activeStatuses)
  activeRef.current = activeStatuses

  useEffect(() => {
    if (!sessionId) return
    let fired = false

    const interval = setInterval(async () => {
      try {
        const BOOTH_API = process.env.NEXT_PUBLIC_BOOTH_API_URL || ''
        const res = await fetch(`${BOOTH_API}/api/sessions/${sessionId}`)

        if (res.ok) {
          const data = await res.json()
          setRemainingSec(data.remaining_sec || 0)
          setStatus(data.status)

          const leftStage = !!activeRef.current && !activeRef.current.includes(data.status)
          if (!fired && (data.remaining_sec <= 0 || leftStage)) {
            fired = true
            setIsExpired(true)
            onCompleteRef.current?.(data.status)
          }
        }
      } catch (err) {
        console.error('Timer poll error:', err)
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [sessionId])

  return { remainingSec, isExpired, status, setRemainingSec }
}
