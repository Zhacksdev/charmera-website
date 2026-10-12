import type { Frame } from '../stores/kioskStore'

const BOOTH_API = process.env.NEXT_PUBLIC_BOOTH_API_URL || ''

type FrameSlot = Frame['layout']['slots'][number]

/**
 * Nomor slot unik, urut naik. Foto ke-i (slot_index) mengisi semua slot bernomor shotNumbers[i];
 * slot bernomor sama memakai foto yang sama. Sama dengan booth-api (services/slot-photo.ts).
 */
export function shotNumbers(slots: FrameSlot[]): number[] {
  return [...new Set(slots.map((s) => s.n))].sort((a, b) => a - b)
}

/** Indeks foto (slot_index) yang tampil di slot ini */
export function shotIndexOf(slots: FrameSlot[], slot: FrameSlot): number {
  return shotNumbers(slots).indexOf(slot.n)
}

/** PNG frame dengan slot transparan, disajikan booth-api */
export function frameImageUrl(frame: Frame): string {
  return `${BOOTH_API}${frame.image_url || `/api/frames/${frame.id}/image`}`
}
