export interface LayoutSlot {
  n: number
  x: number
  y: number
  w: number
  h: number
}

export type SlotPattern = 'per_slot' | 'per_column'

/** Kelompokkan slot yang posisinya sejajar (tumpang tindih lebih dari setengah ukuran slot) */
function groupBy(slots: LayoutSlot[], start: (s: LayoutSlot) => number, size: (s: LayoutSlot) => number): LayoutSlot[][] {
  const sorted = [...slots].sort((a, b) => start(a) - start(b))
  const groups: LayoutSlot[][] = []
  for (const slot of sorted) {
    const group = groups[groups.length - 1]
    if (group && Math.abs(start(slot) - start(group[0])) < size(group[0]) / 2) group.push(slot)
    else groups.push([slot])
  }
  return groups
}

const columnsOf = (slots: LayoutSlot[]) => groupBy(slots, (s) => s.x, (s) => s.w)
  .map((column) => [...column].sort((a, b) => a.y - b.y))
const rowsOf = (slots: LayoutSlot[]) => groupBy(slots, (s) => s.y, (s) => s.h)
  .map((row) => [...row].sort((a, b) => a.x - b.x))

/**
 * per_slot   : tiap slot foto berbeda, urut baris (1 2 / 3 4 / 5 6)
 * per_column : tiap kolom strip berisi foto yang sama, urut atas-bawah (1 2 3 · 1 2 3) —
 *              untuk kertas 4R berisi dua strip yang dipotong
 * Kiosk & render: slot bernomor sama memakai satu foto.
 */
export function renumberSlots<T extends LayoutSlot>(slots: T[], pattern: SlotPattern): T[] {
  const numbered = new Map<T, number>()
  if (pattern === 'per_column') {
    for (const column of columnsOf(slots)) column.forEach((slot, row) => numbered.set(slot as T, row + 1))
  } else {
    let n = 1
    for (const row of rowsOf(slots)) for (const slot of row) numbered.set(slot as T, n++)
  }
  return slots.map((slot) => ({ ...slot, n: numbered.get(slot) ?? slot.n }))
}

/** Pola saat ini, atau null bila nomor slot diatur manual dengan pola lain */
export function detectPattern(slots: LayoutSlot[]): SlotPattern | null {
  const same = (pattern: SlotPattern) => renumberSlots(slots, pattern).every((s, i) => s.n === slots[i].n)
  if (same('per_column') && columnsOf(slots).length > 1) return 'per_column'
  if (same('per_slot')) return 'per_slot'
  return null
}

/** Default untuk frame baru: beberapa kolom dengan jumlah slot sama = strip berdampingan */
export function defaultPattern(slots: LayoutSlot[]): SlotPattern {
  const columns = columnsOf(slots)
  return columns.length > 1 && columns.every((c) => c.length === columns[0].length && c.length > 1)
    ? 'per_column'
    : 'per_slot'
}

/**
 * Kategori frame (dipilih admin saat upload):
 * - cut     : kertas 4R berisi beberapa strip yang dipotong — tiap strip berisi foto yang sama (1 2 3 · 1 2 3)
 * - non_cut : satu lembar utuh — tiap slot foto berbeda (1 – n)
 */
export type FrameCategory = 'cut' | 'non_cut'

export const CATEGORY_LABEL: Record<FrameCategory, string> = { cut: 'Cut', non_cut: 'Non-cut' }
export const CATEGORY_HINT: Record<FrameCategory, string> = {
  cut: 'Dua strip dalam satu 4R untuk dipotong — foto 1 2 3 diulang di tiap strip',
  non_cut: 'Satu lembar utuh — tiap slot berisi foto berbeda',
}

const CATEGORY_PATTERN: Record<FrameCategory, SlotPattern> = { cut: 'per_column', non_cut: 'per_slot' }

/** Kategori tersimpan di layout; frame lama tanpa kategori ditebak dari penomoran slotnya */
export function frameCategory(layout: { slots?: LayoutSlot[]; category?: unknown } | undefined): FrameCategory {
  if (layout?.category === 'cut' || layout?.category === 'non_cut') return layout.category
  return layout?.slots && detectPattern(layout.slots) === 'per_column' ? 'cut' : 'non_cut'
}

/** Layout dengan kategori + nomor slot sesuai kategori itu */
export function applyCategory<L extends { slots: LayoutSlot[] }>(layout: L, category: FrameCategory): L & { category: FrameCategory } {
  return { ...layout, category, slots: renumberSlots(layout.slots, CATEGORY_PATTERN[category]) }
}

export function shotCount(slots: LayoutSlot[]): number {
  return new Set(slots.map((s) => s.n)).size
}
