import { db } from '../db/index.js'
import { logger } from './logger.js'
import sharp from 'sharp'
import { createKeyedImage } from '@chamera/frame-engine'
import { join } from 'path'
import { mkdirSync, writeFileSync, existsSync } from 'fs'

// ponytail: seed default offline agar booth langsung bisa dipakai tanpa cloud;
// begitu DEVICE_API_URL diset, config puller akan menimpa cache ini.
export async function seedDefaults(): Promise<void> {
  const existing = db.prepare(`SELECT key FROM config_cache WHERE key = 'settings'`).get()
  if (existing) return

  const dataDir = join(process.cwd(), 'data')
  const framesDir = join(dataDir, 'frames')
  if (!existsSync(framesDir)) {
    mkdirSync(framesDir, { recursive: true })
  }

  const slots = [
    { n: 1, x: 90, y: 120, w: 1020, h: 380 },
    { n: 2, x: 90, y: 540, w: 1020, h: 380 }
  ]
  const textArea = { x: 90, y: 1180, w: 1020, h: 200 }

  // Frame contoh: latar transparan + border cherry + teks brand; slot hijau untuk keying
  const overlaySvg = Buffer.from(`<svg width='1200' height='1800' xmlns='http://www.w3.org/2000/svg'>
    <rect width='1200' height='1800' fill='none'/>
    <rect x='40' y='40' width='1120' height='1720' rx='40' fill='none' stroke='#D62839' stroke-width='24'/>
    <rect x='${slots[0].x}' y='${slots[0].y}' width='${slots[0].w}' height='${slots[0].h}' fill='#00FF00'/>
    <rect x='${slots[1].x}' y='${slots[1].y}' width='${slots[1].w}' height='${slots[1].h}' fill='#00FF00'/>
    <text x='600' y='${textArea.y + 90}' font-family='Georgia' font-size='72' font-style='italic' fill='#D62839' text-anchor='middle'>chamera</text>
    <text x='600' y='${textArea.y + 160}' font-family='Georgia' font-size='36' fill='#26211F' text-anchor='middle'>Wear your memories.</text>
  </svg>`)

  const keyedPath = join(framesDir, 'example_keyed.png')
  if (!existsSync(keyedPath)) {
    const overlay = await sharp(overlaySvg)
      .ensureAlpha()
      .png()
      .toBuffer()

    const keyed = await createKeyedImage(overlay)
    writeFileSync(keyedPath, keyed)
  }

  const settings = {
    booth_id: '00000000-0000-0000-0000-000000000001',
    config_version: 1,
    output_mode: 'photo_only',
    print_mode: 'digital_only',
    printer_name: 'default',
    copies: 1,
    media_capacity: 100,
    media_warn_at: 10,
    base_price: 25000,
    retention_days: 30,
    timers: {
      frame: 30, action: 120, preview: 45, qr: 15, closing: 5,
      reminder_sec: 15, max_retake: 3, countdown: 5
    },
    camera: { width: 1920, height: 1080, mirror_preview: true },
    live_config: { clip_sec: 5, codec: 'h265', preview_h264: true },
    gif_config: { frame_duration_ms: 800, max_width: 1080 },
    preflight: { min_disk_gb: 5, max_outbox_age_hours: 24, fallback_digital_on_printer_fail: true }
  }

  const frameId = '11111111-1111-1111-1111-111111111111'
  const frames = [{
    id: frameId,
    name: 'Chamera Classic',
    orientation: 'portrait',
    canvas_w: 1200,
    canvas_h: 1800,
    layout: { canvas: { w: 1200, h: 1800 }, slots, text_area: textArea },
    extra_price: 0,
    is_active: true,
    sort_order: 0,
    keyed_path: keyedPath
  }]

  db.prepare(`
    INSERT OR REPLACE INTO config_cache (key, value, version, fetched_at)
    VALUES ('settings', ?, 1, datetime('now'))
  `).run(JSON.stringify(settings))

  db.prepare(`
    INSERT OR REPLACE INTO config_cache (key, value, version, fetched_at)
    VALUES ('frames', ?, 0, datetime('now'))
  `).run(JSON.stringify(frames))

  logger.info('Default config + 1 contoh frame di-seed (boot pertama / offline mode)')
}
