import cron from 'node-cron'
import { db } from '../db/index.js'
import { logger } from './logger.js'
import { expireSession } from './session-flow.js'

const CLEANUP_INTERVAL = '*/30 * * * * *'

export function startCleanupJob(): void {
  cron.schedule(CLEANUP_INTERVAL, () => {
    cleanupExpiredSessions()
  })
  
  logger.info('Session cleanup job started')
}

export function cleanupExpiredSessions(): void {
  const now = new Date().toISOString()
  
  // sesi yang ditinggal (tablet tertutup, tidak ada polling kiosk) tetap dimajukan
  // dengan aturan yang sama seperti saat kiosk aktif
  const expiredSessions = db.prepare(`
    SELECT * FROM sessions 
    WHERE status NOT IN ('completed', 'abandoned', 'failed') 
    AND stage_expires_at IS NOT NULL 
    AND stage_expires_at < ?
  `).all(now) as any[]
  
  for (const session of expiredSessions) {
    try {
      expireSession(session)
    } catch (err) {
      logger.error({ err, session_id: session.id }, 'Failed to cleanup session')
    }
  }
  
  const oldSessions = db.prepare(`
    SELECT id FROM sessions 
    WHERE status IN ('completed', 'abandoned', 'failed') 
    AND started_at < datetime('now', '-7 days')
  `).all() as Array<{ id: string }>
  
  if (oldSessions.length > 0) {
    logger.info({ count: oldSessions.length }, 'Found old sessions to archive')
  }
}

export function stopCleanupJob(): void {
  logger.info('Session cleanup job stopped')
}
