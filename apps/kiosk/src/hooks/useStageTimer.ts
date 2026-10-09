'use client'

import { useState, useEffect } from 'react'

interface UseStageTimerOptions {
  sessionId: string | null
  onComplete?: () => void
}

export function useStageTimer({ sessionId, onComplete }: UseStageTimerOptions) {
  const [remainingSec, setRemainingSec] = useState(0)
  const [isExpired, setIsExpired] = useState(false)

  useEffect(() => {
    if (!sessionId) return

    const interval = setInterval(async () => {
      try {
        const BOOTH_API = process.env.NEXT_PUBLIC_BOOTH_API_URL || ''
        const res = await fetch(`${BOOTH_API}/api/sessions/${sessionId}`)
        
        if (res.ok) {
          const data = await res.json()
          setRemainingSec(data.remaining_sec || 0)
          
          if (data.remaining_sec <= 0) {
            setIsExpired(true)
            onComplete?.()
          }
        }
      } catch (err) {
        console.error('Timer poll error:', err)
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [sessionId, onComplete])

  return { remainingSec, isExpired, setRemainingSec }
}
