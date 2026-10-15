import { Router } from 'express'
import { db } from '../db/index.js'
import { logger } from '../services/logger.js'
import { getPrinterSettings, getPrinterHealth, renderPrintPreview } from '../services/printer.js'

const router = Router({ mergeParams: true })

router.get('/:sessionId/print', (req, res) => {
  try {
    const { sessionId } = req.params
    
    const printJob = db.prepare(`
      SELECT * FROM print_jobs WHERE session_id = ?
    `).get(sessionId)
    
    if (!printJob) {
      return res.status(404).json({ error: 'Print job not found' })
    }
    
    res.json({
      id: printJob.id,
      status: printJob.status,
      attempts: printJob.attempts,
      error_message: printJob.error_message,
      printer_name: printJob.printer_name,
      copies: printJob.copies,
      created_at: printJob.created_at,
      finished_at: printJob.finished_at
    })
  } catch (err) {
    logger.error({ err }, 'Failed to get print status')
    res.status(500).json({ error: 'Failed to get print status' })
  }
})

// Mode debug cetak: preview halaman cetak sesi (kertas + posisi foto) sebelum job masuk antrean.
// Strip biasanya sudah dirender sejak Preview dibuka; bila belum (mis. filter baru diganti), tunggu.
const PREVIEW_WAIT_MS = 45000

router.get('/:sessionId/print-preview', async (req, res) => {
  try {
    const { sessionId } = req.params
    const session = db.prepare('SELECT id FROM sessions WHERE id = ?').get(sessionId)
    if (!session) return res.status(404).json({ error: 'Session not found' })

    const deadline = Date.now() + PREVIEW_WAIT_MS
    let strip: { path: string } | undefined
    while (!(strip = db.prepare(`SELECT path FROM outputs WHERE session_id = ? AND type = 'strip' AND status = 'done'`).get(sessionId) as any)) {
      const job = db.prepare(`SELECT status, error_message FROM render_jobs WHERE session_id = ? AND type = 'strip'`).get(sessionId) as { status: string; error_message?: string } | undefined
      if (job?.status === 'failed') return res.status(500).json({ error: `Render strip gagal: ${job.error_message || 'unknown'}` })
      if (Date.now() > deadline) return res.status(504).json({ error: 'Strip belum selesai dirender' })
      await new Promise((resolve) => setTimeout(resolve, 500))
    }

    const settings = getPrinterSettings()
    const [{ png, layout }, health] = await Promise.all([renderPrintPreview(strip.path, settings), getPrinterHealth(settings)])
    res.json({
      image: `data:image/png;base64,${png.toString('base64')}`,
      layout,
      settings: {
        printer_name: settings.printer_name || '(default OS)',
        paper_size: settings.paper_size || '(default driver)',
        print_scale: settings.print_scale,
        scale_pct: settings.scale_pct,
        offset_x_mm: settings.offset_x_mm,
        offset_y_mm: settings.offset_y_mm,
        copies: settings.copies
      },
      health
    })
  } catch (err) {
    logger.error({ err }, 'Failed to build print preview')
    res.status(500).json({ error: 'Gagal membuat preview cetak' })
  }
})

router.post('/:sessionId/print', (req, res) => {
  try {
    const { sessionId } = req.params
    const { copies } = req.body
    
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId)
    if (!session) {
      return res.status(404).json({ error: 'Session not found' })
    }
    
    const job = db.prepare(`
      SELECT * FROM print_jobs WHERE session_id = ?
    `).get(sessionId)
    
    if (job) {
      return res.status(400).json({ error: 'Print job already exists' })
    }

    const printer = getPrinterSettings()
    if (printer.print_mode !== 'local') {
      return res.status(400).json({ error: 'Mode cetak tidak aktif' })
    }
    
    const { v4: uuidv4 } = require('uuid')
    const jobId = uuidv4()
    
    db.prepare(`
      INSERT INTO print_jobs (id, session_id, status, printer_name, copies, created_at)
      VALUES (?, ?, 'queued', ?, ?, ?)
    `).run(jobId, sessionId, printer.printer_name || 'default', copies || printer.copies, new Date().toISOString())
    
    logger.info({ job_id: jobId, session_id: sessionId }, 'Print job created')
    
    res.status(201).json({ 
      id: jobId,
      status: 'queued'
    })
  } catch (err) {
    logger.error({ err }, 'Failed to create print job')
    res.status(500).json({ error: 'Failed to create print job' })
  }
})

export { router as printRouter }
