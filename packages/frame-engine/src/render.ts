import sharp from 'sharp'
import { type Layout, type Slot } from '@chamera/shared'

export interface CompositeOptions {
  background?: string
  padding?: number
}

export async function compositeStrip(
  photos: Buffer[],
  frameKeyed: Buffer,
  layout: Layout,
  options: CompositeOptions = {}
): Promise<Buffer> {
  const { background = '#FFFFFF', padding = 4 } = options
  const { canvas, slots } = layout
  
  const base = sharp({
    create: {
      width: canvas.w,
      height: canvas.h,
      channels: 3,
      background
    }
  })
  
  const composites: sharp.OverlayOptions[] = []
  
  for (let i = 0; i < Math.min(photos.length, slots.length); i++) {
    const photo = photos[i]
    const slot = slots[i]
    
    const { width: photoW, height: photoH } = await sharp(photo).metadata()
    if (!photoW || !photoH) continue
    
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
    
    const resizedPhoto = await sharp(photo)
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
  
  composites.push({
    input: frameKeyed,
    left: 0,
    top: 0
  })
  
  return base
    .composite(composites)
    .jpeg({
      quality: 95,
      mozjpeg: true
    })
    .toBuffer()
}

export async function renderText(
  text: string,
  textArea: { x: number; y: number; w: number; h: number },
  style: {
    font?: string
    fontSize?: number
    color?: string
    align?: 'left' | 'center' | 'right'
  } = {}
): Promise<Buffer> {
  const {
    font = 'Nunito',
    fontSize = 32,
    color = '#26211F',
    align = 'center'
  } = style
  
  const svgText = `
    <svg width="${textArea.w}" height="${textArea.h}">
      <text
        x="${align === 'center' ? textArea.w / 2 : align === 'right' ? textArea.w : 0}"
        y="${textArea.h / 2}"
        font-family="${font}"
        font-size="${fontSize}"
        fill="${color}"
        text-anchor="${align}"
        dominant-baseline="middle"
      >${escapeXml(text)}</text>
    </svg>
  `
  
  return Buffer.from(svgText)
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export async function addTextToStrip(
  strip: Buffer,
  text: string,
  textArea: { x: number; y: number; w: number; h: number },
  style?: {
    font?: string
    fontSize?: number
    color?: string
    align?: 'left' | 'center' | 'right'
  }
): Promise<Buffer> {
  const textSvg = await renderText(text, textArea, style)
  
  return sharp(strip)
    .composite([
      {
        input: textSvg,
        left: textArea.x,
        top: textArea.y
      }
    ])
    .jpeg({ quality: 95, mozjpeg: true })
    .toBuffer()
}
