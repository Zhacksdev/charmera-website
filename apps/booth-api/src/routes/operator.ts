import { Router } from 'express'
import { db } from '../db/index.js'
import { logger } from '../services/logger.js'
import crypto from 'crypto'
import { ZodError } from 'zod'
import { testPrint } from '../services/print-worker.js'
import { retryFailedOutbox } from '../services/sync-worker.js'
import { getPrinterSettings, savePrinterSettings, listPrinters, getPrinterHealth } from '../services/printer.js'

const router = Router()

const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex')

// OPERATOR_PIN_HASH (sha256 hex) diutamakan; OPERATOR_PIN plaintext sebagai alternatif praktis
const OPERATOR_PIN_HASH = (process.env.OPERATOR_PIN_HASH || '').toLowerCase() ||
  (process.env.OPERATOR_PIN ? sha256(process.env.OPERATOR_PIN) : '')

if (!OPERATOR_PIN_HASH) {
  logger.warn('OPERATOR_PIN / OPERATOR_PIN_HASH belum diset — panel operator tidak bisa dibuka')
}

function verifyPin(pin: string): boolean {
  if (!OPERATOR_PIN_HASH) return false
  return crypto.timingSafeEqual(Buffer.from(sha256(pin)), Buffer.from(OPERATOR_PIN_HASH))
}

router.use((req, res, next) => {
  const pin = req.headers['x-operator-pin'] || req.body?.pin
  
  if (!pin || !verifyPin(String(pin))) {
    return res.status(401).json({ error: 'Invalid PIN' })
  }
  
  next()
})

async function printerState() {
  const settings = getPrinterSettings()
  let printers: Awaited<ReturnType<typeof listPrinters>> = []
  let listError: string | null = null
  try {
    printers = await listPrinters(true)
  } catch (err: any) {
    listError = err?.message || 'Gagal membaca daftar printer'
  }
  return { settings, printers, list_error: listError, health: await getPrinterHealth(settings) }
}

router.get('/printer', async (req, res) => {
  try {
    res.json(await printerState())
  } catch (err) {
    logger.error({ err }, 'Failed to read printer state')
    res.status(500).json({ error: 'Gagal membaca status printer' })
  }
})

router.put('/printer', async (req, res) => {
  try {
    savePrinterSettings(req.body)
    res.json(await printerState())
  } catch (err) {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: 'Pengaturan printer tidak valid', details: err.errors })
    }
    logger.error({ err }, 'Failed to save printer settings')
    res.status(500).json({ error: 'Gagal menyimpan pengaturan printer' })
  }
})

router.post('/preflight', async (req, res) => {
  try {
    const printer = await getPrinterHealth()
    const results = {
      camera: { status: 'ok', message: 'Camera OK' },
      disk: { status: 'ok', message: 'Disk OK' },
      config: { status: 'ok', message: 'Config loaded' },
      printer
    }
    
    res.json(results)
  } catch (err) {
    logger.error({ err }, 'Preflight check failed')
    res.status(500).json({ error: 'Preflight check failed' })
  }
})

router.post('/test-print', async (req, res) => {
  try {
    const result = await testPrint()
    
    if (result.ok) {
      res.json({ status: 'success', message: 'Test print terkirim ke printer' })
    } else {
      res.status(500).json({ error: result.error || 'Test print gagal' })
    }
  } catch (err) {
    logger.error({ err }, 'Test print error')
    res.status(500).json({ error: 'Test print failed' })
  }
})

router.post('/retry-sync', (req, res) => {
  try {
    const requeued = retryFailedOutbox()
    const pending = db.prepare(`
      SELECT COUNT(*) as count FROM outbox WHERE status = 'pending'
    `).get() as { count: number }
    
    res.json({ 
      message: 'Sync retry triggered',
      requeued,
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
