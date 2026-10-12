import { runFfmpeg } from './ffmpeg.js'
import { join } from 'path'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import sharp from 'sharp'
import { photoForSlot } from './slot-photo.js'

const OUTPUTS_DIR = process.env.DATA_DIR 
  ? join(process.env.DATA_DIR, 'outputs') 
  : join(process.cwd(), 'data', 'outputs')


export interface RenderGifOptions {
  sessionId: string
  photos: Array<{ slot_index: number; path: string }>
  framePath: string
  layout: {
    canvas: { w: number; h: number }
    slots: Array<{ n: number; x: number; y: number; w: number; h: number }>
  }
  frameDurationMs?: number
  maxWidth?: number
}

export async function ensureOutputsDir() {
  if (!existsSync(OUTPUTS_DIR)) {
    await mkdir(OUTPUTS_DIR, { recursive: true })
  }
}

export async function renderGif(options: RenderGifOptions): Promise<string> {
  const { 
    sessionId, 
    photos, 
    framePath, 
    layout, 
    frameDurationMs = 800,
    maxWidth = 1080 
  } = options
  
  await ensureOutputsDir()
  
  const { canvas, slots } = layout
  const sortedPhotos = [...photos].sort((a, b) => a.slot_index - b.slot_index)
  
  const scale = Math.min(1, maxWidth / canvas.w)
  const scaledW = Math.round(canvas.w * scale)
  const scaledH = Math.round(canvas.h * scale)
  
  const frames: Buffer[] = []
  
  // tiap frame GIF menampilkan satu foto (di semua slot frame) ±frame_duration — flipbook foto sesi
  for (const photo of sortedPhotos) {
    const frameBuffers: sharp.OverlayOptions[] = []
    
    for (const s of slots) {
      frameBuffers.push(await photoForSlot(photo.path, s, canvas))
    }
    
    const frameBuffer = await readFile(framePath)
    frameBuffers.push({
      input: frameBuffer,
      left: 0,
      top: 0
    })
    
    // sharp mengeksekusi resize SEBELUM composite dalam pipeline yang sama,
    // jadi composite dulu ke buffer, lalu resize terpisah
    const composed = await sharp({
      create: {
        width: canvas.w,
        height: canvas.h,
        channels: 3,
        background: '#FFFFFF'
      }
    })
    .composite(frameBuffers)
    .png()
    .toBuffer()

    const frame = await sharp(composed)
      .resize(scaledW, scaledH)
      .png()
      .toBuffer()

    frames.push(frame)
  }
  
  const framePaths: string[] = []
  for (let i = 0; i < frames.length; i++) {
    const framePath = join(OUTPUTS_DIR, `${sessionId}_frame_${i}.png`)
    await writeFile(framePath, frames[i])
    framePaths.push(framePath)
  }
  
  const outputPath = join(OUTPUTS_DIR, `${sessionId}_anim.gif`)
  
  const palettePath = join(OUTPUTS_DIR, `${sessionId}_palette.png`)
  
  await runFfmpeg([
      '-y',
      '-start_number', '0',
      '-i', join(OUTPUTS_DIR, `${sessionId}_frame_%d.png`),
      '-vf', `palettegen=stats_mode=diff`,
      palettePath
    ], 'Palette generation')

  const fps = 1000 / frameDurationMs

  await runFfmpeg([
      '-y',
      '-framerate', fps.toString(),
      '-start_number', '0',
      '-i', join(OUTPUTS_DIR, `${sessionId}_frame_%d.png`),
      '-i', palettePath,
      '-lavfi', `paletteuse=dither=bayer:bayer_scale=5`,
      outputPath
    ], 'GIF generation')
  
  for (const path of framePaths) {
    try {
      const { unlink } = require('fs/promises')
      await unlink(path)
    } catch {}
  }
  
  try {
    const { unlink } = require('fs/promises')
    await unlink(palettePath)
  } catch {}
  
  return outputPath
}

export async function renderTestGif(): Promise<Buffer> {
  const frames: Buffer[] = []
  
  for (let i = 0; i < 3; i++) {
    const frame = await sharp({
      create: {
        width: 400,
        height: 600,
        channels: 3,
        background: i === 0 ? '#D62839' : i === 1 ? '#F2B8C0' : '#FFF4E3'
      }
    })
    .png()
    .toBuffer()
    
    frames.push(frame)
  }
  
  return frames[0]
}
