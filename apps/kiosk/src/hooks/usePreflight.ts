'use client'

import { useState, useEffect, useRef } from 'react'
import { runPreflight, type PreflightResult } from '../lib/preflight'

interface UsePreflightOptions {
  autoRun?: boolean
  interval?: number
}

export function usePreflight(options: UsePreflightOptions = {}) {
  const { autoRun = true, interval = 60000 } = options

  const [result, setResult] = useState<PreflightResult | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  const [lastChecked, setLastChecked] = useState<Date | null>(null)
  const checkRef = useRef<(() => Promise<PreflightResult | null>) | null>(null)

  const check = async (): Promise<PreflightResult | null> => {
    setIsChecking(true)
    try {
      const preflightResult = await runPreflight()
      setResult(preflightResult)
      setLastChecked(new Date())
      return preflightResult
    } catch (err) {
      console.error('Preflight check failed:', err)
      return null
    } finally {
      setIsChecking(false)
    }
  }

  checkRef.current = check

  useEffect(() => {
    if (!autoRun) return

    // retry cepat (3s) selama belum sehat, longgar setelahnya
    let timer: ReturnType<typeof setTimeout> | undefined
    let stopped = false

    const isHealthy = (r: PreflightResult | null) =>
      !!r && !(
        r.camera.status === 'error' ||
        r.disk.status === 'error' ||
        r.config.status === 'error'
      )

    const loop = async () => {
      if (stopped) return
      const r = (await checkRef.current?.()) ?? null
      if (stopped) return
      timer = setTimeout(loop, isHealthy(r) ? interval : 3000)
    }

    loop()

    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
    }
  }, [autoRun, interval])

  const hasError = result && (
    result.camera.status === 'error' ||
    result.disk.status === 'error' ||
    result.config.status === 'error'
  )

  const hasWarning = result && (
    result.camera.status === 'warning' ||
    result.disk.status === 'warning' ||
    result.config.status === 'warning'
  )

  const canStart = result &&
    result.camera.status !== 'error' &&
    result.disk.status !== 'error' &&
    result.config.status === 'ok' &&
    result.config.hasFrames

  return {
    result,
    isChecking,
    lastChecked,
    hasError,
    hasWarning,
    canStart,
    check
  }
}
