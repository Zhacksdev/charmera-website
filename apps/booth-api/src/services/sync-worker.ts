import { v4 as uuidv4 } from 'uuid'
import { db } from '../db/index.js'
import { logger } from './logger.js'
import { join } from 'path'
import { readFile, stat } from 'fs/promises'

const DEVICE_API_URL = process.env.DEVICE_API_URL || ''
const DEVICE_KEY = process.env.DEVICE_KEY || ''

const MAX_RETRIES = 5
const BASE_BACKOFF_MS = 1000
const MAX_BACKOFF_MS = 60000

interface OutboxItem {
  id: string
  entity: string
  entity_id: string
  op: 'insert' | 'update' | 'delete'
  payload: any
  priority: number
  attempts: number
  next_try_at: string
  status: 'pending' | 'syncing' | 'synced' | 'failed'
  created_at: string
}

export function addToOutbox(
  entity: string,
  entityId: string,
  op: 'insert' | 'update' | 'delete',
  payload: any,
  priority: number = 5
): string {
  const id = uuidv4()
  const now = new Date().toISOString()
  
  db.prepare(`
    INSERT INTO outbox (id, entity, entity_id, op, payload, priority, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
  `).run(id, entity, entityId, op, JSON.stringify(payload), priority, now)
  
  logger.info({ outbox_id: id, entity, entity_id: entityId, op, priority }, 'Added to outbox')
  
  return id
}

export function getNextOutboxItem(): OutboxItem | null {
  const now = new Date().toISOString()
  
  const item = db.prepare(`
    SELECT * FROM outbox 
    WHERE status = 'pending' 
    AND (next_try_at IS NULL OR next_try_at <= ?)
    ORDER BY priority DESC, created_at ASC
    LIMIT 1
  `).get(now) as OutboxItem | undefined
  
  return item || null
}

export function calculateBackoff(attempts: number): number {
  const backoff = BASE_BACKOFF_MS * Math.pow(2, attempts)
  return Math.min(backoff, MAX_BACKOFF_MS)
}

const MAX_ITEMS_PER_TICK = 10
let isSyncing = false

export async function processOutbox() {
  // offline mode: item tetap pending sampai DEVICE_API_URL diset
  if (!DEVICE_API_URL || isSyncing) return
  isSyncing = true
  try {
    for (let i = 0; i < MAX_ITEMS_PER_TICK; i++) {
      const item = getNextOutboxItem()
      if (!item) break
      await processOutboxItem(item)
    }
  } finally {
    isSyncing = false
  }
}

function sessionIdOf(item: OutboxItem): string | null {
  if (item.entity === 'session') return item.entity_id
  if (item.entity === 'output') {
    try {
      const payload = typeof item.payload === 'string' ? JSON.parse(item.payload) : item.payload
      return payload?.session_id || null
    } catch {
      return null
    }
  }
  return null
}

/** sync_status sesi lokal: synced bila semua item sesi terkirim, failed bila ada yang menyerah. */
function refreshSessionSyncStatus(sessionId: string): void {
  const rows = db.prepare(`
    SELECT status FROM outbox
    WHERE (entity = 'session' AND entity_id = ?)
       OR (entity = 'output' AND json_extract(payload, '$.session_id') = ?)
  `).all(sessionId, sessionId) as Array<{ status: string }>

  if (rows.length === 0) return
  const status = rows.every((r) => r.status === 'synced')
    ? 'synced'
    : rows.some((r) => r.status === 'failed') ? 'failed' : 'syncing'

  db.prepare(`UPDATE sessions SET sync_status = ? WHERE id = ?`).run(status, sessionId)
}

/** Kembalikan item gagal ke antrean (tombol Retry Sync di panel operator / dashboard). */
export function retryFailedOutbox(): number {
  const result = db.prepare(`
    UPDATE outbox SET status = 'pending', attempts = 0, next_try_at = NULL WHERE status = 'failed'
  `).run()
  logger.info({ items: result.changes }, 'Failed outbox items requeued')
  return result.changes
}

async function processOutboxItem(item: OutboxItem) {
  const sessionId = sessionIdOf(item)
  item = { ...item, payload: typeof item.payload === 'string' ? JSON.parse(item.payload) : item.payload }

  try {
    db.prepare(`UPDATE outbox SET status = 'syncing' WHERE id = ?`).run(item.id)
    
    await syncItem(item)
    
    db.prepare(`
      UPDATE outbox SET status = 'synced', attempts = ? WHERE id = ?
    `).run(item.attempts + 1, item.id)
    
    logger.info({ outbox_id: item.id, entity: item.entity }, 'Item synced')
    
  } catch (err: any) {
    logger.error({ err, outbox_id: item.id }, 'Sync failed')
    
    const attempts = item.attempts + 1
    const nextTryAt = new Date(Date.now() + calculateBackoff(attempts)).toISOString()
    
    if (attempts >= MAX_RETRIES) {
      db.prepare(`
        UPDATE outbox SET status = 'failed', attempts = ?, next_try_at = ? WHERE id = ?
      `).run(attempts, nextTryAt, item.id)
    } else {
      db.prepare(`
        UPDATE outbox SET status = 'pending', attempts = ?, next_try_at = ? WHERE id = ?
      `).run(attempts, nextTryAt, item.id)
    }
  } finally {
    if (sessionId) refreshSessionSyncStatus(sessionId)
  }
}

async function syncItem(item: OutboxItem): Promise<void> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${DEVICE_KEY}`
  }
  const timeout = () => AbortSignal.timeout(30000)
  
  switch (item.entity) {
    case 'session':
      await fetch(`${DEVICE_API_URL}/api/device/sessions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(item.payload),
        signal: timeout()
      }).then(res => {
        if (!res.ok) throw new Error(`Sync failed: ${res.status}`)
        return res.json()
      })
      break
      
    case 'output': {
      const { session_id, type, path } = item.payload
      const contentType = type === 'strip' ? 'image/jpeg' : type === 'gif' ? 'image/gif' : 'video/mp4'
      const filename = type === 'strip' ? 'strip.jpg' : type === 'gif' ? 'anim.gif' : `${type}.mp4`
      const s3Key = `sessions/${session_id}/out/${filename}`

      await stat(path)

      const presignRes = await fetch(`${DEVICE_API_URL}/api/device/uploads/presign`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ key: s3Key, content_type: contentType, type }),
        signal: timeout()
      }).then(res => {
        if (!res.ok) throw new Error(`Presign failed: ${res.status}`)
        return res.json()
      }) as any

      const put = await fetch(presignRes.upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: await readFile(path),
        signal: AbortSignal.timeout(300000)
      })

      if (!put.ok) {
        throw new Error(`Upload ke storage gagal: ${put.status}`)
      }

      const complete = await fetch(`${DEVICE_API_URL}/api/device/sessions/${session_id}/complete`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ outputs: [{ type, key: s3Key }] }),
        signal: timeout()
      })

      if (!complete.ok) {
        throw new Error(`Complete gagal: ${complete.status}`)
      }
      break
    }
      
    default:
      throw new Error(`Unknown entity: ${item.entity}`)
  }
}

export function startSyncWorker() {
  // item yang terputus di tengah sync (crash/laptop mati) dikirim ulang — semua operasi idempotent
  db.prepare(`UPDATE outbox SET status = 'pending' WHERE status = 'syncing'`).run()
  setInterval(processOutbox, 5000)
  logger.info('Sync worker started')
}

export function queueSession(session: any, priority: number = 10) {
  addToOutbox('session', session.id, 'insert', {
    id: session.id,
    public_code: session.public_code,
    booth_id: session.booth_id || '00000000-0000-0000-0000-000000000001',
    frame_id: session.frame_id,
    config_version: session.config_version,
    status: session.status,
    sync_status: 'syncing',
    frame_selected_by: session.frame_selected_by,
    custom_text: session.custom_text,
    price: session.price,
    started_at: session.started_at,
    completed_at: session.completed_at
  }, priority)
}

export function queueOutput(sessionId: string, type: string, path: string) {
  addToOutbox('output', `${sessionId}-${type}`, 'insert', {
    session_id: sessionId,
    type,
    path
  }, type === 'strip' ? 9 : type === 'gif' ? 7 : 5)
}
