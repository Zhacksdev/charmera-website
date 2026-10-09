import { spawn } from 'child_process'
import { join } from 'path'
import { readFile, writeFile, mkdir, unlink } from 'fs/promises'
import { existsSync } from 'fs'
import sharp from 'sharp'

const OUTPUTS_DIR = process.env.DATA_DIR 
  ? join(process.env.DATA_DIR, 'outputs') 
  : join(process.cwd(), 'data', 'outputs')

const FFMPEG_PATH = process.env.FFMPEG_PATH || 'ffmpeg'

export interface RenderLiveOptions {
  sessionId: string
  clips: Array<{ slot_index: number; path: string; duration_ms: number }>
  framePath: string
  layout: {
    canvas: { w: number; h: number }
    slots: Array<{ n: number; x: number; y: number; w: number; h: number }>
  }
  codec?: 'h265' | 'h264'
  previewH264?: boolean
  maxWidth?: number
}

export async function renderLivePhoto(options: RenderLiveOptions): Promise<{ h265: string; h264?: string }> {
  const { 
    sessionId, 
    clips, 
    framePath, 
    layout, 
    codec = 'h265',
    previewH264 = true,
    maxWidth = 1080
  } = options
  
  await ensureOutputsDir()
  
  const { canvas, slots } = layout
  const sortedClips = [...clips].sort((a, b) => a.slot_index - b.slot_index)
  
  const scale = Math.min(1, maxWidth / Math.max(canvas.w, canvas.h))
  const scaledW = Math.round(canvas.w * scale)
  const scaledH = Math.round(canvas.h * scale)
  
  const normalizedClips: string[] = []
  
  for (let i = 0; i < sortedClips.length; i++) {
    const clip = sortedClips[i]
    const outputPath = join(OUTPUTS_DIR, `${sessionId}_clip_${i}_normalized.mp4`)
    
    await new Promise<void>((resolve, reject) => {
      const ffmpeg = spawn(FFMPEG_PATH, [
        '-y',
        '-i', clip.path,
        '-r', '30',
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '23',
        '-pix_fmt', 'yuv420p',
        outputPath
      ])
      
      ffmpeg.on('close', (code) => {
        if (code === 0) resolve()
        else reject(new Error(`Clip normalization failed with code ${code}`))
      })
    })
    
    normalizedClips.push(outputPath)
  }
  
  const frameBuffer = await readFile(framePath)
  const frameOverlayPath = join(OUTPUTS_DIR, `${sessionId}_frame_overlay.png`)
  
  await sharp(frameBuffer)
    .resize(scaledW, scaledH)
    .png()
    .toFile(frameOverlayPath)
  
  const filterComplex: string[] = []
  const inputs: string[] = []
  
  for (let i = 0; i < normalizedClips.length; i++) {
    inputs.push('-i', normalizedClips[i])
    
    const slot = slots.find(s => s.n === sortedClips[i].slot_index + 1)
    if (!slot) continue
    
    const scaledSlot = {
      x: Math.round(slot.x * scale),
      y: Math.round(slot.y * scale),
      w: Math.round(slot.w * scale),
      h: Math.round(slot.h * scale)
    }
    
    filterComplex.push(
      `[${i}:v]scale=${scaledSlot.w}:${scaledSlot.h}:force_original_aspect_ratio=decrease,pad=${scaledSlot.w}:${scaledSlot.h}:(ow-iw)/2:(oh-ih)/2,setsar=1[clip${i}]`
    )
  }
  
  inputs.push('-i', frameOverlayPath)
  const frameInputIdx = normalizedClips.length
  
  const baseLayer = 'null'
  let lastLayer = baseLayer
  
  for (let i = 0; i < normalizedClips.length; i++) {
    const slot = slots.find(s => s.n === sortedClips[i].slot_index + 1)
    if (!slot) continue
    
    const scaledSlot = {
      x: Math.round(slot.x * scale),
      y: Math.round(slot.y * scale)
    }
    
    const outputLabel = `layer${i}`
    filterComplex.push(
      `[${lastLayer === 'null' ? '0:v' : lastLayer}][clip${i}]overlay=${scaledSlot.x}:${scaledSlot.y}${lastLayer === 'null' ? ':enable=\'between(t,0,5)\'' : ''}[${outputLabel}]`
    )
    lastLayer = outputLabel
  }
  
  filterComplex.push(
    `[${lastLayer}][${frameInputIdx}:v]overlay=0:0[output]`
  )
  
  const h265Path = join(OUTPUTS_DIR, `${sessionId}_live_h265.mp4`)
  
  await new Promise<void>((resolve, reject) => {
    const ffmpeg = spawn(FFMPEG_PATH, [
      '-y',
      ...inputs,
      '-filter_complex', filterComplex.join(';'),
      '-map', '[output]',
      '-c:v', 'libx265',
      '-preset', 'fast',
      '-crf', '28',
      '-pix_fmt', 'yuv420p',
      '-tag:v', 'hvc1',
      '-movflags', '+faststart',
      h265Path
    ])
    
    ffmpeg.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`H.265 encoding failed with code ${code}`))
    })
  })
  
  let h264Path: string | undefined
  
  if (previewH264 || codec === 'h264') {
    h264Path = join(OUTPUTS_DIR, `${sessionId}_live_h264.mp4`)
    
    await new Promise<void>((resolve, reject) => {
      const ffmpeg = spawn(FFMPEG_PATH, [
        '-y',
        '-i', h265Path,
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '23',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        '-vf', 'scale=-2:720',
        h264Path!
      ])
      
      ffmpeg.on('close', (code) => {
        if (code === 0) resolve()
        else reject(new Error(`H.264 encoding failed with code ${code}`))
      })
    })
  }
  
  for (const path of normalizedClips) {
    try {
      await unlink(path)
    } catch {}
  }
  
  try {
    await unlink(frameOverlayPath)
  } catch {}
  
  return {
    h265: h265Path,
    h264: h264Path
  }
}

export async function ensureOutputsDir() {
  if (!existsSync(OUTPUTS_DIR)) {
    await mkdir(OUTPUTS_DIR, { recursive: true })
  }
}
