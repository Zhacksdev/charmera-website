import { Router } from 'express'
import { db } from '../db/index.js'
import { logger } from '../services/logger.js'
import { finalizeSession } from '../services/session-flow.js'
import { finalizeSessionInputSchema } from '@chamera/shared'

const router = Router({ mergeParams: true })

router.post('/:sessionId/finalize', (req, res) => {
  try {
    const { sessionId } = req.params
    const input = finalizeSessionInputSchema.parse(req.body)
    
    const session = db.prepare('SELECT id FROM sessions WHERE id = ?').get(sessionId)
    if (!session) {
      return res.status(404).json({ error: 'Session not found' })
    }
    
    res.json(finalizeSession(sessionId, input.print))
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

    const totalJobs = db.prepare(`SELECT COUNT(*) AS n FROM render_jobs WHERE session_id = ?`).get(sessionId) as { n: number }

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
      total_jobs: totalJobs.n,
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
