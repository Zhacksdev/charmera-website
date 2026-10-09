import sharp from 'sharp'
import { join } from 'path'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import type { Layout, Slot } from '@chamera/shared'

const OUTPUTS_DIR = process.env.DATA_DIR 
  ? join(process.env.DATA_DIR, 'outputs') 
  : join(process.cwd(), 'data', 'outputs')

export interface RenderStripOptions {
  sessionId: string
  photos: Array<{ slot_index: number; path: string }>
  frameKeyedPath: string
  layout: Layout
  customText?: string
  textStyle?: {
    font?: string
    fontSize?: number
    color?: string
  }
}

export async function ensureOutputsDir() {
  if (!existsSync(OUTPUTS_DIR)) {
    await mkdir(OUTPUTS_DIR, { recursive: true })
  }
}

export async function renderStrip(options: RenderStripOptions): Promise<string> {
  const { sessionId, photos, frameKeyedPath, layout, customText, textStyle } = options
  
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
    const slot = slots.find(s => s.n === photo.slot_index + 1)
    if (!slot) continue
    
    const photoBuffer = await readFile(photo.path)
    const photoImage = sharp(photoBuffer)
    const { width: photoW, height: photoH } = await photoImage.metadata()
    
    if (!photoW || !photoH) continue
    
    const padding = 4
    const slotRatio = slot.w / slot.h
    const photoRatio = photoW / photoH
    
    let renderW: number
    let renderH: number
    
    if (photoRatio > slotRatio) {
      renderH = slot.h + padding * 2
      renderW = renderH * photoRatio
    } else {
      renderW = slot.w + padding * 2
      renderH = renderW / photoRatio
    }
    
    const resizedPhoto = await photoImage
      .resize(Math.round(renderW), Math.round(renderH), {
        fit: 'cover',
        position: 'center'
      })
      .toBuffer()
    
    composites.push({
      input: resizedPhoto,
      left: Math.round(slot.x - padding + (slot.w - renderW) / 2),
      top: Math.round(slot.y - padding + (slot.h - renderH) / 2)
    })
  }
  
  const frameKeyedBuffer = await readFile(frameKeyedPath)
  composites.push({
    input: frameKeyedBuffer,
    left: 0,
    top: 0
  })
  
  let result = base.composite(composites)
  
  if (customText && text_area) {
    const { font = 'Nunito', fontSize = 32, color = '#26211F' } = textStyle || {}
    
    const textSvg = `
      <svg width="${text_area.w}" height="${text_area.h}">
        <text
          x="${text_area.w / 2}"
          y="${text_area.h / 2}"
          font-family="${font}"
          font-size="${fontSize}"
          fill="${color}"
          text-anchor="middle"
          dominant-baseline="middle"
        >${escapeXml(customText)}</text>
      </svg>
    `
    
    const textBuffer = Buffer.from(textSvg)
    result = result.composite([{
      input: textBuffer,
      left: text_area.x,
      top: text_area.y
    }])
  }
  
  const outputPath = join(OUTPUTS_DIR, `${sessionId}_strip.jpg`)
  
  await result
    .jpeg({
      quality: 95,
      mozjpeg: true
    })
    .toFile(outputPath)
  
  return outputPath
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
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
