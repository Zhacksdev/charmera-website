import { Router } from 'express'
import pino from 'pino'
import crypto from 'crypto'
import type { NextFunction, Request, Response } from 'express'
import { getSupabase, getSupabaseAuth } from '../lib/supabase.js'

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard'
    }
  }
})

export function rateLimit(limit: number, windowMs: number) {
  const requests = new Map<string, number[]>()

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || 'unknown'
    const now = Date.now()
    const windowStart = now - windowMs

    const userRequests = requests.get(key) || []
    const recentRequests = userRequests.filter(time => time > windowStart)

    if (recentRequests.length >= limit) {
      return res.status(429).json({ error: 'Too many requests' })
    }

    recentRequests.push(now)
    requests.set(key, recentRequests)

    next()
  }
}

export function authDevice(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing device key' })
  }

  const deviceKey = authHeader.slice(7)
  const keyHash = crypto.createHash('sha256').update(deviceKey).digest('hex')

  try {
    // satu device key = satu booth (v1)
    getSupabase()
      .from('booths')
      .select('id, name')
      .eq('device_key_hash', keyHash)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          return res.status(403).json({ error: 'Invalid device key' })
        }
        ;(req as any).booth = data
        next()
      })
  } catch (err: any) {
    res.status(503).json({ error: err.message })
  }
}

export async function authAdmin(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid token' })
  }

  const token = authHeader.slice(7)

  try {
    const { data: userData, error: userError } = await getSupabaseAuth().auth.getUser(token)

    if (userError || !userData?.user) {
      return res.status(401).json({ error: 'Invalid or expired token' })
    }

    const { data: admin, error: adminError } = await getSupabase()
      .from('admin_users')
      .select('role')
      .eq('user_id', userData.user.id)
      .single()

    if (adminError || !admin) {
      return res.status(403).json({ error: 'Not an admin' })
    }

    ;(req as any).admin = { user_id: userData.user.id, role: admin.role }
    next()
  } catch (err: any) {
    res.status(503).json({ error: err.message })
  }
}

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  logger.error({ err, path: req.path }, 'Unhandled error')

  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  })
}
