'use client'

import { useRef, useState, useCallback } from 'react'

interface UseClipRecorderOptions {
  mimeType?: string
  maxDuration?: number
}

export function useClipRecorder(options: UseClipRecorderOptions = {}) {
  const {
    mimeType,
    maxDuration = 10000
  } = options

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const resolvedMimeTypeRef = useRef<string>('video/webm')

  const [isRecording, setIsRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const getSupportedMimeType = useCallback((): string => {
    if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) return 'video/webm;codecs=vp9'
    if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) return 'video/webm;codecs=vp8'
    if (MediaRecorder.isTypeSupported('video/webm')) return 'video/webm'
    if (MediaRecorder.isTypeSupported('video/mp4')) return 'video/mp4'
    return 'video/webm'
  }, [])

  const startRecording = useCallback((stream: MediaStream) => {
    try {
      chunksRef.current = []
      streamRef.current = stream

      const resolvedMimeType = mimeType || getSupportedMimeType()
      resolvedMimeTypeRef.current = resolvedMimeType

      const recorder = new MediaRecorder(stream, { 
        mimeType: resolvedMimeType,
        videoBitsPerSecond: 2500000
      })
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
      }

      recorder.start(1000)
      setIsRecording(true)
      setError(null)
    } catch (err: any) {
      console.error('Recording error:', err)
      setError(err.message || 'Failed to start recording')
    }
  }, [mimeType, getSupportedMimeType])

  const stopRecording = useCallback((): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      if (!mediaRecorderRef.current) {
        reject(new Error('No recorder'))
        return
      }

      const recorder = mediaRecorderRef.current

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: resolvedMimeTypeRef.current })
        setIsRecording(false)
        resolve(blob)
      }

      recorder.onerror = (err) => {
        setError('Recording failed')
        setIsRecording(false)
        reject(err)
      }

      recorder.stop()
    })
  }, [])

  const getClipBlob = useCallback(async (): Promise<Blob | null> => {
    try {
      const blob = await stopRecording()
      return blob
    } catch (err) {
      console.error('Failed to get clip blob:', err)
      return null
    }
  }, [stopRecording])

  const getClipDataUrl = useCallback(async (): Promise<string | null> => {
    try {
      const blob = await stopRecording()
      return new Promise((resolve) => {
        const reader = new FileReader()
        reader.onloadend = () => {
          resolve(reader.result as string)
        }
        reader.readAsDataURL(blob)
      })
    } catch (err) {
      console.error('Failed to get clip data:', err)
      return null
    }
  }, [stopRecording])

  return {
    isRecording,
    error,
    startRecording,
    stopRecording,
    getClipBlob,
    getClipDataUrl
  }
}
