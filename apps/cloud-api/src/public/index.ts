import { Router } from 'express'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { presignGet, isS3Configured } from '../lib/s3.js'
import { logger } from '../middlewares/index.js'

const router = Router()

const RATE_LIMIT = 100
const RATE_WINDOW = 60000

const ipRequests = new Map<string, number[]>()

let supabase: SupabaseClient | null = null

function getSupabase(): SupabaseClient | null {
  if (!supabase && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )
  }
  return supabase
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const windowStart = now - RATE_WINDOW

  const requests = ipRequests.get(ip) || []
  const recentRequests = requests.filter(t => t > windowStart)

  if (recentRequests.length >= RATE_LIMIT) {
    return false
  }

  recentRequests.push(now)
  ipRequests.set(ip, recentRequests)

  return true
}

router.get('/download/:code', async (req, res) => {
  try {
    const ip = req.ip || 'unknown'

    if (!checkRateLimit(ip)) {
      return res.status(429).json({ error: 'Too many requests' })
    }

    const { code } = req.params

    if (!code || code.length !== 12) {
      return res.status(400).json({ error: 'Invalid code' })
    }

    const db = getSupabase()

    if (!db) {
      return res.status(503).json({ error: 'Cloud not configured' })
    }

    const { data: session, error } = await db
      .from('sessions')
      .select('id, status, sync_status')
      .eq('public_code', code)
      .single()

    if (error || !session) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Sedang diproses, coba lagi sebentar'
      })
    }

    if (session.sync_status !== 'synced') {
      return res.status(202).json({
        status: 'processing',
        message: 'Sedang diproses, coba lagi sebentar',
        files: []
      })
    }

    const { data: outputs } = await db
      .from('outputs')
      .select('type, s3_key')
      .eq('session_id', session.id)
      .eq('status', 'done')

    await db.from('downloads').insert({
      session_id: session.id,
      output_type: 'access',
      ip_hash: require('crypto').createHash('sha256').update(ip).digest('hex')
    })

    logger.info({ code, ip }, 'Download page accessed')

    const files = await Promise.all((outputs || []).map(async (o: any) => ({
      type: o.type,
      s3_key: o.s3_key,
      url: isS3Configured() ? await presignGet(o.s3_key, 3600) : null
    })))

    res.json({
      status: 'ready',
      public_code: code,
      files,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    })
  } catch (err) {
    logger.error({ err }, 'Download endpoint error')
    res.status(500).json({ error: 'Server error' })
  }
})

export { router as publicRouter }
