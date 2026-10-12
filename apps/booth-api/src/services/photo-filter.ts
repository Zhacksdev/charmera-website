import sharp from 'sharp'

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

/** Radius glow "smooth" sebanding ukuran gambar agar efeknya sama di slot kecil maupun GIF besar */
const glowSigma = (width: number) => Math.max(2, Math.min(12, width / 90))
// kekuatan glow (screen blend) — kulit tampak cerah & berkilau, detail tetap tajam
const GLOW_OPACITY = 0.35

/**
 * Terapkan filter ke gambar yang sudah di-resize. `width` = lebar gambar, untuk radius glow.
 * Smooth = "shiny": lebih terang & hidup + glow lembut (salinan buram di-screen di atasnya), bukan blur.
 */
export async function applySharpFilter(input: Buffer, filter: PhotoFilter | undefined, width: number): Promise<sharp.Sharp> {
  const image = sharp(input)
  switch (filter) {
    case 'bw':
      return image.grayscale()
    case 'sepia':
      return image.recomb(SEPIA)
    case 'vintage':
      // pudar: kontras turun, hitam sedikit terangkat, warna hangat & kurang jenuh
      return image.recomb(VINTAGE).linear(0.9, 14).modulate({ saturation: 0.85, brightness: 1.03 })
    case 'smooth': {
      const glow = await sharp(input)
        .blur(glowSigma(width))
        .modulate({ brightness: 1.15 })
        .ensureAlpha(GLOW_OPACITY)
        .png()
        .toBuffer()
      return image
        .modulate({ brightness: 1.06, saturation: 1.15 })
        .composite([{ input: glow, blend: 'screen' }])
    }
    default:
      return image
  }
}

/**
 * Padanan filter ffmpeg untuk klip Live (dipasang setelah scale/crop klip ke slot).
 * `id` = akhiran unik label filtergraph, karena filter dipasang di beberapa slot dalam satu graph.
 */
export function ffmpegFilter(filter: PhotoFilter | undefined, width: number, id = ''): string | null {
  switch (filter) {
    case 'bw':
      return 'hue=s=0'
    case 'sepia':
      return `colorchannelmixer=${sepiaMixer(SEPIA)}`
    case 'vintage':
      return `colorchannelmixer=${sepiaMixer(VINTAGE)},eq=contrast=0.9:brightness=0.03:saturation=0.85`
    case 'smooth':
      // padanan "shiny" untuk video: glow screen + lebih terang & jenuh.
      // Blend dihitung di RGB (gbrp) — di YUV, screen pada kanal U/V membuat gambar jadi magenta
      return `format=gbrp,split[sm_a${id}][sm_b${id}];[sm_b${id}]gblur=sigma=${glowSigma(width).toFixed(1)}[sm_glow${id}];` +
        `[sm_a${id}][sm_glow${id}]blend=all_mode=screen:all_opacity=${GLOW_OPACITY},format=yuv420p,eq=brightness=0.04:saturation=1.15`
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
