import express from 'express'
import cors from 'cors'
import { publicRouter } from './public/index.js'
import { deviceRouter } from './device/index.js'
import { adminRouter } from './admin/index.js'
import { logger, rateLimit, authAdmin, authDevice, errorHandler } from './middlewares/index.js'

const PORT = parseInt(process.env.PORT || '4001', 10)

const app = express()

app.use(cors())
app.use(express.json({ limit: '50mb' }))

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.use('/api/public', rateLimit(100, 60000), publicRouter)

app.use('/api/device', authDevice, rateLimit(600, 60000), deviceRouter)

const ADMIN_ORIGIN = process.env.ADMIN_ORIGIN || 'http://localhost:3002'
app.use('/api/admin', 
  cors({ origin: ADMIN_ORIGIN, credentials: true }),
  authAdmin, 
  rateLimit(300, 60000), 
  adminRouter
)

app.use(errorHandler)

app.listen(PORT, () => {
  logger.info(`Cloud API listening on port ${PORT}`)
  logger.info(`Public API: /api/public`)
  logger.info(`Device API: /api/device`)
  logger.info(`Admin API: /api/admin`)
})

export { app }
