import { Router } from 'express'
import { getSupabase } from '../lib/supabase.js'
import { isS3Configured, presignPut } from '../lib/s3.js'

export const deviceRouter = Router()

const CONTENT_TYPES: Record<string, string> = {
  strip: 'image/jpeg',
  gif: 'image/gif',
  live_h264: 'video/mp4',
  live_h265: 'video/mp4'
}

function filenameFor(type: string): string {
  switch (type) {
    case 'strip': return 'strip.jpg'
    case 'gif': return 'anim.gif'
    default: return `${type}.mp4`
  }
}

// GET config: settings + frame aktif (keyed_url = presigned GET 1 jam)
deviceRouter.get('/config', async (req, res) => {
  try {
    const supabase = getSupabase()
    const boothId = (req as any).booth.id as string

    const { data: settings, error: sErr } = await supabase
      .from('settings')
      .select('*')
      .eq('booth_id', boothId)
      .single()

    if (sErr || !settings) {
      return res.status(404).json({ error: 'Settings not found — buat row settings untuk booth ini' })
    }

    const { data: frames, error: fErr } = await supabase
      .from('frames')
      .select('id, name, orientation, canvas_w, canvas_h, layout, extra_price, keyed_key')
      .eq('booth_id', boothId)
      .eq('is_active', true)
      .order('sort_order')

    if (fErr) {
      return res.status(500).json({ error: fErr.message })
    }

    const withUrls = await Promise.all((frames || []).map(async (f: any) => {
      let keyed_url: string | null = null
      if (f.keyed_key && isS3Configured()) {
        try {
          keyed_url = await import('../lib/s3.js').then(m => m.presignGet(f.keyed_key))
        } catch {
          keyed_url = null
        }
      }
      return { ...f, keyed_url }
    }))

    res.json({
      config_version: settings.config_version,
      output_mode: settings.output_mode,
      print_mode: settings.print_mode,
      printer_name: settings.printer_name,
      copies: settings.copies,
      media_capacity: settings.media_capacity,
      media_warn_at: settings.media_warn_at,
      base_price: settings.base_price,
      timers: settings.timers,
      camera: settings.camera,
      live_config: settings.live_config,
      gif_config: settings.gif_config,
      preflight: settings.preflight,
      frames: withUrls
    })
  } catch (err: any) {
    res.status(503).json({ error: err.message })
  }
})

// POST upsert sesi
deviceRouter.post('/sessions', async (req, res) => {
  try {
    const supabase = getSupabase()
    const boothId = (req as any).booth.id as string
    const s = req.body

    if (!s?.id || !s?.public_code) {
      return res.status(400).json({ error: 'id dan public_code wajib' })
    }

    const { error } = await supabase
      .from('sessions')
      .upsert({
        id: s.id,
        public_code: s.public_code,
        booth_id: s.booth_id || boothId,
        frame_id: s.frame_id,
        config_version: s.config_version,
        status: s.status,
        sync_status: 'synced',
        frame_selected_by: s.frame_selected_by,
        custom_text: s.custom_text,
        price: s.price,
        started_at: s.started_at,
        completed_at: s.completed_at,
        synced_at: new Date().toISOString()
      })

    if (error) {
      return res.status(500).json({ error: error.message })
    }

    res.json({ status: 'synced' })
  } catch (err: any) {
    res.status(503).json({ error: err.message })
  }
})

// POST presigned PUT untuk upload output
deviceRouter.post('/uploads/presign', async (req, res) => {
  try {
    if (!isS3Configured()) {
      return res.status(503).json({ error: 'S3 belum dikonfigurasi di cloud-api' })
    }

    const boothId = (req as any).booth.id as string
    const { key, content_type } = req.body

    if (!key || typeof key !== 'string' || !key.startsWith(`sessions/`) || key.includes('..')) {
      return res.status(400).json({ error: 'Key tidak valid' })
    }

    const contentType = CONTENT_TYPES[req.body.type] || content_type || 'application/octet-stream'
    const uploadUrl = await presignPut(key, contentType)

    res.json({ upload_url: uploadUrl, key, expires_in: 900 })
  } catch (err: any) {
    res.status(503).json({ error: err.message })
  }
})

// POST complete: tandai sesi synced + catat outputs
deviceRouter.post('/sessions/:id/complete', async (req, res) => {
  try {
    const supabase = getSupabase()
    const { id } = req.params
    const outputs: Array<{ type: string; key: string }> = req.body?.outputs || []

    for (const o of outputs) {
      if (!o?.type || !o?.key) continue
      await supabase
        .from('outputs')
        .upsert({
          session_id: id,
          type: o.type,
          s3_key: o.key,
          status: 'done'
        }, { onConflict: 'session_id,type' })
    }

    const { error } = await supabase
      .from('sessions')
      .update({ status: 'completed', sync_status: 'synced', synced_at: new Date().toISOString() })
      .eq('id', id)

    if (error) {
      return res.status(500).json({ error: error.message })
    }

    res.json({ status: 'completed', outputs_recorded: outputs.length })
  } catch (err: any) {
    res.status(503).json({ error: err.message })
  }
})

// POST heartbeat
deviceRouter.post('/heartbeat', async (req, res) => {
  try {
    const supabase = getSupabase()
    const boothId = (req as any).booth.id as string
    const { app_version, health } = req.body || {}

    const { error } = await supabase
      .from('booths')
      .update({
        last_heartbeat: new Date().toISOString(),
        app_version: app_version || null,
        health: health || null
      })
      .eq('id', boothId)

    if (error) {
      return res.status(500).json({ error: error.message })
    }

    res.json({ received: true })
  } catch (err: any) {
    res.status(503).json({ error: err.message })
  }
})

// GET perintah pending untuk booth
deviceRouter.get('/commands', async (req, res) => {
  try {
    const supabase = getSupabase()
    const boothId = (req as any).booth.id as string

    const { data, error } = await supabase
      .from('device_commands')
      .select('*')
      .eq('booth_id', boothId)
      .eq('status', 'pending')
      .order('created_at')
      .limit(10)

    if (error) {
      return res.status(500).json({ error: error.message })
    }

    res.json(data || [])
  } catch (err: any) {
    res.status(503).json({ error: err.message })
  }
})

// POST hasil perintah
deviceRouter.post('/commands/:id/result', async (req, res) => {
  try {
    const supabase = getSupabase()
    const { id } = req.params
    const { status, error_message } = req.body || {}

    const { error } = await supabase
      .from('device_commands')
      .update({
        status: status === 'failed' ? 'failed' : 'done',
        error_message: error_message || null,
        done_at: new Date().toISOString()
      })
      .eq('id', id)

    if (error) {
      return res.status(500).json({ error: error.message })
    }

    res.json({ status: 'recorded' })
  } catch (err: any) {
    res.status(503).json({ error: err.message })
  }
})

// POST logs dari booth
deviceRouter.post('/logs', async (req, res) => {
  try {
    const supabase = getSupabase()
    const boothId = (req as any).booth.id as string
    const entries: any[] = Array.isArray(req.body) ? req.body : [req.body]

    if (entries.length === 0) {
      return res.json({ received: 0 })
    }

    const { error } = await supabase
      .from('system_logs')
      .insert(entries.slice(0, 50).map((e: any) => ({
        booth_id: e.booth_id || boothId,
        level: e.level || 'info',
        source: e.source || 'booth',
        event: e.event || 'log',
        message: e.message || '',
        meta: e.meta || null
      })))

    if (error) {
      return res.status(500).json({ error: error.message })
    }

    res.json({ received: entries.length })
  } catch (err: any) {
    res.status(503).json({ error: err.message })
  }
})
