import sharp from 'sharp'
import type { Slot } from '@chamera/shared'
import { applySharpFilter, type PhotoFilter } from './photo-filter.js'

// Lebihkan foto beberapa piksel ke bawah frame agar tepi anti-alias slot tidak menampakkan celah putih
const BLEED = 4

type NumberedSlot = Pick<Slot, 'n' | 'x' | 'y' | 'w' | 'h'>

/**
 * Nomor slot unik, urut naik. Foto ke-i (slot_index dari kiosk) mengisi semua slot bernomor
 * shotNumbers[i] — slot bernomor sama memakai foto yang sama (mis. dua strip berdampingan).
 * Kiosk memakai aturan yang sama (apps/kiosk/src/lib/frame-layout.ts).
 */
export function shotNumbers(slots: NumberedSlot[]): number[] {
  return [...new Set(slots.map((s) => s.n))].sort((a, b) => a - b)
}

export function slotsForShot<T extends NumberedSlot>(slots: T[], shotIndex: number): T[] {
  const n = shotNumbers(slots)[shotIndex]
  return n === undefined ? [] : slots.filter((s) => s.n === n)
}

/**
 * Foto di-crop "cover" tepat seukuran slot (+bleed), dipotong agar tidak keluar kanvas.
 * Sharp menolak overlay yang lebih besar dari kanvas — tanpa crop, foto 16:9 di slot tinggi gagal dirender.
 */
export async function photoForSlot(
  photo: Buffer | string,
  slot: Pick<Slot, 'x' | 'y' | 'w' | 'h'>,
  canvas: { w: number; h: number },
  filter?: PhotoFilter
): Promise<sharp.OverlayOptions> {
  const left = Math.max(0, Math.round(slot.x) - BLEED)
  const top = Math.max(0, Math.round(slot.y) - BLEED)
  const right = Math.min(canvas.w, Math.round(slot.x + slot.w) + BLEED)
  const bottom = Math.min(canvas.h, Math.round(slot.y + slot.h) + BLEED)

  // resize dulu ke buffer: operasi warna/blur sharp berjalan sebelum resize bila dalam satu pipeline
  const resized = await sharp(photo)
    .rotate()
    .resize(right - left, bottom - top, { fit: 'cover', position: 'centre' })
    .toBuffer()
  const input = await (await applySharpFilter(resized, filter, right - left)).toBuffer()

  return { input, left, top }
}
