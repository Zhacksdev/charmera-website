import { z } from 'zod'
import { layoutSchema, type Layout, type Slot } from './schemas.js'
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  CANVAS_LANDSCAPE_WIDTH,
  CANVAS_LANDSCAPE_HEIGHT,
  SLOT_MIN_SIZE
} from './constants-values.js'

export function validateFrameDimensions(
  width: number,
  height: number
): { valid: boolean; orientation: 'portrait' | 'landscape' | null; error?: string } {
  const isPortrait = (width === CANVAS_WIDTH && height === CANVAS_HEIGHT)
  const isLandscape = (width === CANVAS_LANDSCAPE_WIDTH && height === CANVAS_LANDSCAPE_HEIGHT)
  
  if (!isPortrait && !isLandscape) {
    return {
      valid: false,
      orientation: null,
      error: `Invalid dimensions. Expected ${CANVAS_WIDTH}x${CANVAS_HEIGHT} (portrait) or ${CANVAS_LANDSCAPE_WIDTH}x${CANVAS_LANDSCAPE_HEIGHT} (landscape), got ${width}x${height}`
    }
  }
  
  return {
    valid: true,
    orientation: isPortrait ? 'portrait' : 'landscape'
  }
}

export function validateSlotSize(slot: Slot): { valid: boolean; error?: string } {
  const minSide = Math.min(slot.w, slot.h)
  if (minSide < SLOT_MIN_SIZE) {
    return {
      valid: false,
      error: `Slot ${slot.n} is too small. Minimum side is ${SLOT_MIN_SIZE}px, got ${minSide}px`
    }
  }
  return { valid: true }
}

export function sortSlotsByPosition(slots: Slot[]): Slot[] {
  return [...slots].sort((a, b) => {
    if (Math.abs(a.y - b.y) > 50) {
      return a.y - b.y
    }
    return a.x - b.x
  })
}

export function renumberSlots(slots: Slot[]): Slot[] {
  const sorted = sortSlotsByPosition(slots)
  return sorted.map((slot, index) => ({
    ...slot,
    n: index + 1
  }))
}

export function validateLayout(layout: unknown): { success: true; data: Layout } | { success: false; error: string } {
  const result = layoutSchema.safeParse(layout)
  if (!result.success) {
    return {
      success: false,
      error: result.error.message
    }
  }
  
  for (const slot of result.data.slots) {
    const validation = validateSlotSize(slot)
    if (!validation.valid) {
      return {
        success: false,
        error: validation.error!
      }
    }
  }
  
  return {
    success: true,
    data: result.data
  }
}

export function isGreenScreenPixel(
  r: number,
  g: number,
  b: number,
  tolerance: number = 32
): boolean {
  return (
    r < tolerance &&
    g > 255 - tolerance &&
    b < tolerance
  )
}
