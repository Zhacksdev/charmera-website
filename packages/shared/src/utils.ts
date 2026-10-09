export function generatePublicCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let code = ''
  for (let i = 0; i < 12; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

export function formatPrice(price: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0
  }).format(price)
}

export function isPortrait(width: number, height: number): boolean {
  return height > width
}

export function getCanvasDimensions(orientation: 'portrait' | 'landscape'): { w: number; h: number } {
  return orientation === 'portrait'
    ? { w: 1200, h: 1800 }
    : { w: 1800, h: 1200 }
}

export function calculateSlotCover(
  slotW: number,
  slotH: number,
  photoW: number,
  photoH: number
): { x: number; y: number; w: number; h: number } {
  const slotRatio = slotW / slotH
  const photoRatio = photoW / photoH
  
  let renderW: number
  let renderH: number
  
  if (photoRatio > slotRatio) {
    renderH = slotH
    renderW = slotH * photoRatio
  } else {
    renderW = slotW
    renderH = slotW / photoRatio
  }
  
  const padding = 4
  renderW += padding * 2
  renderH += padding * 2
  
  return {
    x: (slotW - renderW) / 2,
    y: (slotH - renderH) / 2,
    w: renderW,
    h: renderH
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size))
  }
  return chunks
}
