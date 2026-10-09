import { Router } from 'express'
import { detectSlots, createKeyedImage, createLayout } from '@chamera/frame-engine'
import { v4 as uuidv4 } from 'uuid'
import { getSupabase } from '../lib/supabase.js'
import { isS3Configured, presignPut, presignGet } from '../lib/s3.js'

export const adminRouter = Router()

async function getBoothId(reqBoothId?: string): Promise<string | null> {
  const supabase = getSupabase()
  if (reqBoothId) return reqBoothId
  const { data } = await supabase.from('booths').select('id').limit(1).single()
  return data?.id || null
}

// ---- Frame analysis (lokal via sharp, tanpa storage) ----

adminRouter.post('/frames/analyze', async (req, res) => {
  try {
    const { image } = req.body

    if (!image) {
      return res.status(400).json({ error: 'Missing image data' })
    }

    const imageBuffer = Buffer.from(image, 'base64')
    const detection = await detectSlots(imageBuffer)
    const keyedBuffer = await createKeyedImage(imageBuffer)
    const layout = createLayout(detection.slots, detection.canvas.w, detection.canvas.h)

    res.json({
      slots: detection.slots,
      canvas: detection.canvas,
      orientation: detection.orientation,
      layout,
      keyed_preview: keyedBuffer.toString('base64')
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to analyze frame' })
  }
})

// ---- Frame CRUD ----

adminRouter.get('/frames', async (req, res) => {
  try {
    const supabase = getSupabase()
    const boothId = await getBoothId(req.query.booth_id as string)

    const { data, error } = await supabase
      .from('frames')
      .select('id, booth_id, name, orientation, canvas_w, canvas_h, layout, extra_price, is_active, sort_order, keyed_key, created_at')
      .eq('booth_id', boothId!)
      .order('sort_order')

    if (error) return res.status(500).json({ error: error.message })

    res.json((data || []).map((f: any) => ({
      ...f,
      slot_count: f.layout?.slots?.length ?? 0
    })))
  } catch (err: any) {
    res.status(503).json({ error: err.message })
  }
})

adminRouter.post('/frames', async (req, res) => {
  try {
    const supabase = getSupabase()
    const boothId = await getBoothId(req.body.booth_id)

    if (!boothId) return res.status(400).json({ error: 'Booth belum terdaftar' })

    const { name, orientation, canvas_w, canvas_h, layout, extra_price, sort_order, image_base64 } = req.body

    if (!name || !layout?.slots?.length) {
      return res.status(400).json({ error: 'name dan layout.slots wajib' })
    }

    const id = uuidv4()
    let keyedKey: string | null = null

    // simpan frame keyed ke S3 — booth mengunduh asset ini saat config pull
    if (image_base64 && isS3Configured()) {
      keyedKey = `frames/${id}_keyed.png`
      const uploadUrl = await presignPut(keyedKey, 'image/png', 600)
      const buf = Buffer.from(image_base64, 'base64')
      const put = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/png' },
        body: buf
      })
      if (!put.ok) {
        return res.status(500).json({ error: `Upload ke S3 gagal: ${put.status}` })
      }
    } else if (image_base64) {
      return res.status(503).json({ error: 'S3 belum dikonfigurasi — frame PNG tidak bisa disimpan' })
    }

    const { data, error } = await supabase
      .from('frames')
      .insert({
        id,
        booth_id: boothId,
        name,
        orientation: orientation || 'portrait',
        canvas_w: canvas_w || 1200,
        canvas_h: canvas_h || 1800,
        layout,
        extra_price: extra_price || 0,
        is_active: true,
        sort_order: sort_order || 0,
        keyed_key: keyedKey
      })
      .select()
      .single()

    if (error) return res.status(500).json({ error: error.message })

    await bumpConfigVersion(boothId)
    res.status(201).json(data)
  } catch (err: any) {
    res.status(503).json({ error: err.message })
  }
})

adminRouter.patch('/frames/:id', async (req, res) => {
  try {
    const supabase = getSupabase()
    const allowed = ['name', 'extra_price', 'is_active', 'sort_order', 'layout', 'orientation']
    const patch: any = {}
    for (const k of allowed) if (k in req.body) patch[k] = req.body[k]

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: 'Tidak ada field yang diubah' })
    }

    const { data, error } = await supabase
      .from('frames')
      .update(patch)
      .eq('id', req.params.id)
      .select()
      .single()

    if (error) return res.status(500).json({ error: error.message })
    if (!data) return res.status(404).json({ error: 'Frame not found' })

    await bumpConfigVersion(data.booth_id)
    res.json(data)
  } catch (err: any) {
    res.status(503).json({ error: err.message })
  }
})

adminRouter.delete('/frames/:id', async (req, res) => {
  try {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('frames')
      .delete()
      .eq('id', req.params.id)
      .select('booth_id')
      .single()

    if (error) return res.status(500).json({ error: error.message })
    if (!data) return res.status(404).json({ error: 'Frame not found' })

    await bumpConfigVersion(data.booth_id)
    res.json({ status: 'deleted' })
  } catch (err: any) {
    res.status(503).json({ error: err.message })
  }
})

// ---- Settings ----

adminRouter.get('/settings', async (req, res) => {
  try {
    const supabase = getSupabase()
    const boothId = await getBoothId()

    const { data, error } = await supabase
      .from('settings')
      .select('*')
      .eq('booth_id', boothId!)
      .single()

    if (error || !data) return res.status(404).json({ error: 'Settings not found' })
    res.json(data)
  } catch (err: any) {
    res.status(503).json({ error: err.message })
  }
})

adminRouter.patch('/settings', async (req, res) => {
  try {
    const supabase = getSupabase()
    const boothId = await getBoothId(req.body.booth_id)

    const allowed = [
      'output_mode', 'print_mode', 'printer_name', 'copies', 'media_capacity',
      'media_warn_at', 'base_price', 'retention_days', 'timers', 'camera',
      'live_config', 'gif_config', 'preflight'
    ]
    const patch: any = {}
    for (const k of allowed) if (k in req.body) patch[k] = req.body[k]

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: 'Tidak ada field yang diubah' })
    }

    patch.config_version = await nextConfigVersion(boothId!)
    patch.updated_at = new Date().toISOString()

    const { data, error } = await supabase
      .from('settings')
      .update(patch)
      .eq('booth_id', boothId!)
      .select()
      .single()

    if (error) return res.status(500).json({ error: error.message })
    res.json(data)
  } catch (err: any) {
    res.status(503).json({ error: err.message })
  }
})

// ---- Sessions / Stats / Revenue / Logs / Health / Commands ----

adminRouter.get('/sessions', async (req, res) => {
  try {
    const supabase = getSupabase()
    let query = supabase
      .from('sessions')
      .select('id, public_code, status, sync_status, price, started_at, completed_at')
      .order('started_at', { ascending: false })
      .limit(Number(req.query.limit) || 100)

    if (req.query.status && req.query.status !== 'all') {
      query = query.eq('status', req.query.status as string)
    }
    if (req.query.from) query = query.gte('started_at', req.query.from as string)
    if (req.query.to) query = query.lte('started_at', req.query.to as string)

    const { data, error } = await query
    if (error) return res.status(500).json({ error: error.message })
    res.json(data || [])
  } catch (err: any) {
    res.status(503).json({ error: err.message })
  }
})

adminRouter.get('/stats', async (req, res) => {
  try {
    const supabase = getSupabase()
    const boothId = await getBoothId()

    const count = async (table: string, eq?: Record<string, string>) => {
      let q = supabase.from(table).select('*', { count: 'exact', head: true }).eq('booth_id', boothId!)
      for (const [k, v] of Object.entries(eq || {})) q = q.eq(k, v)
      const { count } = await q
      return count || 0
    }

    const [total, completed, activeFrames] = await Promise.all([
      count('sessions'),
      count('sessions', { status: 'completed' }),
      count('frames', { is_active: 'true' })
    ])

    const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
    const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
    const monthAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()

    const sumPrice = async (gte: string) => {
      const { data } = await supabase
        .from('sessions')
        .select('price')
        .eq('booth_id', boothId!)
        .eq('status', 'completed')
        .gte('started_at', gte)
      return (data || []).reduce((a: number, r: any) => a + (r.price || 0), 0)
    }

    const [today, week, month] = await Promise.all([sumPrice(dayAgo), sumPrice(weekAgo), sumPrice(monthAgo)])

    const { data: booth } = await supabase
      .from('booths')
      .select('last_heartbeat, app_version, health')
      .eq('id', boothId!)
      .single()

    const online = !!booth?.last_heartbeat && (Date.now() - new Date(booth.last_heartbeat).getTime()) < 5 * 60 * 1000

    res.json({
      total_sessions: total,
      completed_sessions: completed,
      revenue_today: today,
      revenue_week: week,
      revenue_month: month,
      active_frames: activeFrames,
      print_success_rate: 100,
      booth_online: online,
      sync_pending: 0,
      last_heartbeat: booth?.last_heartbeat || null,
      app_version: booth?.app_version || null
    })
  } catch (err: any) {
    res.status(503).json({ error: err.message })
  }
})

adminRouter.get('/revenue', async (req, res) => {
  try {
    const supabase = getSupabase()
    const boothId = await getBoothId()

    let query = supabase
      .from('sessions')
      .select('price, started_at')
      .eq('booth_id', boothId!)
      .eq('status', 'completed')

    if (req.query.from) query = query.gte('started_at', req.query.from as string)
    if (req.query.to) query = query.lte('started_at', req.query.to as string)

    const { data, error } = await query
    if (error) return res.status(500).json({ error: error.message })

    const perDay = new Map<string, number>()
    for (const r of data || []) {
      const day = (r.started_at || '').slice(0, 10)
      perDay.set(day, (perDay.get(day) || 0) + (r.price || 0))
    }

    const periods = Array.from(perDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, value]) => ({ label, value }))

    res.json({
      periods,
      total: periods.reduce((a, p) => a + p.value, 0)
    })
  } catch (err: any) {
    res.status(503).json({ error: err.message })
  }
})

adminRouter.get('/logs', async (req, res) => {
  try {
    const supabase = getSupabase()
    let query = supabase
      .from('system_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)

    if (req.query.level && req.query.level !== 'all') {
      query = query.eq('level', req.query.level as string)
    }

    const { data, error } = await query
    if (error) return res.status(500).json({ error: error.message })
    res.json(data || [])
  } catch (err: any) {
    res.status(503).json({ error: err.message })
  }
})

adminRouter.get('/health', async (req, res) => {
  try {
    const supabase = getSupabase()
    const boothId = await getBoothId()

    const { data: booth } = await supabase
      .from('booths')
      .select('last_heartbeat, app_version, health')
      .eq('id', boothId!)
      .single()

    const online = !!booth?.last_heartbeat && (Date.now() - new Date(booth.last_heartbeat).getTime()) < 5 * 60 * 1000
    const health = booth?.health || {}

    res.json({
      booth_online: online,
      camera_status: health.camera_status || 'unknown',
      printer_status: health.printer_status || 'unknown',
      disk_free_gb: health.disk_free_gb || 0,
      outbox_pending: health.outbox_pending || 0,
      app_version: booth?.app_version || 'unknown',
      last_heartbeat: booth?.last_heartbeat || null,
      preflight: health.preflight || null
    })
  } catch (err: any) {
    res.status(503).json({ error: err.message })
  }
})

adminRouter.post('/commands', async (req, res) => {
  try {
    const supabase = getSupabase()
    const boothId = await getBoothId(req.body.booth_id)
    const { type, session_id, payload } = req.body

    if (!['test_print', 'retry_sync', 'reprint'].includes(type)) {
      return res.status(400).json({ error: 'type tidak valid' })
    }

    const { data, error } = await supabase
      .from('device_commands')
      .insert({ booth_id: boothId!, type, session_id: session_id || null, payload: payload || null })
      .select()
      .single()

    if (error) return res.status(500).json({ error: error.message })
    res.status(201).json(data)
  } catch (err: any) {
    res.status(503).json({ error: err.message })
  }
})

// ---- helpers ----

async function bumpConfigVersion(boothId: string) {
  const v = await nextConfigVersion(boothId)
  await getSupabase()
    .from('settings')
    .update({ config_version: v, updated_at: new Date().toISOString() })
    .eq('booth_id', boothId)
}

async function nextConfigVersion(boothId: string): Promise<number> {
  const { data } = await getSupabase()
    .from('settings')
    .select('config_version')
    .eq('booth_id', boothId)
    .single()
  return ((data?.config_version as number) || 0) + 1
}
