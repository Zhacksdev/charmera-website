import { db } from '../db/index.js'
import { logger } from './logger.js'
import { join } from 'path'
import { mkdirSync, writeFileSync } from 'fs'

const DEVICE_API_URL = process.env.DEVICE_API_URL || ''
const DEVICE_KEY = process.env.DEVICE_KEY || ''

const CONFIG_PULL_INTERVAL = 60000

function framesDir(): string {
  const dir = join(process.env.DATA_DIR || join(process.cwd(), 'data'), 'frames')
  mkdirSync(dir, { recursive: true })
  return dir
}

export interface Config {
  config_version: number
  output_mode: 'photo_only' | 'full'
  print_mode: 'digital_only' | 'local' | 'custom_api'
  printer_name?: string
  copies: number
  media_capacity?: number
  media_warn_at: number
  base_price: number
  timers: {
    frame: number
    action: number
    preview: number
    qr: number
    closing: number
    countdown: number
    max_retake: number
    reminder_sec: number
  }
  camera: {
    width: number
    height: number
    mirror_preview: boolean
  }
  live_config?: {
    clip_sec: number
    codec: 'h265' | 'h264'
    preview_h264: boolean
  }
  gif_config?: {
    frame_duration_ms: number
    max_width: number
  }
  preflight: {
    min_disk_gb: number
    max_outbox_age_hours: number
    fallback_digital_on_printer_fail: boolean
  }
}

export interface Frame {
  id: string
  name: string
  orientation: 'portrait' | 'landscape'
  canvas_w: number
  canvas_h: number
  layout: any
  extra_price: number
  keyed_path?: string
}

export async function pullConfig(): Promise<{ config: Config | null; frames: Frame[] }> {
  try {
    const res = await fetch(`${DEVICE_API_URL}/api/device/config`, {
      headers: {
        'Authorization': `Bearer ${DEVICE_KEY}`
      }
    })
    
    if (!res.ok) {
      throw new Error(`Config pull failed: ${res.status}`)
    }
    
    const data: any = await res.json()
    
    const config: Config = {
      config_version: data.config_version || 0,
      output_mode: data.output_mode || 'photo_only',
      print_mode: data.print_mode || 'digital_only',
      printer_name: data.printer_name,
      copies: data.copies || 1,
      media_capacity: data.media_capacity,
      media_warn_at: data.media_warn_at || 10,
      base_price: data.base_price || 0,
      timers: data.timers || {
        frame: 30,
        action: 120,
        preview: 45,
        qr: 15,
        closing: 5,
        countdown: 5,
        max_retake: 3,
        reminder_sec: 15
      },
      camera: data.camera || {
        width: 1920,
        height: 1080,
        mirror_preview: true
      },
      live_config: data.live_config,
      gif_config: data.gif_config,
      preflight: data.preflight || {
        min_disk_gb: 5,
        max_outbox_age_hours: 24,
        fallback_digital_on_printer_fail: true
      }
    }
    
    db.prepare(`
      INSERT OR REPLACE INTO config_cache (key, value, version, fetched_at)
      VALUES ('settings', ?, ?, ?)
    `).run(JSON.stringify(config), config.config_version, new Date().toISOString())
    
    // unduh PNG frame keyed ke lokal — render butuh file, bukan URL
    const frames: Frame[] = []
    for (const f of (data.frames || [])) {
      let keyed_path: string | undefined

      if (f.keyed_url) {
        try {
          const imgRes = await fetch(f.keyed_url)
          if (imgRes.ok) {
            keyed_path = join(framesDir(), `${f.id}.png`)
            writeFileSync(keyed_path, Buffer.from(await imgRes.arrayBuffer()))
          } else {
            logger.warn({ frame: f.id, status: imgRes.status }, 'Frame download failed')
          }
        } catch (dlErr) {
          logger.warn({ frame: f.id, err: dlErr }, 'Frame download failed')
        }
      }

      frames.push({
        id: f.id,
        name: f.name,
        orientation: f.orientation,
        canvas_w: f.canvas_w,
        canvas_h: f.canvas_h,
        layout: f.layout,
        extra_price: f.extra_price || 0,
        keyed_path
      })
    }
    
    db.prepare(`
      INSERT OR REPLACE INTO config_cache (key, value, version, fetched_at)
      VALUES ('frames', ?, 0, ?)
    `).run(JSON.stringify(frames), new Date().toISOString())
    
    logger.info({ config_version: config.config_version, frame_count: frames.length }, 'Config pulled')
    
    return { config, frames }
    
  } catch (err) {
    logger.error({ err }, 'Failed to pull config')
    return { config: null, frames: [] }
  }
}

export function startConfigPuller() {
  if (!DEVICE_API_URL) {
    logger.info('Cloud config disabled (DEVICE_API_URL not set) — offline mode, pakai config lokal')
    return
  }

  pullConfig()

  setInterval(pullConfig, CONFIG_PULL_INTERVAL)

  logger.info({ device_api_url: DEVICE_API_URL }, 'Config puller started')
}
