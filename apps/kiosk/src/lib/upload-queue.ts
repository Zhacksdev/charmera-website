'use client'

import { useSyncExternalStore } from 'react'

// Antrean unggah foto/klip di tingkat modul — tetap berjalan saat halaman berganti (Action → Preview),
// jadi tamu tidak menunggu upload selesai untuk melihat Preview.

const BOOTH_API = process.env.NEXT_PUBLIC_BOOTH_API_URL || ''
const UPLOAD_ATTEMPTS = 3

export type UploadState = 'uploading' | 'done' | 'failed'

interface ShotUpload {
  state: UploadState
  promise: Promise<boolean>
}

const sessions = new Map<string, Map<number, ShotUpload>>()
const listeners = new Set<() => void>()
let snapshot: Record<string, Record<number, UploadState>> = {}

function emit() {
  snapshot = Object.fromEntries(
    Array.from(sessions, ([sessionId, shots]) => [sessionId, Object.fromEntries(Array.from(shots, ([slot, u]) => [slot, u.state]))])
  )
  listeners.forEach((listener) => listener())
}

function shotsOf(sessionId: string) {
  let shots = sessions.get(sessionId)
  if (!shots) {
    shots = new Map()
    sessions.set(sessionId, shots)
  }
  return shots
}

/** Unggah satu jepretan (dengan retry). Jepretan ulang di slot yang sama menggantikan yang lama. */
export function enqueueUpload(sessionId: string, slotIndex: number, photo: Blob, clip: Blob | null, flip: boolean): Promise<boolean> {
  const shots = shotsOf(sessionId)

  const run = async (): Promise<boolean> => {
    for (let attempt = 1; attempt <= UPLOAD_ATTEMPTS; attempt++) {
      try {
        const formData = new FormData()
        formData.append('slot_index', slotIndex.toString())
        formData.append('flip', flip ? '1' : '0')
        formData.append('photo', photo, `slot_${slotIndex}.jpg`)
        if (clip) formData.append('clip', clip, `slot_${slotIndex}.${clip.type.includes('mp4') ? 'mp4' : 'webm'}`)

        const res = await fetch(`${BOOTH_API}/api/sessions/${sessionId}/photos`, { method: 'POST', body: formData })
        if (res.ok) return true
        console.error(`Upload slot ${slotIndex} HTTP ${res.status}`)
      } catch (err) {
        console.error(`Upload slot ${slotIndex} failed:`, err)
      }
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000))
    }
    return false
  }

  const promise = run().then((ok) => {
    // hanya catat hasil bila belum digantikan jepretan ulang
    if (shots.get(slotIndex)?.promise === promise) {
      shots.set(slotIndex, { state: ok ? 'done' : 'failed', promise })
      emit()
    }
    return ok
  })
  shots.set(slotIndex, { state: 'uploading', promise })
  emit()
  return promise
}

/** true bila semua jepretan sesi sudah sampai di booth */
export async function waitForUploads(sessionId: string): Promise<boolean> {
  const shots = sessions.get(sessionId)
  if (!shots) return true
  const results = await Promise.all(Array.from(shots.values(), (u) => u.promise))
  return results.every(Boolean)
}

export function useUploadStates(sessionId: string | null): Record<number, UploadState> {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => (sessionId ? snapshot[sessionId] : undefined) || EMPTY,
    () => EMPTY
  )
}

const EMPTY: Record<number, UploadState> = {}
