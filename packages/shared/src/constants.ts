export const SESSION_STATUS = {
  CREATED: 'created',
  FRAME_SELECTED: 'frame_selected',
  CAPTURING: 'capturing',
  PREVIEWING: 'previewing',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  ABANDONED: 'abandoned',
  FAILED: 'failed'
} as const

export const SYNC_STATUS = {
  PENDING: 'pending',
  SYNCING: 'syncing',
  SYNCED: 'synced',
  FAILED: 'failed'
} as const

export const OUTPUT_TYPE = {
  STRIP: 'strip',
  GIF: 'gif',
  LIVE_H265: 'live_h265',
  LIVE_H264: 'live_h264',
  ZIP: 'zip'
} as const

export const PRINT_MODE = {
  DIGITAL_ONLY: 'digital_only',
  LOCAL: 'local',
  CUSTOM_API: 'custom_api'
} as const

export const OUTPUT_MODE = {
  PHOTO_ONLY: 'photo_only',
  FULL: 'full'
} as const

export const PRINT_JOB_STATUS = {
  QUEUED: 'queued',
  SENT: 'sent',
  PRINTING: 'printing',
  DONE: 'done',
  FAILED: 'failed'
} as const

export const DEVICE_COMMAND_STATUS = {
  PENDING: 'pending',
  DONE: 'done',
  FAILED: 'failed'
} as const

export const FRAME_ORIENTATION = {
  PORTRAIT: 'portrait',
  LANDSCAPE: 'landscape'
} as const

export type SessionStatus = typeof SESSION_STATUS[keyof typeof SESSION_STATUS]
export type SyncStatus = typeof SYNC_STATUS[keyof typeof SYNC_STATUS]
export type OutputType = typeof OUTPUT_TYPE[keyof typeof OUTPUT_TYPE]
export type PrintMode = typeof PRINT_MODE[keyof typeof PRINT_MODE]
export type OutputMode = typeof OUTPUT_MODE[keyof typeof OUTPUT_MODE]
export type PrintJobStatus = typeof PRINT_JOB_STATUS[keyof typeof PRINT_JOB_STATUS]
export type DeviceCommandStatus = typeof DEVICE_COMMAND_STATUS[keyof typeof DEVICE_COMMAND_STATUS]
export type FrameOrientation = typeof FRAME_ORIENTATION[keyof typeof FRAME_ORIENTATION]
