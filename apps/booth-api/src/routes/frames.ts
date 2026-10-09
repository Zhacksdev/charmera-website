import { Router } from 'express'
import { db } from '../db/index.js'
import { getConfig } from '../services/config.js'

const router = Router()

router.get('/', (req, res) => {
  try {
    const config = getConfig()
    
    if (!config) {
      return res.status(500).json({ error: 'Config not loaded' })
    }
    
    const frames = db.prepare(`
      SELECT * FROM config_cache 
      WHERE key = 'frames'
    `).get() as { value: string } | undefined
    
    if (!frames) {
      return res.json([])
    }
    
    const framesList = JSON.parse(frames.value)
    res.json(framesList)
  } catch (err) {
    console.error('Failed to get frames:', err)
    res.status(500).json({ error: 'Failed to get frames' })
  }
})

export { router as framesRouter }
