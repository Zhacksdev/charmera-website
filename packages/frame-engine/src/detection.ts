import sharp from 'sharp'
import {
  GREEN_SCREEN_TOLERANCE,
  SLOT_MIN_SIZE,
  type Slot,
  type Layout
} from '@chamera/shared'

export interface DetectionResult {
  slots: Slot[]
  canvas: { w: number; h: number }
  orientation: 'portrait' | 'landscape'
}

export interface ConnectedComponent {
  label: number
  pixels: Set<string>
  minX: number
  minY: number
  maxX: number
  maxY: number
  pixelCount: number
}

function isGreenPixel(r: number, g: number, b: number, tolerance: number = GREEN_SCREEN_TOLERANCE): boolean {
  return r <= tolerance && g >= 255 - tolerance && b <= tolerance
}

async function getGreenMask(image: sharp.Sharp, tolerance: number = GREEN_SCREEN_TOLERANCE): Promise<Buffer> {
  const { data, info } = await image
    .clone()
    .raw()
    .toBuffer({ resolveWithObject: true })
  
  const { width, height, channels } = info
  const mask = Buffer.alloc(width * height)
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels
      const r = data[idx]
      const g = data[idx + 1]
      const b = data[idx + 2]
      mask[y * width + x] = isGreenPixel(r, g, b, tolerance) ? 1 : 0
    }
  }
  
  return mask
}

function findConnectedComponents(mask: Buffer, width: number, height: number): ConnectedComponent[] {
  const labels = new Uint32Array(width * height)
  const parent: number[] = []
  
  function find(x: number): number {
    if (parent[x] !== x) {
      parent[x] = find(parent[x])
    }
    return parent[x]
  }
  
  function union(a: number, b: number): void {
    const rootA = find(a)
    const rootB = find(b)
    if (rootA !== rootB) {
      parent[rootB] = rootA
    }
  }
  
  let nextLabel = 1
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      if (mask[idx] === 0) continue
      
      const neighbors: number[] = []
      
      if (x > 0 && mask[idx - 1] === 1) {
        neighbors.push(labels[idx - 1])
      }
      if (y > 0 && mask[idx - width] === 1) {
        neighbors.push(labels[idx - width])
      }
      
      if (neighbors.length === 0) {
        labels[idx] = nextLabel
        parent[nextLabel] = nextLabel
        nextLabel++
      } else {
        const minLabel = Math.min(...neighbors)
        labels[idx] = minLabel
        for (const label of neighbors) {
          if (label !== minLabel) {
            union(minLabel, label)
          }
        }
      }
    }
  }
  
  const components = new Map<number, ConnectedComponent>()
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      if (mask[idx] === 0) continue
      
      const root = find(labels[idx])
      
      if (!components.has(root)) {
        components.set(root, {
          label: root,
          pixels: new Set(),
          minX: x,
          minY: y,
          maxX: x,
          maxY: y,
          pixelCount: 0
        })
      }
      
      const comp = components.get(root)!
      comp.pixels.add(`${x},${y}`)
      comp.minX = Math.min(comp.minX, x)
      comp.minY = Math.min(comp.minY, y)
      comp.maxX = Math.max(comp.maxX, x)
      comp.maxY = Math.max(comp.maxY, y)
      comp.pixelCount++
    }
  }
  
  return Array.from(components.values())
}

export async function detectSlots(
  imageBuffer: Buffer,
  tolerance: number = GREEN_SCREEN_TOLERANCE,
  minSize: number = SLOT_MIN_SIZE
): Promise<DetectionResult> {
  const image = sharp(imageBuffer)
  const metadata = await image.metadata()
  
  const { width, height } = metadata
  if (!width || !height) {
    throw new Error('Unable to read image dimensions')
  }
  
  const orientation: 'portrait' | 'landscape' = height > width ? 'portrait' : 'landscape'
  
  const validPortrait = width === 1200 && height === 1800
  const validLandscape = width === 1800 && height === 1200
  
  if (!validPortrait && !validLandscape) {
    throw new Error(`Invalid canvas size: ${width}x${height}. Expected 1200x1800 (portrait) or 1800x1200 (landscape)`)
  }
  
  const mask = await getGreenMask(image, tolerance)
  const components = findConnectedComponents(mask, width, height)
  
  const validComponents = components.filter(comp => {
    const compWidth = comp.maxX - comp.minX + 1
    const compHeight = comp.maxY - comp.minY + 1
    return Math.min(compWidth, compHeight) >= minSize
  })
  
  validComponents.sort((a, b) => {
    if (Math.abs(a.minY - b.minY) < 50) {
      return a.minX - b.minX
    }
    return a.minY - b.minY
  })
  
  const slots: Slot[] = validComponents.map((comp, index) => ({
    n: index + 1,
    x: comp.minX,
    y: comp.minY,
    w: comp.maxX - comp.minX + 1,
    h: comp.maxY - comp.minY + 1
  }))
  
  return {
    slots,
    canvas: { w: width, h: height },
    orientation: orientation as 'portrait' | 'landscape'
  }
}

export async function createKeyedImage(
  sourceBuffer: Buffer,
  tolerance: number = GREEN_SCREEN_TOLERANCE,
  despill: boolean = true
): Promise<Buffer> {
  const image = sharp(sourceBuffer)
  const { data, info } = await image
    .clone()
    .raw()
    .toBuffer({ resolveWithObject: true })
  
  const { width, height, channels } = info
  const output = Buffer.alloc(width * height * 4)
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels
      const outIdx = (y * width + x) * 4
      
      const r = data[idx]
      const g = data[idx + 1]
      const b = data[idx + 2]
      
      if (isGreenPixel(r, g, b, tolerance)) {
        output[outIdx] = 0
        output[outIdx + 1] = 0
        output[outIdx + 2] = 0
        output[outIdx + 3] = 0
      } else {
        if (despill && g > 200 && r < 150 && b < 150) {
          const edgeStrength = (g - Math.max(r, b)) / 255
          const suppression = edgeStrength * 0.5
          output[outIdx] = Math.min(255, r + (r * suppression))
          output[outIdx + 1] = Math.max(0, g - (g * suppression * 0.3))
          output[outIdx + 2] = Math.min(255, b + (b * suppression))
        } else {
          output[outIdx] = r
          output[outIdx + 1] = g
          output[outIdx + 2] = b
        }
        output[outIdx + 3] = 255
      }
    }
  }
  
  return sharp(output, {
    raw: {
      width,
      height,
      channels: 4
    }
  })
  .png()
  .toBuffer()
}

export function createLayout(
  slots: Slot[],
  canvasW: number,
  canvasH: number,
  textArea?: { x: number; y: number; w: number; h: number }
): Layout {
  const layout: Layout = {
    canvas: { w: canvasW, h: canvasH },
    slots
  }
  
  if (textArea) {
    layout.text_area = textArea
  }
  
  return layout
}
