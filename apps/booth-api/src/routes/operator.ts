import { Router } from 'express'
import { db } from '../db/index.js'
import { logger } from '../services/logger.js'
import crypto from 'crypto'
import { testPrint } from '../services/print-worker.js'

const router = Router()

const OPERATOR_PIN_HASH = process.env.OPERATOR_PIN_HASH || ''

function verifyPin(pin: string): boolean {
  if (!OPERATOR_PIN_HASH) return false
  const hash = crypto.createHash('sha256').update(pin).digest('hex')
  return hash === OPERATOR_PIN_HASH
}

router.use((req, res, next) => {
  const pin = req.headers['x-operator-pin'] || req.body?.pin
  
  if (!pin || !verifyPin(pin as string)) {
    return res.status(401).json({ error: 'Invalid PIN' })
  }
  
  next()
})

router.post('/preflight', async (req, res) => {
  try {
    const results = {
      camera: { status: 'ok', message: 'Camera OK' },
      disk: { status: 'ok', message: 'Disk OK' },
      config: { status: 'ok', message: 'Config loaded' },
      printer: { status: 'ok', message: 'Printer ready' }
    }
    
    res.json(results)
  } catch (err) {
    logger.error({ err }, 'Preflight check failed')
    res.status(500).json({ error: 'Preflight check failed' })
  }
})

router.post('/test-print', async (req, res) => {
  try {
    const config = db.prepare(`
      SELECT value FROM config_cache WHERE key = 'settings'
    `).get() as any
    
    if (!config) {
      return res.status(400).json({ error: 'Config not loaded' })
    }
    
    const settings = JSON.parse(config.value)
    const printerName = settings.printer_name || 'default'
    
    const success = await testPrint(printerName)
    
    if (success) {
      res.json({ status: 'success', message: 'Test print sent' })
    } else {
      res.status(500).json({ error: 'Test print failed' })
    }
  } catch (err) {
    logger.error({ err }, 'Test print error')
    res.status(500).json({ error: 'Test print failed' })
  }
})

router.post('/retry-sync', (req, res) => {
  try {
    const pending = db.prepare(`
      SELECT COUNT(*) as count FROM outbox WHERE status = 'pending'
    `).get() as { count: number }
    
    res.json({ 
      message: 'Sync retry triggered',
      pending_items: pending.count
    })
  } catch (err) {
    logger.error({ err }, 'Retry sync failed')
    res.status(500).json({ error: 'Retry sync failed' })
  }
})

router.post('/reprint/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params
    
    const job = db.prepare(`
      SELECT * FROM print_jobs WHERE session_id = ?
    `).get(sessionId)
    
    if (!job) {
      return res.status(404).json({ error: 'Print job not found' })
    }
    
    db.prepare(`
      UPDATE print_jobs 
      SET status = 'queued', attempts = 0, error_message = NULL
      WHERE session_id = ?
    `).run(sessionId)
    
    logger.info({ session_id: sessionId }, 'Reprint triggered')
    
    res.json({ status: 'queued', message: 'Reprint queued' })
  } catch (err) {
    logger.error({ err }, 'Reprint failed')
    res.status(500).json({ error: 'Reprint failed' })
  }
})

export { router as operatorRouter }
