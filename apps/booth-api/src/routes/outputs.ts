import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { db } from '../db/index.js'
import { logger } from '../services/logger.js'
import { getConfig } from '../services/config.js'
import { finalizeSessionInputSchema } from '@chamera/shared'

const router = Router({ mergeParams: true })

router.post('/:sessionId/finalize', (req, res) => {
  try {
    const { sessionId } = req.params
    const input = finalizeSessionInputSchema.parse(req.body)
    
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId)
    if (!session) {
      return res.status(404).json({ error: 'Session not found' })
    }
    
    const config = getConfig()
    const previewTimer = config?.timers?.preview || 45
    const stageExpiresAt = new Date(Date.now() + previewTimer * 1000).toISOString()
    
    db.prepare(`
      UPDATE sessions 
      SET status = 'processing', stage_expires_at = ?
      WHERE id = ?
    `).run(stageExpiresAt, sessionId)
    
    const renderJobs = ['strip']
    if (config?.output_mode === 'full') {
      renderJobs.push('gif', 'live_h264', 'live_h265')
    }
    
    for (const type of renderJobs) {
      const jobId = uuidv4()
      db.prepare(`
        INSERT INTO render_jobs (id, session_id, type, status, created_at)
        VALUES (?, ?, ?, 'pending', ?)
      `).run(jobId, sessionId, type, new Date().toISOString())
    }
    
    if (input.print && config?.print_mode !== 'digital_only') {
      const jobId = uuidv4()
      db.prepare(`
        INSERT INTO print_jobs (id, session_id, status, printer_name, copies, created_at)
        VALUES (?, ?, 'queued', ?, ?, ?)
      `).run(jobId, sessionId, config?.printer_name || 'default', config?.copies || 1, new Date().toISOString())
    }
    
    logger.info({ session_id: sessionId }, 'Session finalized, render jobs created')
    
    res.json({ 
      status: 'processing',
      render_jobs: renderJobs,
      print_requested: input.print
    })
  } catch (err) {
    logger.error({ err }, 'Failed to finalize session')
    res.status(500).json({ error: 'Failed to finalize session' })
  }
})

router.get('/:sessionId/result', (req, res) => {
  try {
    const { sessionId } = req.params
    
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId)
    if (!session) {
      return res.status(404).json({ error: 'Session not found' })
    }
    
    const outputs = db.prepare(`
      SELECT id, type, status, path, s3_key FROM outputs WHERE session_id = ?
    `).all(sessionId)

    const printJob = db.prepare(`
      SELECT status, error_message FROM print_jobs WHERE session_id = ?
    `).get(sessionId)

    const baseUrl = process.env.PUBLIC_BASE_URL || 'https://domain.com'
    const qrUrl = `${baseUrl}/download/${session.public_code}`

    const pendingJobs = db.prepare(`
      SELECT type, attempts, error_message FROM render_jobs
      WHERE session_id = ? AND status IN ('pending', 'rendering')
    `).all(sessionId) as any[]

    const failedJobs = db.prepare(`
      SELECT type, error_message FROM render_jobs
      WHERE session_id = ? AND status = 'failed'
    `).all(sessionId) as any[]

    const allDone = outputs.length > 0 && outputs.every((o: any) => o.status === 'done') && pendingJobs.length === 0
    
    res.json({
      session_id: sessionId,
      status: session.status,
      sync_status: session.sync_status,
      outputs: outputs,
      pending_jobs: pendingJobs.map((j: any) => ({ type: j.type, attempts: j.attempts })),
      failed_jobs: failedJobs.map((j: any) => ({ type: j.type, error: j.error_message })),
      print_status: printJob?.status || null,
      print_error: printJob?.error_message || null,
      qr_url: qrUrl,
      public_code: session.public_code,
      all_done: allDone
    })
  } catch (err) {
    logger.error({ err }, 'Failed to get result')
    res.status(500).json({ error: 'Failed to get result' })
  }
})

export { router as outputsRouter }
