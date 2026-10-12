'use client'

import { useSyncExternalStore } from 'react'

/**
 * Orientasi kamera, dipilih lewat tombol di halaman Action dan disimpan per tablet.
 * - 'non_mirror' (default): gambar kamera dibalik horizontal
 * - 'mirror'              : gambar kamera apa adanya
 * Pratinjau, foto, GIF, dan Live selalu mengikuti mode yang sama.
 */
export type MirrorMode = 'mirror' | 'non_mirror'

const STORAGE_KEY = 'chamera.mirror_mode'
const DEFAULT_MODE: MirrorMode = 'non_mirror'
const listeners = new Set<() => void>()

function read(): MirrorMode {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    return value === 'mirror' || value === 'non_mirror' ? value : DEFAULT_MODE
  } catch {
    return DEFAULT_MODE
  }
}

function write(mode: MirrorMode) {
  try {
    window.localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // penyimpanan diblokir — mode tetap berlaku sampai halaman dimuat ulang
  }
  current = mode
  listeners.forEach((listener) => listener())
}

let current: MirrorMode | null = null

export function useMirrorMode(): [MirrorMode, (mode: MirrorMode) => void] {
  const mode = useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => (current ??= read()),
    () => DEFAULT_MODE
  )
  return [mode, write]
}
