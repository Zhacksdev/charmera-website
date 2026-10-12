import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { nanoid } from 'nanoid'
import { db } from '../db/index.js'
import { logger } from '../services/logger.js'
import { createSessionInputSchema } from '@chamera/shared'
import { getConfig } from '../services/config.js'
import { getRemainingTime, checkSessionExpiry, selectFrame, startPreview, finalizeSession, stageSeconds } from '../services/session-flow.js'

const router = Router()

router.post('/', (req, res) => {
  try {
    const input = createSessionInputSchema.parse(req.body)
    const config = getConfig()
    
    if (!config) {
      return res.status(500).json({ error: 'Config not loaded' })
    }
    
    const id = uuidv4()
    const publicCode = nanoid(12)
    const now = new Date().toISOString()
    const stageExpiresAt = new Date(Date.now() + stageSeconds('frame') * 1000)
    
    db.prepare(`
      INSERT INTO sessions (
        id, public_code, config_version, status, sync_status, price, 
        started_at, stage_expires_at, timer_snapshot
      ) VALUES (?, ?, ?, 'created', 'pending', ?, ?, ?, ?)
    `).run(
      id, 
      publicCode, 
      config.config_version, 
      config.base_price || 0, 
      now, 
      stageExpiresAt.toISOString(),
      JSON.stringify(config.timers || {})
    )
    
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id)
    
    logger.info({ session_id: id, public_code: publicCode, config_version: config.config_version }, 'Session created')
    
    res.status(201).json({
      id: session.id,
      public_code: session.public_code,
      config_version: session.config_version,
      status: session.status,
      price: session.price,
      started_at: session.started_at,
      stage_expires_at: session.stage_expires_at,
      timer: Math.floor((stageExpiresAt.getTime() - Date.now()) / 1000)
    })
  } catch (err) {
    logger.error({ err }, 'Failed to create session')
    res.status(400).json({ error: 'Failed to create session' })
  }
})

router.get('/:id', (req, res) => {
  try {
    const { id } = req.params
    
    checkSessionExpiry(id)
    
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id)
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' })
    }
    
    const remainingSec = getRemainingTime(id)
    
    res.json({
      ...session,
      timer_snapshot: session.timer_snapshot ? JSON.parse(session.timer_snapshot as string) : null,
      remaining_sec: remainingSec
    })
  } catch (err) {
    logger.error({ err }, 'Failed to get session')
    res.status(500).json({ error: 'Failed to get session' })
  }
})

router.patch('/:id/frame', (req, res) => {
  try {
    const { id } = req.params
    const { frame_id, selected_by } = req.body

    if (!frame_id || !selected_by) {
      return res.status(400).json({ error: 'frame_id and selected_by are required' })
    }

    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id)
    if (!session) {
      return res.status(404).json({ error: 'Session not found' })
    }

    if (!['created', 'frame_selected'].includes(session.status)) {
      return res.status(409).json({ error: `Frame tidak bisa diganti pada status ${session.status}` })
    }

    const stageExpiresAt = selectFrame(id, frame_id, selected_by)
    const actionTimer = stageSeconds('action')

    logger.info({ session_id: id, frame_id, selected_by }, 'Frame selected')

    res.json({
      status: 'frame_selected',
      stage_expires_at: stageExpiresAt,
      timer: actionTimer
    })
  } catch (err) {
    logger.error({ err }, 'Failed to select frame')
    res.status(500).json({ error: 'Failed to select frame' })
  }
})

router.post('/:id/reset', (req, res) => {
  try {
    const { id } = req.params
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id)
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' })
    }
    
    const now = new Date().toISOString()
    
    db.prepare(`
      UPDATE sessions 
      SET status = 'abandoned', completed_at = ?, stage_expires_at = NULL
      WHERE id = ?
    `).run(now, id)
    
    db.prepare(`DELETE FROM photos WHERE session_id = ?`).run(id)
    db.prepare(`DELETE FROM clips WHERE session_id = ?`).run(id)
    db.prepare(`DELETE FROM outputs WHERE session_id = ?`).run(id)
    db.prepare(`DELETE FROM render_jobs WHERE session_id = ?`).run(id)
    db.prepare(`DELETE FROM print_jobs WHERE session_id = ?`).run(id)
    
    logger.info({ session_id: id }, 'Session reset and cleaned')
    
    res.json({ status: 'abandoned' })
  } catch (err) {
    logger.error({ err }, 'Failed to reset session')
    res.status(500).json({ error: 'Failed to reset session' })
  }
})

// Maju ke tahap berikutnya atas permintaan kiosk. `from` mencegah lompatan ganda
// bila server sudah memajukan sesi lebih dulu (mis. karena timeout).
router.post('/:id/advance', (req, res) => {
  try {
    const { id } = req.params
    const from = typeof req.body?.from === 'string' ? req.body.from : null
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id)
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' })
    }
    
    if (!from || from === session.status) {
      if (session.status === 'frame_selected' || session.status === 'capturing') {
        startPreview(id)
      } else if (session.status === 'previewing') {
        finalizeSession(id, req.body?.print === true)
      }
    }
    
    const updated = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id)
    
    res.json({
      status: updated.status,
      stage_expires_at: updated.stage_expires_at,
      remaining_sec: getRemainingTime(id)
    })
  } catch (err) {
    logger.error({ err }, 'Failed to advance session')
    res.status(500).json({ error: 'Failed to advance session' })
  }
})

export { router as sessionsRouter }
