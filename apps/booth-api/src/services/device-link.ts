import { statfs } from 'fs/promises'
import { join } from 'path'
import { db } from '../db/index.js'
import { logger } from './logger.js'
import { getConfig } from './config.js'
import { getPrinterHealth } from './printer.js'
import { testPrint, queueReprint } from './print-worker.js'
import { retryFailedOutbox } from './sync-worker.js'

// Heartbeat (status booth untuk halaman Kesehatan admin) dan eksekusi perintah dashboard
// (Test Print, Retry Sync, Cetak Ulang). Hanya aktif bila DEVICE_API_URL diset.

const DEVICE_API_URL = process.env.DEVICE_API_URL || ''
const DEVICE_KEY = process.env.DEVICE_KEY || ''
const APP_VERSION = require('../../package.json').version as string

const HEARTBEAT_INTERVAL_MS = 60000
// perintah dashboard (Reprint, Test Print) terasa langsung tanpa membebani cloud
const COMMAND_POLL_INTERVAL_MS = 10000

function deviceFetch(path: string, init: RequestInit = {}) {
  return fetch(`${DEVICE_API_URL}/api/device${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DEVICE_KEY}`,
      ...(init.headers || {})
    },
    signal: AbortSignal.timeout(15000)
  })
}

async function diskFreeGb(): Promise<number | null> {
  try {
    const stats = await statfs(process.env.DATA_DIR || join(process.cwd(), 'data'))
    return Math.round(((stats.bavail * stats.bsize) / 1024 ** 3) * 10) / 10
  } catch {
    return null
  }
}

export async function sendHeartbeat(): Promise<void> {
  try {
    const [printer, disk] = await Promise.all([getPrinterHealth(), diskFreeGb()])
    const outbox = db.prepare(`SELECT COUNT(*) AS n FROM outbox WHERE status IN ('pending', 'syncing', 'failed')`).get() as { n: number }
    const settings = getConfig() as any

    const diskStatus = disk === null ? 'warning' : disk < 5 ? 'error' : disk < 10 ? 'warning' : 'ok'

    const res = await deviceFetch('/heartbeat', {
      method: 'POST',
      body: JSON.stringify({
        app_version: APP_VERSION,
        health: {
          // kamera ada di tablet/browser — booth-api tidak bisa memeriksanya
          camera_status: 'unknown',
          printer_status: printer.status,
          disk_free_gb: disk ?? 0,
          outbox_pending: outbox.n,
          media_remaining: settings?.media_remaining ?? null,
          preflight: {
            disk: { status: diskStatus, message: disk === null ? 'Tidak terbaca' : `${disk} GB kosong` },
            printer: { status: printer.status, message: printer.message }
          }
        }
      })
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
  } catch (err: any) {
    logger.warn({ err: err?.message }, 'Heartbeat failed')
  }
}

async function runCommand(cmd: { id: string; type: string; session_id?: string | null }): Promise<void> {
  if (cmd.type === 'test_print') {
    const result = await testPrint()
    if (!result.ok) throw new Error(result.error || 'Test print gagal')
    return
  }

  if (cmd.type === 'retry_sync') {
    retryFailedOutbox()
    return
  }

  if (cmd.type === 'reprint') {
    if (!cmd.session_id) throw new Error('session_id kosong')
    // sesi yang belum pernah dicetak dibuatkan job baru; pesan error tampil di dashboard
    queueReprint(cmd.session_id)
    return
  }

  throw new Error(`Perintah tidak dikenal: ${cmd.type}`)
}

export async function pollCommands(): Promise<void> {
  let commands: Array<{ id: string; type: string; session_id?: string | null }>
  try {
    const res = await deviceFetch('/commands')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    commands = (await res.json()) as typeof commands
  } catch (err: any) {
    logger.warn({ err: err?.message }, 'Command poll failed')
    return
  }

  for (const cmd of commands) {
    let status: 'done' | 'failed' = 'done'
    let errorMessage: string | null = null
    try {
      await runCommand(cmd)
      logger.info({ command_id: cmd.id, type: cmd.type }, 'Device command executed')
    } catch (err: any) {
      status = 'failed'
      errorMessage = err?.message || 'Gagal'
      logger.warn({ command_id: cmd.id, type: cmd.type, err: errorMessage }, 'Device command failed')
    }

    try {
      await deviceFetch(`/commands/${cmd.id}/result`, {
        method: 'POST',
        body: JSON.stringify({ status, error_message: errorMessage })
      })
    } catch (err: any) {
      // hasil tidak terkirim: perintah tetap 'pending' di cloud dan akan dijalankan ulang
      logger.warn({ command_id: cmd.id, err: err?.message }, 'Command result not reported')
    }
  }
}

export function startDeviceLink(): void {
  if (!DEVICE_API_URL) return

  void sendHeartbeat()
  setInterval(() => void sendHeartbeat(), HEARTBEAT_INTERVAL_MS)
  setInterval(() => void pollCommands(), COMMAND_POLL_INTERVAL_MS)
  logger.info('Device link started (heartbeat + perintah dashboard)')
}
