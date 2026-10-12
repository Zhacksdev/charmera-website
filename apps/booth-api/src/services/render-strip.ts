import sharp from 'sharp'
import { join } from 'path'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import type { Layout, Slot } from '@chamera/shared'
import { photoForSlot, slotsForShot } from './slot-photo.js'
import { textOverlay, type TextStyle } from './text-overlay.js'
import type { PhotoFilter } from './photo-filter.js'

const OUTPUTS_DIR = process.env.DATA_DIR 
  ? join(process.env.DATA_DIR, 'outputs') 
  : join(process.cwd(), 'data', 'outputs')

export interface RenderStripOptions {
  sessionId: string
  photos: Array<{ slot_index: number; path: string }>
  frameKeyedPath: string
  layout: Layout
  customText?: string
  textStyle?: TextStyle
  filter?: PhotoFilter
}

export async function ensureOutputsDir() {
  if (!existsSync(OUTPUTS_DIR)) {
    await mkdir(OUTPUTS_DIR, { recursive: true })
  }
}

export async function renderStrip(options: RenderStripOptions): Promise<string> {
  const { sessionId, photos, frameKeyedPath, layout, customText, textStyle, filter } = options
  
  await ensureOutputsDir()
  
  const { canvas, slots, text_area } = layout

  const base = sharp({
    create: {
      width: canvas.w,
      height: canvas.h,
      channels: 3,
      background: '#FFFFFF'
    }
  })

  const composites: sharp.OverlayOptions[] = []

  const sortedPhotos = [...photos].sort((a, b) => a.slot_index - b.slot_index)

  for (const photo of sortedPhotos) {
    for (const slot of slotsForShot(slots, photo.slot_index)) {
      composites.push(await photoForSlot(photo.path, slot, canvas, filter))
    }
  }

  const frameKeyedBuffer = await readFile(frameKeyedPath)
  composites.push({
    input: frameKeyedBuffer,
    left: 0,
    top: 0
  })

  // satu kali composite: panggilan composite() berikutnya menggantikan, bukan menambah layer
  const text = textOverlay(customText, text_area, textStyle)
  if (text) composites.push(text)

  const outputPath = join(OUTPUTS_DIR, `${sessionId}_strip.jpg`)

  await base
    .composite(composites)
    .jpeg({
      quality: 95,
      mozjpeg: true
    })
    .toFile(outputPath)
  
  return outputPath
}

export async function renderTestStrip(): Promise<Buffer> {
  const testLayout: Layout = {
    canvas: { w: 1200, h: 1800 },
    slots: [
      { n: 1, x: 90, y: 120, w: 1020, h: 380 },
      { n: 2, x: 90, y: 540, w: 1020, h: 380 }
    ]
  }
  
  return sharp({
    create: {
      width: 1200,
      height: 1800,
      channels: 3,
      background: '#FFFFFF'
    }
  })
  .jpeg({ quality: 95 })
  .toBuffer()
}
