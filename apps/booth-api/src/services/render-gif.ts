import { runFfmpeg } from './ffmpeg.js'
import { join } from 'path'
import { writeFile, mkdir, unlink } from 'fs/promises'
import { existsSync } from 'fs'
import sharp from 'sharp'

const OUTPUTS_DIR = process.env.DATA_DIR
  ? join(process.env.DATA_DIR, 'outputs')
  : join(process.cwd(), 'data', 'outputs')


export interface RenderGifOptions {
  sessionId: string
  photos: Array<{ slot_index: number; path: string }>
  frameDurationMs?: number
  /** Sisi terpanjang maksimal (px) */
  maxWidth?: number
}

export async function ensureOutputsDir() {
  if (!existsSync(OUTPUTS_DIR)) {
    await mkdir(OUTPUTS_DIR, { recursive: true })
  }
}

/**
 * GIF = flipbook foto mentah sesi (tanpa frame), tiap foto tampil ±frame_duration lalu loop.
 * Semua foto disamakan ukurannya dengan foto pertama (crop cover) agar GIF tidak bergeser.
 */
export async function renderGif(options: RenderGifOptions): Promise<string> {
  const {
    sessionId,
    photos,
    frameDurationMs = 800,
    maxWidth = 1080
  } = options

  await ensureOutputsDir()

  const sortedPhotos = [...photos].sort((a, b) => a.slot_index - b.slot_index)
  if (sortedPhotos.length === 0) throw new Error('No photos for GIF')

  // .rotate() mengikuti orientasi EXIF, jadi ukuran diambil setelah rotasi
  const { info: first } = await sharp(sortedPhotos[0].path).rotate().toBuffer({ resolveWithObject: true })
  const scale = Math.min(1, maxWidth / Math.max(first.width, first.height))
  const width = Math.round(first.width * scale)
  const height = Math.round(first.height * scale)

  const framePaths: string[] = []
  for (let i = 0; i < sortedPhotos.length; i++) {
    const frame = await sharp(sortedPhotos[i].path)
      .rotate()
      .resize(width, height, { fit: 'cover', position: 'centre' })
      .png()
      .toBuffer()
    const framePath = join(OUTPUTS_DIR, `${sessionId}_frame_${i}.png`)
    await writeFile(framePath, frame)
    framePaths.push(framePath)
  }

  const outputPath = join(OUTPUTS_DIR, `${sessionId}_anim.gif`)
  const palettePath = join(OUTPUTS_DIR, `${sessionId}_palette.png`)
  const framePattern = join(OUTPUTS_DIR, `${sessionId}_frame_%d.png`)

  try {
    await runFfmpeg([
        '-y',
        '-start_number', '0',
        '-i', framePattern,
        '-vf', `palettegen=stats_mode=diff`,
        palettePath
      ], 'Palette generation')

    const fps = 1000 / frameDurationMs

    await runFfmpeg([
        '-y',
        '-framerate', fps.toString(),
        '-start_number', '0',
        '-i', framePattern,
        '-i', palettePath,
        '-lavfi', `paletteuse=dither=bayer:bayer_scale=5`,
        '-loop', '0',
        outputPath
      ], 'GIF generation')
  } finally {
    for (const path of [...framePaths, palettePath]) {
      await unlink(path).catch(() => {})
    }
  }

  return outputPath
}
