import { v4 as uuidv4 } from 'uuid'
import { db } from '../db/index.js'
import { logger } from './logger.js'
import { renderStrip } from './render-strip.js'
import { renderGif } from './render-gif.js'
import { renderLivePhoto, liveOutputPaths } from './render-live.js'
import { existsSync } from 'fs'
import { completeSessionIfDone } from './session-flow.js'
import { getConfig } from './config.js'
import { queueOutput } from './sync-worker.js'
import type { Layout } from '@chamera/shared'

export interface RenderJob {
  id: string
  sessionId: string
  type: 'strip' | 'gif' | 'live_h264' | 'live_h265'
  status: 'pending' | 'rendering' | 'done' | 'failed'
  attempts: number
  error?: string
  outputPath?: string
}

let isRendering = false

export async function processRenderJobs() {
  if (isRendering) return
  isRendering = true
  try {
    await processNextRenderJob()
  } finally {
    isRendering = false
  }
}

async function processNextRenderJob() {
  const pendingJobs = db.prepare(`
    SELECT * FROM render_jobs 
    WHERE status = 'pending' 
    ORDER BY created_at ASC 
    LIMIT 1
  `).all() as any[]
  
  for (const job of pendingJobs) {
    const sessionStatus = (db.prepare('SELECT status FROM sessions WHERE id = ?').get(job.session_id) as { status: string } | undefined)?.status
    if (!sessionStatus || sessionStatus === 'abandoned') {
      // sesi direset/dibatalkan saat Preview — jangan habiskan CPU untuk render
      db.prepare(`UPDATE render_jobs SET status = 'failed', error_message = 'Sesi dibatalkan' WHERE id = ?`).run(job.id)
      continue
    }

    const renderRev = () => (db.prepare('SELECT render_rev FROM sessions WHERE id = ?').get(job.session_id) as { render_rev: number } | undefined)?.render_rev
    const startRev = renderRev()

    try {
      db.prepare(`
        UPDATE render_jobs SET status = 'rendering' WHERE id = ?
      `).run(job.id)

      const outputPath = await processRenderJob(job)

      // filter diganti saat job ini berjalan: job sudah dikembalikan ke pending, hasil lama dibuang
      if (renderRev() !== startRev) {
        logger.info({ job_id: job.id, type: job.type }, 'Render discarded: filter changed')
        continue
      }

      db.prepare(`
        UPDATE render_jobs 
        SET status = 'done', finished_at = ?
        WHERE id = ?
      `).run(new Date().toISOString(), job.id)
      
      db.prepare(`
        INSERT INTO outputs (id, session_id, type, path, status, created_at)
        VALUES (?, ?, ?, ?, 'done', ?)
      `).run(uuidv4(), job.session_id, job.type, outputPath, new Date().toISOString())
      
      logger.info({ job_id: job.id, type: job.type }, 'Render job completed')

      // unggah ke cloud segera (strip dulu) — halaman download menampilkan file satu per satu.
      // Selama Preview sesi belum ada di cloud; finalizeSession mengantre output yang sudah jadi.
      const status = (db.prepare('SELECT status FROM sessions WHERE id = ?').get(job.session_id) as { status: string } | undefined)?.status
      if (status && ['processing', 'completed', 'failed'].includes(status)) {
        queueOutput(job.session_id, job.type, outputPath)
      }
      
    } catch (err: any) {
      logger.error({ err, job_id: job.id }, 'Render job failed')

      const attempts = (job.attempts || 0) + 1
      const nextStatus = attempts < 3 ? 'pending' : 'failed'

      db.prepare(`
        UPDATE render_jobs
        SET status = ?, attempts = ?, error_message = ?
        WHERE id = ?
      `).run(nextStatus, attempts, err.message, job.id)
    }

    try {
      completeSessionIfDone(job.session_id)
    } catch (err) {
      logger.error({ err, session_id: job.session_id }, 'Failed to close session')
    }
  }
}

async function processRenderJob(job: any): Promise<string> {
  const session = db.prepare(`
    SELECT * FROM sessions WHERE id = ?
  `).get(job.session_id) as any
  
  if (!session) {
    throw new Error('Session not found')
  }
  
  const photos = db.prepare(`
    SELECT * FROM photos WHERE session_id = ? ORDER BY slot_index
  `).all(job.session_id) as any[]
  
  if (photos.length === 0) {
    throw new Error('No photos found')
  }
  
  const frames = db.prepare(`
    SELECT value FROM config_cache WHERE key = 'frames'
  `).get() as any
  
  if (!frames) {
    throw new Error('No frames found in cache')
  }
  
  const framesList = JSON.parse(frames.value)
  const frame = framesList.find((f: any) => f.id === session.frame_id)
  
  if (!frame) {
    throw new Error('Frame not found')
  }
  
  const layout: Layout = frame.layout
  const frameKeyedPath = frame.keyed_path || join(process.env.DATA_DIR || './data', 'frames', `${frame.id}_keyed.png`)
  
  switch (job.type) {
    case 'strip':
      return await renderStrip({
        sessionId: job.session_id,
        photos: photos.map(p => ({ slot_index: p.slot_index, path: p.path })),
        frameKeyedPath,
        layout,
        customText: session.custom_text,
        filter: session.filter
      })
      
    case 'gif':
      const gifConfig = (getConfig() as any)?.gif_config || {}
      return await renderGif({
        sessionId: job.session_id,
        photos: photos.map(p => ({ slot_index: p.slot_index, path: p.path })),
        frameDurationMs: gifConfig.frame_duration_ms,
        maxWidth: gifConfig.max_width,
        filter: session.filter
      })
      
    case 'live_h265':
    case 'live_h264':
      // satu render menghasilkan H.265 + H.264 sekaligus — job saudara cukup memakai file yang sudah ada
      const sibling = job.type === 'live_h265' ? 'live_h264' : 'live_h265'
      const siblingDone = db.prepare(`
        SELECT 1 FROM render_jobs WHERE session_id = ? AND type = ? AND status = 'done'
      `).get(job.session_id, sibling)
      const existingPath = liveOutputPaths(job.session_id)[job.type === 'live_h265' ? 'h265' : 'h264']
      if (siblingDone && existsSync(existingPath)) {
        return existingPath
      }

      const clips = db.prepare(`
        SELECT * FROM clips WHERE session_id = ? ORDER BY slot_index
      `).all(job.session_id) as any[]
      
      if (clips.length === 0) {
        throw new Error('No clips found')
      }
      
      const config = getConfig() as any
      const liveConfig = config?.live_config || {}
      const result = await renderLivePhoto({
        sessionId: job.session_id,
        clips: clips.map(c => ({
          slot_index: c.slot_index,
          path: c.path,
          duration_ms: c.duration_ms
        })),
        framePath: frameKeyedPath,
        layout,
        customText: session.custom_text,
        durationSec: liveConfig.clip_sec || config?.timers?.countdown || 5,
        codec: liveConfig.codec,
        previewH264: liveConfig.preview_h264,
        filter: session.filter
      })
      
      return job.type === 'live_h265' ? result.h265 : (result.h264 || result.h265)
      
    default:
      throw new Error(`Unknown render type: ${job.type}`)
  }
}

export function startRenderWorker() {
  setInterval(processRenderJobs, 2000)
  logger.info('Render worker started')
}

function join(...paths: string[]): string {
  const { join: pathJoin } = require('path')
  return pathJoin(...paths)
}
