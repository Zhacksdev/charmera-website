import { Router } from 'express'
import multer from 'multer'
import { v4 as uuidv4 } from 'uuid'
import { db } from '../db/index.js'
import { logger } from '../services/logger.js'
import { join } from 'path'
import { writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data')
const PHOTOS_DIR = join(DATA_DIR, 'photos')
const CLIPS_DIR = join(DATA_DIR, 'clips')

const router = Router({ mergeParams: true })

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
})

async function ensureDir(dir: string) {
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true })
  }
}

router.post('/:sessionId/photos', upload.fields([{ name: 'photo', maxCount: 1 }, { name: 'clip', maxCount: 1 }]), async (req, res) => {
  try {
    const { sessionId } = req.params
    const files = req.files as { photo?: Express.Multer.File[]; clip?: Express.Multer.File[] }
    const slotIndex = parseInt(req.body.slot_index, 10)
    
    if (!files.photo || files.photo.length === 0) {
      return res.status(400).json({ error: 'Photo file is required' })
    }
    if (isNaN(slotIndex) || slotIndex < 0) {
      return res.status(400).json({ error: 'Invalid slot_index' })
    }
    
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId)
    if (!session) {
      return res.status(404).json({ error: 'Session not found' })
    }
    
    await ensureDir(PHOTOS_DIR)
    await ensureDir(CLIPS_DIR)
    
    const photoId = uuidv4()
    const photoFilename = `${sessionId}_${slotIndex}_${Date.now()}.jpg`
    const photoPath = join(PHOTOS_DIR, photoFilename)
    
    const photoFile = files.photo[0]
    await writeFile(photoPath, photoFile.buffer)
    
    const existingPhoto = db.prepare(`
      SELECT id FROM photos WHERE session_id = ? AND slot_index = ?
    `).get(sessionId, slotIndex)
    
    if (existingPhoto) {
      db.prepare(`
        UPDATE photos 
        SET path = ?, retake_count = retake_count + 1, created_at = ?
        WHERE session_id = ? AND slot_index = ?
      `).run(photoPath, new Date().toISOString(), sessionId, slotIndex)
    } else {
      db.prepare(`
        INSERT INTO photos (id, session_id, slot_index, path, width, height, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(photoId, sessionId, slotIndex, photoPath, photoFile.buffer.length > 0 ? 1920 : 1920, 1080, new Date().toISOString())
    }
    
    let clipPath: string | null = null
    if (files.clip && files.clip.length > 0) {
      const clipId = uuidv4()
      // Chrome/Safari di iPad merekam MP4, Chrome Android/desktop merekam WebM
      const clipExt = files.clip[0].mimetype.includes('mp4') ? 'mp4' : 'webm'
      const clipFilename = `${sessionId}_${slotIndex}_${Date.now()}.${clipExt}`
      clipPath = join(CLIPS_DIR, clipFilename)
      
      const clipFile = files.clip[0]
      await writeFile(clipPath, clipFile.buffer)
      
      const existingClip = db.prepare(`
        SELECT id FROM clips WHERE session_id = ? AND slot_index = ?
      `).get(sessionId, slotIndex)
      
      if (existingClip) {
        db.prepare(`
          UPDATE clips SET path = ? WHERE session_id = ? AND slot_index = ?
        `).run(clipPath, sessionId, slotIndex)
      } else {
        db.prepare(`
          INSERT INTO clips (id, session_id, slot_index, path, duration_ms)
          VALUES (?, ?, ?, ?, ?)
        `).run(clipId, sessionId, slotIndex, clipPath, 5000)
      }
    }
    
    logger.info({ session_id: sessionId, slot_index: slotIndex }, 'Photo saved')
    
    res.json({ 
      status: 'saved', 
      slot_index: slotIndex,
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
