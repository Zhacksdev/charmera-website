'use client'

import { useRef, useState, useCallback } from 'react'

interface UseClipRecorderOptions {
  mimeType?: string
  maxDuration?: number
}

export function useClipRecorder(options: UseClipRecorderOptions = {}) {
  const {
    mimeType = 'video/webm',
    maxDuration = 10000
  } = options

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)

  const [isRecording, setIsRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const startRecording = useCallback((stream: MediaStream) => {
    try {
      chunksRef.current = []
      streamRef.current = stream

      const recorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
      }

      recorder.start(100)
      setIsRecording(true)
      setError(null)
    } catch (err: any) {
      console.error('Recording error:', err)
      setError(err.message || 'Failed to start recording')
    }
  }, [mimeType])

  const stopRecording = useCallback((): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      if (!mediaRecorderRef.current) {
        reject(new Error('No recorder'))
        return
      }

      const recorder = mediaRecorderRef.current

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType })
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
  }, [mimeType])

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
    getClipDataUrl
  }
}
