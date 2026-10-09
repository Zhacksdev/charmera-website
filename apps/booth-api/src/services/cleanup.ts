import cron from 'node-cron'
import { db } from '../db/index.js'
import { logger } from './logger.js'

const CLEANUP_INTERVAL = '*/30 * * * * *'

export function startCleanupJob(): void {
  cron.schedule(CLEANUP_INTERVAL, () => {
    cleanupExpiredSessions()
  })
  
  logger.info('Session cleanup job started')
}

export function cleanupExpiredSessions(): void {
  const now = new Date().toISOString()
  
  const expiredSessions = db.prepare(`
    SELECT id, status FROM sessions 
    WHERE status NOT IN ('completed', 'abandoned', 'failed') 
    AND stage_expires_at IS NOT NULL 
    AND stage_expires_at < ?
  `).all(now) as Array<{ id: string; status: string }>
  
  for (const session of expiredSessions) {
    try {
      if (session.status === 'created') {
        const frames = db.prepare(`SELECT value FROM config_cache WHERE key = 'frames'`).get() as any
        if (frames) {
          const framesList = JSON.parse(frames.value)
          if (framesList.length > 0) {
            db.prepare(`
              UPDATE sessions 
              SET frame_id = ?, frame_selected_by = 'timeout', status = 'frame_selected'
              WHERE id = ?
            `).run(framesList[0].id, session.id)
            
            logger.info({ session_id: session.id }, 'Auto-selected frame on expiry')
            continue
          }
        }
      }
      
      if (session.status === 'capturing') {
        const photos = db.prepare(`SELECT COUNT(*) as count FROM photos WHERE session_id = ?`).get(session.id) as { count: number }
        
        if (photos.count === 0) {
          db.prepare(`
            UPDATE sessions SET status = 'abandoned', completed_at = ? WHERE id = ?
          `).run(now, session.id)
          
          logger.info({ session_id: session.id }, 'Session abandoned: no photos')
          continue
        }
      }
      
      db.prepare(`
        UPDATE sessions SET status = 'abandoned', completed_at = ? WHERE id = ?
      `).run(now, session.id)
      
      logger.info({ session_id: session.id, status: session.status }, 'Session marked as abandoned')
      
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
