import { Router } from 'express'
import { existsSync } from 'fs'
import { resolve } from 'path'
import { db } from '../db/index.js'
import { getConfig } from '../services/config.js'

const router = Router()

function cachedFrames(): any[] {
  const frames = db.prepare(`
    SELECT * FROM config_cache
    WHERE key = 'frames'
  `).get() as { value: string } | undefined
  return frames ? JSON.parse(frames.value) : []
}

router.get('/', (req, res) => {
  try {
    const config = getConfig()

    if (!config) {
      return res.status(500).json({ error: 'Config not loaded' })
    }

    // keyed_path = path lokal laptop; kiosk memakai image_url (PNG frame dengan slot transparan)
    res.json(cachedFrames().map(({ keyed_path, ...frame }) => ({
      ...frame,
      image_url: `/api/frames/${frame.id}/image`
    })))
  } catch (err) {
    console.error('Failed to get frames:', err)
    res.status(500).json({ error: 'Failed to get frames' })
  }
})

router.get('/:id/image', (req, res) => {
  const frame = cachedFrames().find((f) => f.id === req.params.id)
  if (!frame?.keyed_path || !existsSync(frame.keyed_path)) {
    return res.status(404).json({ error: 'Frame image not found' })
  }
  res.set('Cache-Control', 'public, max-age=300')
  res.type('png').sendFile(resolve(frame.keyed_path))
})

export { router as framesRouter }
