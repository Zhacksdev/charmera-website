import { db } from '../db/index.js'
import { logger } from './logger.js'
import { unlink, stat, statfs } from 'fs/promises'
import { join } from 'path'

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data')
const LOCAL_RETENTION_DAYS = 7
const MIN_DISK_GB = 5

export async function cleanupLocalFiles() {
  try {
    const syncedSessions = db.prepare(`
      SELECT id, completed_at FROM sessions 
      WHERE sync_status = 'synced' AND completed_at IS NOT NULL
    `).all() as any[]
    
    const now = Date.now()
    const retentionMs = LOCAL_RETENTION_DAYS * 24 * 60 * 60 * 1000
    
    for (const session of syncedSessions) {
      const completedAt = new Date(session.completed_at).getTime()
      const age = now - completedAt
      
      if (age > retentionMs) {
        await deleteSessionFiles(session.id)
        logger.info({ session_id: session.id, age_days: Math.floor(age / (24 * 60 * 60 * 1000)) }, 'Session files deleted')
      }
    }
    
    await checkDiskSpace()
    
  } catch (err) {
    logger.error({ err }, 'Cleanup failed')
  }
}

async function deleteSessionFiles(sessionId: string) {
  try {
    const photos = db.prepare(`
      SELECT path FROM photos WHERE session_id = ?
    `).all(sessionId) as any[]
    
    const clips = db.prepare(`
      SELECT path FROM clips WHERE session_id = ?
    `).all(sessionId) as any[]
    
    const outputs = db.prepare(`
      SELECT path FROM outputs WHERE session_id = ?
    `).all(sessionId) as any[]
    
    const allFiles = [
      ...photos.map(p => p.path),
      ...clips.map(c => c.path),
      ...outputs.map(o => o.path)
    ]
    
    for (const filePath of allFiles) {
      try {
        await unlink(filePath)
      } catch (err) {
        logger.debug({ err, path: filePath }, 'File already deleted or not found')
      }
    }
    
    db.prepare(`DELETE FROM photos WHERE session_id = ?`).run(sessionId)
    db.prepare(`DELETE FROM clips WHERE session_id = ?`).run(sessionId)
    db.prepare(`DELETE FROM outputs WHERE session_id = ?`).run(sessionId)
    
  } catch (err) {
    logger.error({ err, session_id: sessionId }, 'Failed to delete session files')
  }
}

async function checkDiskSpace() {
  try {
    const stats = await statfs(DATA_DIR)
    const freeBytes = stats.bavail * stats.bsize
    const freeGB = freeBytes / (1024 * 1024 * 1024)
    
    if (freeGB < MIN_DISK_GB) {
      logger.warn({ free_gb: freeGB.toFixed(2) }, 'Low disk space')
      
      const oldestSynced = db.prepare(`
        SELECT id FROM sessions 
        WHERE sync_status = 'synced'
        ORDER BY completed_at ASC
        LIMIT 10
      `).all() as any[]
      
      for (const session of oldestSynced) {
        await deleteSessionFiles(session.id)
        logger.info({ session_id: session.id }, 'Deleted old session to free disk space')
      }
    }
  } catch (err) {
    logger.debug({ err }, 'Disk space check skipped')
  }
}

export function startCleanupWorker() {
  setInterval(cleanupLocalFiles, 60000)
  logger.info('Cleanup worker started')
}
