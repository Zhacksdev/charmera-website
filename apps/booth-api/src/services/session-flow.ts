import { v4 as uuidv4 } from 'uuid'
import { db } from '../db/index.js'
import { logger } from './logger.js'
import { getConfig } from './config.js'
import { getPrinterSettings } from './printer.js'
import { queueSession } from './sync-worker.js'

// Alur status sesi (server = sumber kebenaran, kiosk mengikuti):
//   created --pilih frame/timeout--> frame_selected (tahap Action)
//   frame_selected --Lanjut/timeout--> previewing --Print/timeout--> processing
//   processing --semua render selesai--> completed | failed
// Sesi tanpa foto saat Action habis menjadi abandoned.

const ACTIVE_RENDER = `status IN ('pending', 'rendering')`

function timers() {
  return (getConfig()?.timers || {}) as Record<string, number>
}

function expiresIn(sec: number): string {
  return new Date(Date.now() + sec * 1000).toISOString()
}

export function stageSeconds(stage: 'frame' | 'action' | 'preview' | 'processing'): number {
  const t = timers()
  switch (stage) {
    case 'frame': return t.frame || 30
    case 'action': return t.action || 120
    case 'preview': return t.preview || 45
    // batas aman render; diperpanjang selama job masih berjalan
    case 'processing': return 120
  }
}

export function selectFrame(sessionId: string, frameId: string, selectedBy: string): string {
  const stageExpiresAt = expiresIn(stageSeconds('action'))
  db.prepare(`
    UPDATE sessions
    SET frame_id = ?, frame_selected_by = ?, status = 'frame_selected', stage_expires_at = ?
    WHERE id = ?
  `).run(frameId, selectedBy, stageExpiresAt, sessionId)
  return stageExpiresAt
}

export function startPreview(sessionId: string): void {
  db.prepare(`
    UPDATE sessions SET status = 'previewing', stage_expires_at = ? WHERE id = ?
  `).run(expiresIn(stageSeconds('preview')), sessionId)
}

export interface FinalizeResult {
  status: string
  render_jobs: string[]
  print_requested: boolean
  already_finalized: boolean
}

/** Buat render job (+ print job) sekali per sesi. Panggilan ulang (klik ganda, timeout bersamaan) aman. */
export function finalizeSession(sessionId: string, requestPrint: boolean): FinalizeResult {
  const run = db.transaction((): FinalizeResult => {
    const session = db.prepare('SELECT status FROM sessions WHERE id = ?').get(sessionId) as { status: string } | undefined
    if (!session) throw new Error('Session not found')

    const existing = db.prepare('SELECT type FROM render_jobs WHERE session_id = ?').all(sessionId) as Array<{ type: string }>
    if (existing.length > 0 || ['processing', 'completed', 'failed'].includes(session.status)) {
      const printJob = db.prepare('SELECT id FROM print_jobs WHERE session_id = ?').get(sessionId)
      return {
        status: session.status,
        render_jobs: existing.map((j) => j.type),
        print_requested: !!printJob,
        already_finalized: true
      }
    }

    const config = getConfig()
    const renderJobs = ['strip']
    if (config?.output_mode === 'full') {
      renderJobs.push('gif', 'live_h264', 'live_h265')
    }

    db.prepare(`
      UPDATE sessions SET status = 'processing', stage_expires_at = ? WHERE id = ?
    `).run(expiresIn(stageSeconds('processing')), sessionId)

    const now = new Date().toISOString()
    for (const type of renderJobs) {
      db.prepare(`
        INSERT INTO render_jobs (id, session_id, type, status, created_at)
        VALUES (?, ?, ?, 'pending', ?)
      `).run(uuidv4(), sessionId, type, now)
    }

    const printer = getPrinterSettings()
    const print = requestPrint && printer.print_mode === 'local'
    if (print) {
      db.prepare(`
        INSERT INTO print_jobs (id, session_id, status, printer_name, copies, created_at)
        VALUES (?, ?, 'queued', ?, ?, ?)
      `).run(uuidv4(), sessionId, printer.printer_name || 'default', printer.copies, now)
    }

    return { status: 'processing', render_jobs: renderJobs, print_requested: print, already_finalized: false }
  })

  const result = run()
  if (!result.already_finalized) {
    logger.info({ session_id: sessionId, render_jobs: result.render_jobs, print: result.print_requested }, 'Session finalized')
    // sesi masuk cloud sejak awal: QR langsung bisa dibuka, file menyusul tiap kali render selesai
    queueSession(db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId))
  }
  return result
}

/**
 * Dipanggil render worker setelah tiap job selesai/gagal final. Bila tidak ada job aktif lagi,
 * sesi ditutup (completed bila strip ada, selain itu failed) dan diantre ke cloud.
 */
export function completeSessionIfDone(sessionId: string): void {
  const active = db.prepare(`SELECT COUNT(*) AS n FROM render_jobs WHERE session_id = ? AND ${ACTIVE_RENDER}`).get(sessionId) as { n: number }
  if (active.n > 0) return

  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as any
  if (!session || session.status !== 'processing') return

  const outputs = db.prepare(`SELECT type, path FROM outputs WHERE session_id = ? AND status = 'done'`).all(sessionId) as Array<{ type: string; path: string }>
  const hasStrip = outputs.some((o) => o.type === 'strip')
  const status = hasStrip ? 'completed' : 'failed'
  const now = new Date().toISOString()

  db.prepare(`
    UPDATE sessions SET status = ?, stage_expires_at = NULL, completed_at = ?, sync_status = 'pending' WHERE id = ?
  `).run(status, now, sessionId)

  logger.info({ session_id: sessionId, status, outputs: outputs.map((o) => o.type) }, 'Session closed')

  // output sudah diantre render worker satu per satu; status akhir dikirim paling akhir (prioritas
  // rendah) agar halaman download berhenti menunggu hanya setelah semua file terunggah
  queueSession({ ...session, status, completed_at: now }, 1)
}

/** Tindakan saat stage_expires_at lewat. Dipakai GET sesi (kiosk polling) dan job cleanup. */
export function expireSession(session: any): void {
  const now = new Date().toISOString()

  switch (session.status) {
    case 'created': {
      const frames = db.prepare(`SELECT value FROM config_cache WHERE key = 'frames'`).get() as { value: string } | undefined
      const first = frames ? JSON.parse(frames.value)[0] : null
      if (first) {
        selectFrame(session.id, first.id, 'timeout')
        logger.info({ session_id: session.id, frame_id: first.id }, 'Frame auto-selected on timeout')
        return
      }
      break
    }

    case 'frame_selected':
    case 'capturing': {
      const photos = db.prepare(`SELECT COUNT(*) AS n FROM photos WHERE session_id = ?`).get(session.id) as { n: number }
      if (photos.n > 0) {
        startPreview(session.id)
        logger.info({ session_id: session.id }, 'Action timeout → preview')
        return
      }
      break
    }

    case 'previewing':
      // PRD: saat timer Preview habis, hasil diproses dan dicetak otomatis
      finalizeSession(session.id, true)
      return

    case 'processing': {
      const active = db.prepare(`SELECT COUNT(*) AS n FROM render_jobs WHERE session_id = ? AND ${ACTIVE_RENDER}`).get(session.id) as { n: number }
      if (active.n > 0) {
        db.prepare(`UPDATE sessions SET stage_expires_at = ? WHERE id = ?`).run(expiresIn(30), session.id)
        return
      }
      completeSessionIfDone(session.id)
      return
    }
  }

  db.prepare(`
    UPDATE sessions SET status = 'abandoned', completed_at = ?, stage_expires_at = NULL WHERE id = ?
  `).run(now, session.id)
  logger.info({ session_id: session.id, status: session.status }, 'Session abandoned')
}

export function checkSessionExpiry(sessionId: string): boolean {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as any
  if (!session?.stage_expires_at) return false
  if (Date.now() < new Date(session.stage_expires_at).getTime()) return false

  expireSession(session)
  return true
}

export function getRemainingTime(sessionId: string): number {
  const session = db.prepare('SELECT stage_expires_at FROM sessions WHERE id = ?').get(sessionId) as { stage_expires_at: string | null } | undefined
  if (!session?.stage_expires_at) return 0
  return Math.max(0, Math.floor((new Date(session.stage_expires_at).getTime() - Date.now()) / 1000))
}
