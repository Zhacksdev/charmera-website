import express from 'express'
import cors from 'cors'
import { db, runMigrations } from './db/index.js'
import { sessionsRouter } from './routes/sessions.js'
import { framesRouter } from './routes/frames.js'
import { captureRouter } from './routes/capture.js'
import { outputsRouter } from './routes/outputs.js'
import { printRouter } from './routes/print.js'
import { statusRouter } from './routes/status.js'
import { operatorRouter } from './routes/operator.js'
import { logger } from './services/logger.js'
import { startCleanupJob } from './services/cleanup.js'
import { startRenderWorker } from './services/render-worker.js'
import { startSyncWorker } from './services/sync-worker.js'
import { startConfigPuller } from './services/config-puller.js'
import { startCleanupWorker } from './services/cleanup-local.js'
import { startPrintWorker } from './services/print-worker.js'
import { seedDefaults } from './services/seed-defaults.js'

const HOST = process.env.BOOTH_API_HOST || '127.0.0.1'
const PORT = parseInt(process.env.BOOTH_API_PORT || '4000', 10)

// ponytail: whitelist origin kiosk; tambah origin via KIOSK_ORIGINS env (dipisah koma)
const KIOSK_ORIGINS = (process.env.KIOSK_ORIGINS ||
  'http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001'
).split(',')

const app = express()

app.use(cors({
  origin: KIOSK_ORIGINS,
  credentials: true
}))

app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))

app.use((req, res, next) => {
  logger.info({ method: req.method, path: req.path }, 'Request')
  next()
})

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.use('/api/sessions', sessionsRouter)
app.use('/api/frames', framesRouter)
app.use('/api/sessions', captureRouter)
app.use('/api/sessions', outputsRouter)
app.use('/api/sessions', printRouter)
app.use('/api/status', statusRouter)
app.use('/api/operator', operatorRouter)

app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error({ err, path: req.path }, 'Unhandled error')
  res.status(500).json({ error: 'Internal server error' })
})

// ponytail: tidak memanggil closeDb() saat shutdown — better-sqlite3 crash natif
// saat statement di-GC setelah close; WAL SQLite aman ditutup oleh OS.
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down')
  process.exit(0)
})

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down')
  process.exit(0)
})

async function boot() {
  runMigrations()
  await seedDefaults()

  startCleanupJob()
  startRenderWorker()
  startSyncWorker()
  startConfigPuller()
  startCleanupWorker()
  startPrintWorker()

  app.listen(PORT, HOST, () => {
    logger.info(`Booth API listening on http://${HOST}:${PORT}`)
  })
}

boot().catch((err) => {
  logger.error({ err }, 'Failed to boot booth-api')
  process.exit(1)
})

export { app }
