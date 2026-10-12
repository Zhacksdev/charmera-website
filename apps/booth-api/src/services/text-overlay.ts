import type sharp from 'sharp'

export interface TextArea {
  x: number
  y: number
  w: number
  h: number
}

export interface TextStyle {
  font?: string
  fontSize?: number
  color?: string
}

/** Custom text tamu di text_area frame — dipakai strip dan live photo agar tampilannya sama. */
export function textOverlay(
  text: string | null | undefined,
  textArea: TextArea | undefined,
  style: TextStyle = {}
): sharp.OverlayOptions | null {
  if (!text || !textArea) return null
  const { font = 'Nunito', fontSize = 32, color = '#26211F' } = style

  const svg = `
    <svg width="${textArea.w}" height="${textArea.h}">
      <text
        x="${textArea.w / 2}"
        y="${textArea.h / 2}"
        font-family="${font}"
        font-size="${fontSize}"
        fill="${color}"
        text-anchor="middle"
        dominant-baseline="middle"
      >${escapeXml(text)}</text>
    </svg>
  `

  return { input: Buffer.from(svg), left: textArea.x, top: textArea.y }
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
