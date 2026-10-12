import sharp from 'sharp'
import type { Slot } from '@chamera/shared'

// Lebihkan foto beberapa piksel ke bawah frame agar tepi anti-alias slot tidak menampakkan celah putih
const BLEED = 4

/**
 * Foto di-crop "cover" tepat seukuran slot (+bleed), dipotong agar tidak keluar kanvas.
 * Sharp menolak overlay yang lebih besar dari kanvas — tanpa crop, foto 16:9 di slot tinggi gagal dirender.
 */
export async function photoForSlot(
  photo: Buffer | string,
  slot: Pick<Slot, 'x' | 'y' | 'w' | 'h'>,
  canvas: { w: number; h: number }
): Promise<sharp.OverlayOptions> {
  const left = Math.max(0, Math.round(slot.x) - BLEED)
  const top = Math.max(0, Math.round(slot.y) - BLEED)
  const right = Math.min(canvas.w, Math.round(slot.x + slot.w) + BLEED)
  const bottom = Math.min(canvas.h, Math.round(slot.y + slot.h) + BLEED)

  const input = await sharp(photo)
    .rotate()
    .resize(right - left, bottom - top, { fit: 'cover', position: 'centre' })
    .toBuffer()

  return { input, left, top }
}
