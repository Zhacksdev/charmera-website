'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

interface UseCameraOptions {
  width?: number
  height?: number
  facingMode?: 'user' | 'environment'
  mirror?: boolean
}

export function useCamera(options: UseCameraOptions = {}) {
  const {
    width = 1920,
    height = 1080,
    facingMode = 'user',
    mirror = true
  } = options

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  // generation counter: membatalkan startCamera lama saat stop/remount
  const generationRef = useRef(0)
  const [isReady, setIsReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])

  useEffect(() => {
    async function getDevices() {
      try {
        const deviceList = await navigator.mediaDevices.enumerateDevices()
        setDevices(deviceList.filter(d => d.kind === 'videoinput'))
      } catch (err) {
        console.error('Failed to enumerate devices:', err)
      }
    }

    getDevices()
  }, [])

  const stopCamera = useCallback(() => {
    generationRef.current++
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setIsReady(false)
  }, [])

  const startCamera = useCallback(async (deviceId?: string) => {
    const gen = ++generationRef.current

    try {
      setError(null)
      setIsReady(false)

      const constraints: MediaStreamConstraints = {
        video: {
          width: { ideal: width },
          height: { ideal: height },
          facingMode,
          deviceId: deviceId ? { exact: deviceId } : undefined
        },
        audio: false
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)

      // start lama sudah dibatalkan (unmount/remount) — lepaskan stream ini
      if (gen !== generationRef.current) {
        stream.getTracks().forEach(track => track.stop())
        return
      }

      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        try {
          await videoRef.current.play()
        } catch (err: any) {
          // AbortError: play() terputus oleh reload/remount — bukan error sungguhan
          if (err?.name !== 'AbortError') {
            throw err
          }
        }
      }

      if (gen !== generationRef.current) {
        stream.getTracks().forEach(track => track.stop())
        return
      }

      setIsReady(true)
    } catch (err: any) {
      if (gen !== generationRef.current) return
      console.error('Camera error:', err)
      setError(err?.message || 'Failed to access camera')
    }
  }, [width, height, facingMode])

  const capturePhoto = useCallback((): string | null => {
    if (!videoRef.current || !isReady) return null

    const video = videoRef.current
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    ctx.drawImage(video, 0, 0)
    return canvas.toDataURL('image/jpeg', 0.95)
  }, [isReady])

  useEffect(() => {
    return () => {
      stopCamera()
    }
  }, [stopCamera])

  return {
    videoRef,
    streamRef,
    isReady,
    error,
    devices,
    startCamera,
    stopCamera,
    capturePhoto
  }
}
