import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { db } from '../db/index.js'
import { logger } from '../services/logger.js'
import { savePhotoInputSchema } from '@chamera/shared'
import { join } from 'path'
import { writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data')
const PHOTOS_DIR = join(DATA_DIR, 'photos')
const CLIPS_DIR = join(DATA_DIR, 'clips')

const router = Router({ mergeParams: true })

async function ensureDir(dir: string) {
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true })
  }
}

router.post('/:sessionId/photos', async (req, res) => {
  try {
    const { sessionId } = req.params
    const input = savePhotoInputSchema.parse(req.body)
    
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId)
    if (!session) {
      return res.status(404).json({ error: 'Session not found' })
    }
    
    await ensureDir(PHOTOS_DIR)
    await ensureDir(CLIPS_DIR)
    
    const photoId = uuidv4()
    const photoFilename = `${sessionId}_${input.slot_index}_${Date.now()}.jpg`
    const photoPath = join(PHOTOS_DIR, photoFilename)
    
    const photoBuffer = Buffer.from(input.photo_data, 'base64')
    await writeFile(photoPath, photoBuffer)
    
    const existingPhoto = db.prepare(`
      SELECT id FROM photos WHERE session_id = ? AND slot_index = ?
    `).get(sessionId, input.slot_index)
    
    if (existingPhoto) {
      db.prepare(`
        UPDATE photos 
        SET path = ?, retake_count = retake_count + 1, created_at = ?
        WHERE session_id = ? AND slot_index = ?
      `).run(photoPath, new Date().toISOString(), sessionId, input.slot_index)
    } else {
      db.prepare(`
        INSERT INTO photos (id, session_id, slot_index, path, width, height, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(photoId, sessionId, input.slot_index, photoPath, 1920, 1080, new Date().toISOString())
    }
    
    let clipPath: string | null = null
    if (input.clip_data) {
      const clipId = uuidv4()
      const clipFilename = `${sessionId}_${input.slot_index}_${Date.now()}.webm`
      clipPath = join(CLIPS_DIR, clipFilename)
      
      const clipBuffer = Buffer.from(input.clip_data, 'base64')
      await writeFile(clipPath, clipBuffer)
      
      const existingClip = db.prepare(`
        SELECT id FROM clips WHERE session_id = ? AND slot_index = ?
      `).get(sessionId, input.slot_index)
      
      if (existingClip) {
        db.prepare(`
          UPDATE clips SET path = ? WHERE session_id = ? AND slot_index = ?
        `).run(clipPath, sessionId, input.slot_index)
      } else {
        db.prepare(`
          INSERT INTO clips (id, session_id, slot_index, path, duration_ms)
          VALUES (?, ?, ?, ?, ?)
        `).run(clipId, sessionId, input.slot_index, clipPath, 5000)
      }
    }
    
    logger.info({ session_id: sessionId, slot_index: input.slot_index }, 'Photo saved')
    
    res.json({ 
      status: 'saved', 
      slot_index: input.slot_index,
      photo_path: photoPath,
      clip_path: clipPath
    })
  } catch (err) {
    logger.error({ err }, 'Failed to save photo')
    res.status(500).json({ error: 'Failed to save photo' })
  }
})

router.post('/:sessionId/text', (req, res) => {
  try {
    const { sessionId } = req.params
    const { custom_text } = req.body
    
    if (!custom_text || custom_text.length > 30) {
      return res.status(400).json({ error: 'Invalid custom text' })
    }
    
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId)
    if (!session) {
      return res.status(404).json({ error: 'Session not found' })
    }
    
    db.prepare(`
      UPDATE sessions SET custom_text = ? WHERE id = ?
    `).run(custom_text, sessionId)
    
    res.json({ status: 'saved', custom_text })
  } catch (err) {
    logger.error({ err }, 'Failed to save custom text')
    res.status(500).json({ error: 'Failed to save custom text' })
  }
})

export { router as captureRouter }
