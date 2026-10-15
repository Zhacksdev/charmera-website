import { Router } from 'express'
import { statfs } from 'fs/promises'
import { join } from 'path'
import { db } from '../db/index.js'
import { getConfig } from '../services/config.js'
import { getPrinterHealth, getPrinterSettings } from '../services/printer.js'
import { isFfmpegAvailable } from '../services/ffmpeg.js'

const router = Router()

// cek ffmpeg sekali per menit — dibutuhkan render GIF & Live Photo (output_mode full)
let ffmpegCache: { at: number; ok: boolean } | null = null
async function ffmpegOk(): Promise<boolean> {
  if (!ffmpegCache || Date.now() - ffmpegCache.at > 60000) {
    ffmpegCache = { at: Date.now(), ok: await isFfmpegAvailable() }
  }
  return ffmpegCache.ok
}

router.get('/', async (req, res) => {
  try {
    const config = getConfig()

    const preflight = db.prepare(`
      SELECT * FROM preflight_results ORDER BY checked_at DESC LIMIT 1
    `).get() as { result: string } | undefined

    let preflightResult = null
    if (preflight) {
      preflightResult = JSON.parse(preflight.result)
    }

    const outboxPending = db.prepare(`
      SELECT COUNT(*) as count FROM outbox WHERE status = 'pending'
    `).get() as { count: number }

    // ruang disk fisik dari server (bukan kuota browser)
    let diskFreeGb: number | null = null
    try {
      const dataDir = process.env.DATA_DIR || join(process.cwd(), 'data')
      const stats = await statfs(dataDir)
      diskFreeGb = (stats.bavail * stats.bsize) / (1024 * 1024 * 1024)
    } catch {
      // statfs gagal — laporkan null, kiosk menampilkan pesan netral
    }

    const printer = await getPrinterHealth()
    const ffmpeg = config?.output_mode === 'full' ? await ffmpegOk() : null

    res.json({
      config_loaded: !!config,
      config_version: config?.config_version || 0,
      output_mode: config?.output_mode || 'photo_only',
      // pengaturan efektif (cloud + override panel operator), sama dengan yang dipakai print worker
      print_mode: getPrinterSettings().print_mode,
      // admin: tampilkan preview cetak sebelum job masuk antrean
      print_debug: (config as any)?.print_debug === true,
      printer,
      ffmpeg_ok: ffmpeg,
      preflight: preflightResult,
      outbox_pending: outboxPending.count,
      disk_free_gb: diskFreeGb,
      timestamp: new Date().toISOString()
    })
  } catch (err) {
    console.error('Failed to get status:', err)
    res.status(500).json({ error: 'Failed to get status' })
  }
})

export { router as statusRouter }
