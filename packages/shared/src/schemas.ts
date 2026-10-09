import { z } from 'zod'

export const slotSchema = z.object({
  n: z.number().int().positive(),
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  w: z.number().int().positive(),
  h: z.number().int().positive()
})

export const textAreaSchema = z.object({
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  w: z.number().int().positive(),
  h: z.number().int().positive()
})

export const canvasSchema = z.object({
  w: z.number().int().positive(),
  h: z.number().int().positive()
})

export const layoutSchema = z.object({
  canvas: canvasSchema,
  slots: z.array(slotSchema).min(1),
  text_area: textAreaSchema.optional()
})

export const timersSchema = z.object({
  frame: z.number().int().positive().default(30),
  action: z.number().int().positive().default(120),
  preview: z.number().int().positive().default(45),
  qr: z.number().int().positive().default(15),
  closing: z.number().int().positive().default(5),
  reminder_sec: z.number().int().positive().default(15),
  max_retake: z.number().int().nonnegative().default(3),
  countdown: z.number().int().min(3).max(8).default(5)
})

export const cameraSchema = z.object({
  device_id: z.string().optional(),
  width: z.number().int().positive().default(1920),
  height: z.number().int().positive().default(1080),
  mirror_preview: z.boolean().default(true)
})

export const liveConfigSchema = z.object({
  clip_sec: z.number().int().min(3).max(10).default(5),
  codec: z.enum(['h265', 'h264']).default('h265'),
  preview_h264: z.boolean().default(true)
})

export const gifConfigSchema = z.object({
  frame_duration_ms: z.number().int().positive().default(800),
  max_width: z.number().int().positive().default(1080)
})

export const preflightSchema = z.object({
  min_disk_gb: z.number().positive().default(5),
  max_outbox_age_hours: z.number().int().positive().default(24),
  fallback_digital_on_printer_fail: z.boolean().default(true)
})

export const settingsSchema = z.object({
  booth_id: z.string().uuid(),
  config_version: z.number().int().nonnegative(),
  output_mode: z.enum(['photo_only', 'full']),
  print_mode: z.enum(['digital_only', 'local', 'custom_api']),
  printer_name: z.string().optional(),
  copies: z.number().int().positive().default(1),
  media_capacity: z.number().int().nonnegative().optional(),
  media_warn_at: z.number().int().nonnegative().default(10),
  custom_print_config: z.record(z.any()).optional(),
  base_price: z.number().int().nonnegative().default(0),
  retention_days: z.number().int().positive().default(30),
  timers: timersSchema,
  camera: cameraSchema,
  gif_config: gifConfigSchema.optional(),
  live_config: liveConfigSchema.optional(),
  preflight: preflightSchema,
  updated_at: z.string().datetime()
})

export const frameSchema = z.object({
  id: z.string().uuid(),
  booth_id: z.string().uuid(),
  name: z.string().min(1).max(100),
  source_key: z.string(),
  keyed_key: z.string(),
  orientation: z.enum(['portrait', 'landscape']),
  canvas_w: z.number().int().positive(),
  canvas_h: z.number().int().positive(),
  layout: layoutSchema,
  text_style: z.record(z.any()).optional(),
  extra_price: z.number().int().nonnegative().default(0),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().nonnegative().default(0),
  created_at: z.string().datetime()
})

export const sessionSchema = z.object({
  id: z.string().uuid(),
  public_code: z.string().length(12),
  booth_id: z.string().uuid(),
  frame_id: z.string().uuid(),
  config_version: z.number().int().nonnegative(),
  status: z.enum(['created', 'frame_selected', 'capturing', 'previewing', 'processing', 'completed', 'abandoned', 'failed']),
  sync_status: z.enum(['pending', 'syncing', 'synced', 'failed']),
  frame_selected_by: z.enum(['user', 'timeout']).optional(),
  custom_text: z.string().max(30).optional(),
  price: z.number().int().nonnegative(),
  started_at: z.string().datetime(),
  completed_at: z.string().datetime().optional(),
  expires_at: z.string().datetime().optional(),
  synced_at: z.string().datetime().optional()
})

export const photoSchema = z.object({
  id: z.string().uuid(),
  session_id: z.string().uuid(),
  slot_index: z.number().int().nonnegative(),
  retake_count: z.number().int().nonnegative().default(0),
  s3_key: z.string().optional(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  created_at: z.string().datetime()
})

export const clipSchema = z.object({
  id: z.string().uuid(),
  session_id: z.string().uuid(),
  slot_index: z.number().int().nonnegative(),
  s3_key: z.string().optional(),
  duration_ms: z.number().int().positive()
})

export const outputSchema = z.object({
  id: z.string().uuid(),
  session_id: z.string().uuid(),
  type: z.enum(['strip', 'gif', 'live_h265', 'live_h264', 'zip']),
  s3_key: z.string(),
  status: z.enum(['pending', 'rendering', 'done', 'failed']),
  created_at: z.string().datetime()
})

export const printJobSchema = z.object({
  id: z.string().uuid(),
  session_id: z.string().uuid(),
  status: z.enum(['queued', 'sent', 'printing', 'done', 'failed']),
  attempts: z.number().int().nonnegative().default(0),
  error_message: z.string().optional(),
  printer_name: z.string(),
  copies: z.number().int().positive().default(1),
  created_at: z.string().datetime(),
  finished_at: z.string().datetime().optional()
})

export const deviceCommandSchema = z.object({
  id: z.string().uuid(),
  booth_id: z.string().uuid(),
  type: z.enum(['test_print', 'retry_sync', 'reprint']),
  payload: z.record(z.any()).optional(),
  status: z.enum(['pending', 'done', 'failed']),
  created_at: z.string().datetime(),
  done_at: z.string().datetime().optional()
})

export const createSessionInputSchema = z.object({
  frame_id: z.string().uuid().optional()
})

export const selectFrameInputSchema = z.object({
  frame_id: z.string().uuid(),
  selected_by: z.enum(['user', 'timeout'])
})

export const saveTextInputSchema = z.object({
  custom_text: z.string().max(30)
})

export const savePhotoInputSchema = z.object({
  slot_index: z.number().int().nonnegative(),
  photo_data: z.string(),
  clip_data: z.string().optional()
})

export const finalizeSessionInputSchema = z.object({
  print: z.boolean().default(false)
})

export type Layout = z.infer<typeof layoutSchema>
export type Slot = z.infer<typeof slotSchema>
export type TextArea = z.infer<typeof textAreaSchema>
export type Timers = z.infer<typeof timersSchema>
export type Camera = z.infer<typeof cameraSchema>
export type LiveConfig = z.infer<typeof liveConfigSchema>
export type GifConfig = z.infer<typeof gifConfigSchema>
export type Preflight = z.infer<typeof preflightSchema>
export type Settings = z.infer<typeof settingsSchema>
export type Frame = z.infer<typeof frameSchema>
export type Session = z.infer<typeof sessionSchema>
export type Photo = z.infer<typeof photoSchema>
export type Clip = z.infer<typeof clipSchema>
export type Output = z.infer<typeof outputSchema>
export type PrintJob = z.infer<typeof printJobSchema>
export type DeviceCommand = z.infer<typeof deviceCommandSchema>
