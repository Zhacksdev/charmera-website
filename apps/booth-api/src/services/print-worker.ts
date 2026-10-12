import { db } from '../db/index.js'
import { logger } from './logger.js'
import { getConfig } from './config.js'
import { getPrinterSettings, printImage, createTestPrintImage } from './printer.js'

const MAX_ATTEMPTS = 3

export interface PrintJob {
  id: string
  sessionId: string
  status: 'queued' | 'sent' | 'printing' | 'done' | 'failed'
  attempts: number
  error?: string
  printerName: string
  copies: number
  outputPath?: string
}

let isProcessing = false

export async function processPrintJobs() {
  // cetak bisa lebih lama dari interval worker — jangan jalankan dua batch bersamaan
  if (isProcessing) return
  isProcessing = true

  try {
    const job = db.prepare(`
      SELECT * FROM print_jobs
      WHERE status = 'queued' AND attempts < ?
      ORDER BY created_at ASC
      LIMIT 1
    `).get(MAX_ATTEMPTS) as any

    if (!job) return

    const output = db.prepare(`
      SELECT path FROM outputs WHERE session_id = ? AND type = 'strip'
    `).get(job.session_id) as { path: string } | undefined

    if (!output) {
      // strip belum selesai dirender: tunggu, jangan hitung sebagai percobaan gagal
      const render = db.prepare(`
        SELECT status, error_message FROM render_jobs WHERE session_id = ? AND type = 'strip'
      `).get(job.session_id) as { status: string; error_message?: string } | undefined

      if (render && render.status !== 'failed') return

      db.prepare(`
        UPDATE print_jobs SET status = 'failed', error_message = ? WHERE id = ?
      `).run(render ? `Render strip gagal: ${render.error_message || 'unknown'}` : 'Strip tidak ditemukan', job.id)
      return
    }

    const settings = getPrinterSettings()

    db.prepare(`
      UPDATE print_jobs SET status = 'printing', printer_name = ? WHERE id = ?
    `).run(settings.printer_name || 'default', job.id)

    try {
      await printImage(output.path, job.copies || settings.copies, settings)

      db.prepare(`
        UPDATE print_jobs SET status = 'done', finished_at = ?, error_message = NULL WHERE id = ?
      `).run(new Date().toISOString(), job.id)

      const config = getConfig()
      if (config?.media_capacity) {
        db.prepare(`
          UPDATE config_cache
          SET value = json_set(value, '$.media_remaining',
            COALESCE(json_extract(value, '$.media_remaining'), json_extract(value, '$.media_capacity')) - ?)
          WHERE key = 'settings'
        `).run(job.copies || 1)
      }

      logger.info({ job_id: job.id, session_id: job.session_id, printer: settings.printer_name || '(default)' }, 'Print job completed')
    } catch (err: any) {
      const attempts = job.attempts + 1
      logger.error({ err, job_id: job.id, attempts }, 'Print job failed')

      db.prepare(`
        UPDATE print_jobs SET status = ?, attempts = ?, error_message = ? WHERE id = ?
      `).run(attempts >= MAX_ATTEMPTS ? 'failed' : 'queued', attempts, err?.message || 'Print gagal', job.id)
    }
  } catch (err) {
    logger.error({ err }, 'Print worker error')
  } finally {
    isProcessing = false
  }
}

export function startPrintWorker() {
  // job yang terputus saat 'printing' (laptop mati/crash) tidak diulang otomatis
  // supaya tidak tercetak dua kali — operator bisa cetak ulang manual
  db.prepare(`
    UPDATE print_jobs SET status = 'failed', error_message = 'Terputus saat mencetak — cetak ulang manual bila perlu'
    WHERE status IN ('printing', 'sent')
  `).run()

  setInterval(processPrintJobs, 3000)
  logger.info('Print worker started')
}

export async function testPrint(): Promise<{ ok: boolean; error?: string }> {
  const settings = getPrinterSettings()
  try {
    const testImagePath = await createTestPrintImage()
    await printImage(testImagePath, 1, settings)
    logger.info({ printer: settings.printer_name || '(default)' }, 'Test print successful')
    return { ok: true }
  } catch (err: any) {
    logger.error({ err, printer: settings.printer_name || '(default)' }, 'Test print failed')
    return { ok: false, error: err?.message || 'Test print gagal' }
  }
}
