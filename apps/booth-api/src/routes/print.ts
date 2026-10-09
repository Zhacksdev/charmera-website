import { Router } from 'express'
import { db } from '../db/index.js'
import { logger } from '../services/logger.js'

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
    
    const { v4: uuidv4 } = require('uuid')
    const jobId = uuidv4()
    
    db.prepare(`
      INSERT INTO print_jobs (id, session_id, status, printer_name, copies, created_at)
      VALUES (?, ?, 'queued', 'default', ?, ?)
    `).run(jobId, sessionId, copies || 1, new Date().toISOString())
    
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
