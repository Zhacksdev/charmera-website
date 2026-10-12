import type sharp from 'sharp'

/** Filter yang bisa dipilih tamu di Preview. Kiosk memakai padanan CSS (apps/kiosk/src/lib/photo-filters.ts). */
export const PHOTO_FILTERS = ['none', 'bw', 'vintage', 'sepia', 'smooth'] as const
export type PhotoFilter = typeof PHOTO_FILTERS[number]

export function isPhotoFilter(value: unknown): value is PhotoFilter {
  return typeof value === 'string' && (PHOTO_FILTERS as readonly string[]).includes(value)
}

// matriks sepia klasik, dan campuran 40% sepia untuk vintage
const SEPIA: [[number, number, number], [number, number, number], [number, number, number]] = [
  [0.393, 0.769, 0.189],
  [0.349, 0.686, 0.168],
  [0.272, 0.534, 0.131]
]
const VINTAGE: typeof SEPIA = [
  [0.757, 0.308, 0.076],
  [0.140, 0.874, 0.067],
  [0.109, 0.214, 0.652]
]

const flat = (m: typeof SEPIA) => m.flat().map((v) => v.toFixed(3)).join(':')

/** Blur "smooth" sebanding ukuran gambar agar halus yang sama di slot kecil maupun GIF besar */
const smoothSigma = (width: number) => Math.max(0.6, Math.min(2.5, width / 450))

/** Terapkan filter ke pipeline sharp (setelah resize). `width` = lebar hasil, untuk kekuatan blur. */
export function applySharpFilter(image: sharp.Sharp, filter: PhotoFilter | undefined, width: number): sharp.Sharp {
  switch (filter) {
    case 'bw':
      return image.grayscale()
    case 'sepia':
      return image.recomb(SEPIA)
    case 'vintage':
      // pudar: kontras turun, hitam sedikit terangkat, warna hangat & kurang jenuh
      return image.recomb(VINTAGE).linear(0.9, 14).modulate({ saturation: 0.85, brightness: 1.03 })
    case 'smooth':
      return image.blur(smoothSigma(width)).modulate({ brightness: 1.04 })
    default:
      return image
  }
}

/** Padanan filter ffmpeg untuk klip Live (dipasang setelah scale/crop klip ke slot). */
export function ffmpegFilter(filter: PhotoFilter | undefined, width: number): string | null {
  switch (filter) {
    case 'bw':
      return 'hue=s=0'
    case 'sepia':
      return `colorchannelmixer=${sepiaMixer(SEPIA)}`
    case 'vintage':
      return `colorchannelmixer=${sepiaMixer(VINTAGE)},eq=contrast=0.9:brightness=0.03:saturation=0.85`
    case 'smooth':
      return `gblur=sigma=${smoothSigma(width).toFixed(2)},eq=brightness=0.02`
    default:
      return null
  }
}

// colorchannelmixer: rr:rg:rb:ra:gr:gg:gb:ga:br:bg:bb:ba
function sepiaMixer(m: typeof SEPIA): string {
  return flat(m).split(':').reduce<string[]>((acc, v, i) => {
    acc.push(v)
    if (i % 3 === 2) acc.push('0')
    return acc
  }, []).join(':')
}
