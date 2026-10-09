import { v4 as uuidv4 } from 'uuid'
import { db } from '../db/index.js'
import { logger } from './logger.js'
import { renderStrip } from './render-strip.js'
import { renderGif } from './render-gif.js'
import { renderLivePhoto } from './render-live.js'
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

export async function processRenderJobs() {
  const pendingJobs = db.prepare(`
    SELECT * FROM render_jobs 
    WHERE status = 'pending' 
    ORDER BY created_at ASC 
    LIMIT 1
  `).all() as any[]
  
  for (const job of pendingJobs) {
    try {
      db.prepare(`
        UPDATE render_jobs SET status = 'rendering' WHERE id = ?
      `).run(job.id)
      
      const outputPath = await processRenderJob(job)
      
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
        customText: session.custom_text
      })
      
    case 'gif':
      return await renderGif({
        sessionId: job.session_id,
        photos: photos.map(p => ({ slot_index: p.slot_index, path: p.path })),
        framePath: frameKeyedPath,
        layout
      })
      
    case 'live_h265':
    case 'live_h264':
      const clips = db.prepare(`
        SELECT * FROM clips WHERE session_id = ? ORDER BY slot_index
      `).all(job.session_id) as any[]
      
      if (clips.length === 0) {
        throw new Error('No clips found')
      }
      
      const result = await renderLivePhoto({
        sessionId: job.session_id,
        clips: clips.map(c => ({ 
          slot_index: c.slot_index, 
          path: c.path, 
          duration_ms: c.duration_ms 
        })),
        framePath: frameKeyedPath,
        layout
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
