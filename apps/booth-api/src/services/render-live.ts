import { runFfmpeg } from './ffmpeg.js'
import { join } from 'path'
import { mkdir, unlink } from 'fs/promises'
import { existsSync } from 'fs'
import sharp from 'sharp'
import { slotsForShot } from './slot-photo.js'
import { textOverlay, type TextArea } from './text-overlay.js'

const OUTPUTS_DIR = process.env.DATA_DIR
  ? join(process.env.DATA_DIR, 'outputs')
  : join(process.cwd(), 'data', 'outputs')

// sama dengan foto di strip: klip dilebihkan sedikit ke bawah frame agar tidak ada celah di tepi slot
const BLEED = 4

export interface RenderLiveOptions {
  sessionId: string
  clips: Array<{ slot_index: number; path: string; duration_ms: number }>
  framePath: string
  layout: {
    canvas: { w: number; h: number }
    slots: Array<{ n: number; x: number; y: number; w: number; h: number }>
    text_area?: TextArea
  }
  customText?: string
  /** Panjang video (detik); klip yang lebih pendek diulang */
  durationSec?: number
  codec?: 'h265' | 'h264'
  previewH264?: boolean
  maxWidth?: number
}

const even = (value: number) => Math.max(2, Math.round(value / 2) * 2)

/**
 * Live photo = tampilan strip yang sama, tetapi tiap slot memutar klip slot itu (loop) di bawah
 * PNG frame + custom text. Kanvas mengikuti ukuran frame (sisi panjang maks maxWidth).
 */
export async function renderLivePhoto(options: RenderLiveOptions): Promise<{ h265: string; h264?: string }> {
  const {
    sessionId,
    clips,
    framePath,
    layout,
    customText,
    durationSec = 5,
    codec = 'h265',
    previewH264 = true,
    maxWidth = 1080
  } = options

  await ensureOutputsDir()

  const { canvas, slots } = layout
  const sortedClips = [...clips].sort((a, b) => a.slot_index - b.slot_index)
  const duration = Math.min(15, Math.max(1, durationSec))

  // libx264/libx265 dengan yuv420p butuh dimensi genap
  const scale = Math.min(1, maxWidth / Math.max(canvas.w, canvas.h))
  const outW = even(canvas.w * scale)
  const outH = even(canvas.h * scale)
  const sx = outW / canvas.w
  const sy = outH / canvas.h

  const tempFiles: string[] = []

  try {
    // WebM dari MediaRecorder sering tanpa timestamp/durasi yang rapi — samakan dulu ke MP4 30fps
    const normalizedClips: string[] = []
    for (let i = 0; i < sortedClips.length; i++) {
      const outputPath = join(OUTPUTS_DIR, `${sessionId}_clip_${i}_normalized.mp4`)
      tempFiles.push(outputPath)
      await runFfmpeg([
          '-y',
          '-i', sortedClips[i].path,
          '-an',
          '-r', '30',
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', '20',
          '-pix_fmt', 'yuv420p',
          outputPath
        ], 'Clip normalization')
      normalizedClips.push(outputPath)
    }

    // layer atas: PNG frame + custom text, dirender di resolusi kanvas lalu diperkecil
    const overlays: sharp.OverlayOptions[] = [{ input: framePath, left: 0, top: 0 }]
    const text = textOverlay(customText, layout.text_area)
    if (text) overlays.push(text)
    const frameOverlayPath = join(OUTPUTS_DIR, `${sessionId}_frame_overlay.png`)
    tempFiles.push(frameOverlayPath)
    const overlayFull = await sharp({
      create: { width: canvas.w, height: canvas.h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
    }).composite(overlays).png().toBuffer()
    await sharp(overlayFull).resize(outW, outH, { fit: 'fill' }).png().toFile(frameOverlayPath)

    const inputs: string[] = [
      '-f', 'lavfi', '-i', `color=c=white:s=${outW}x${outH}:r=30:d=${duration}`
    ]
    for (const clip of normalizedClips) {
      inputs.push('-stream_loop', '-1', '-i', clip)
    }
    inputs.push('-loop', '1', '-i', frameOverlayPath)
    const frameInputIdx = normalizedClips.length + 1

    const filters: string[] = []
    let lastLayer = '0:v'
    let layerCount = 0

    for (let i = 0; i < sortedClips.length; i++) {
      const targets = slotsForShot(slots, sortedClips[i].slot_index).map((slot) => {
        const left = Math.max(0, Math.round((slot.x - BLEED) * sx))
        const top = Math.max(0, Math.round((slot.y - BLEED) * sy))
        const right = Math.min(outW, Math.round((slot.x + slot.w + BLEED) * sx))
        const bottom = Math.min(outH, Math.round((slot.y + slot.h + BLEED) * sy))
        return { left, top, w: right - left, h: bottom - top }
      }).filter((t) => t.w > 0 && t.h > 0)
      if (targets.length === 0) continue

      // satu klip bisa tampil di beberapa slot bernomor sama
      const labels = targets.map((_, k) => `clip${i}_${k}`)
      filters.push(`[${i + 1}:v]split=${targets.length}${labels.map((l) => `[${l}src]`).join('')}`)
      targets.forEach((t, k) => {
        filters.push(`[${labels[k]}src]scale=${t.w}:${t.h}:force_original_aspect_ratio=increase,crop=${t.w}:${t.h},setsar=1[${labels[k]}]`)
        const out = `layer${layerCount++}`
        filters.push(`[${lastLayer}][${labels[k]}]overlay=${t.left}:${t.top}:shortest=1[${out}]`)
        lastLayer = out
      })
    }

    filters.push(`[${lastLayer}][${frameInputIdx}:v]overlay=0:0:shortest=1,format=yuv420p[output]`)

    const h265Path = join(OUTPUTS_DIR, `${sessionId}_live_h265.mp4`)

    await runFfmpeg([
        '-y',
        ...inputs,
        '-filter_complex', filters.join(';'),
        '-map', '[output]',
        '-t', String(duration),
        '-an',
        '-c:v', 'libx265',
        '-preset', 'fast',
        '-crf', '28',
        '-tag:v', 'hvc1',
        '-movflags', '+faststart',
        h265Path
      ], 'H.265 encoding')

    let h264Path: string | undefined

    if (previewH264 || codec === 'h264') {
      h264Path = join(OUTPUTS_DIR, `${sessionId}_live_h264.mp4`)

      await runFfmpeg([
          '-y',
          '-i', h265Path,
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', '23',
          '-pix_fmt', 'yuv420p',
          '-movflags', '+faststart',
          '-vf', 'scale=-2:720',
          h264Path
        ], 'H.264 encoding')
    }

    return {
      h265: h265Path,
      h264: h264Path
    }
  } finally {
    for (const path of tempFiles) {
      await unlink(path).catch(() => {})
    }
  }
}

export async function ensureOutputsDir() {
  if (!existsSync(OUTPUTS_DIR)) {
    await mkdir(OUTPUTS_DIR, { recursive: true })
  }
}
