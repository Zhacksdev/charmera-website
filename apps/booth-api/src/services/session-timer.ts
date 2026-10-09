import { db } from '../db/index.js'
import { logger } from './logger.js'
import { getConfig } from './config.js'

export interface SessionTimer {
  sessionId: string
  status: string
  stageExpiresAt: Date | null
  remainingSec: number
}

export function getStageExpiration(stage: string, config: any): Date {
  const now = Date.now()
  const timers = config?.timers || {}
  
  let durationSec = 30
  
  switch (stage) {
    case 'created':
    case 'frame_selected':
      durationSec = timers.frame || 30
      break
    case 'capturing':
      durationSec = timers.action || 120
      break
    case 'previewing':
      durationSec = timers.preview || 45
      break
    case 'processing':
      durationSec = 90
      break
    case 'result':
      durationSec = timers.qr || 15
      break
    case 'closing':
      durationSec = timers.closing || 5
      break
    default:
      durationSec = 30
  }
  
  return new Date(now + durationSec * 1000)
}

export function advanceSession(sessionId: string): void {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as any
  if (!session) return
  
  const config = getConfig()
  let newStatus = session.status
  let stageExpiresAt: Date | null = null
  
  switch (session.status) {
    case 'created':
      newStatus = 'frame_selected'
      stageExpiresAt = getStageExpiration('frame_selected', config)
      break
    case 'frame_selected':
      newStatus = 'capturing'
      stageExpiresAt = getStageExpiration('capturing', config)
      break
    case 'capturing':
      newStatus = 'previewing'
      stageExpiresAt = getStageExpiration('previewing', config)
      break
    case 'previewing':
      newStatus = 'processing'
      stageExpiresAt = getStageExpiration('processing', config)
      break
    case 'processing':
      newStatus = 'completed'
      stageExpiresAt = null
      break
    case 'result':
      newStatus = 'closing'
      stageExpiresAt = getStageExpiration('closing', config)
      break
    case 'closing':
      newStatus = 'completed'
      stageExpiresAt = null
      break
  }
  
  const expiresAtStr = stageExpiresAt ? stageExpiresAt.toISOString() : null
  
  db.prepare(`
    UPDATE sessions 
    SET status = ?, stage_expires_at = ?, completed_at = CASE WHEN ? = 'completed' THEN ? ELSE completed_at END
    WHERE id = ?
  `).run(newStatus, expiresAtStr, newStatus, new Date().toISOString(), sessionId)
  
  logger.info({ session_id: sessionId, old_status: session.status, new_status: newStatus }, 'Session advanced')
}

export function checkSessionExpiry(sessionId: string): boolean {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as any
  if (!session) return false
  
  if (!session.stage_expires_at) return false
  
  const now = Date.now()
  const expiresAt = new Date(session.stage_expires_at).getTime()
  
  if (now >= expiresAt) {
    logger.info({ session_id: sessionId, status: session.status }, 'Session stage expired')
    
    if (session.status === 'created') {
      const frames = db.prepare(`SELECT value FROM config_cache WHERE key = 'frames'`).get() as any
      if (frames) {
        const framesList = JSON.parse(frames.value)
        if (framesList.length > 0) {
          db.prepare(`
            UPDATE sessions 
            SET frame_id = ?, frame_selected_by = 'timeout', status = 'frame_selected', stage_expires_at = ?
            WHERE id = ?
          `).run(framesList[0].id, getStageExpiration('frame_selected', getConfig()).toISOString(), sessionId)
          
          logger.info({ session_id: sessionId, frame_id: framesList[0].id }, 'Auto-selected first frame')
        }
      }
    } else {
      advanceSession(sessionId)
    }
    
    return true
  }
  
  return false
}

export function getRemainingTime(sessionId: string): number {
  const session = db.prepare('SELECT stage_expires_at FROM sessions WHERE id = ?').get(sessionId) as any
  if (!session || !session.stage_expires_at) return 0
  
  const now = Date.now()
  const expiresAt = new Date(session.stage_expires_at).getTime()
  
  return Math.max(0, Math.floor((expiresAt - now) / 1000))
}
