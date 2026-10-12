import { spawn } from 'child_process'

const FFMPEG_PATH = process.env.FFMPEG_PATH || 'ffmpeg'

/**
 * Jalankan ffmpeg dan tunggu selesai. Binary hilang (ENOENT) atau exit != 0 menjadi
 * rejected promise — tanpa listener 'error', ENOENT akan mematikan seluruh booth-api.
 */
export function runFfmpeg(args: string[], label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG_PATH, args, { windowsHide: true })
    let stderrTail = ''

    proc.stderr?.on('data', (chunk: Buffer) => {
      stderrTail = (stderrTail + chunk.toString()).slice(-600)
    })

    proc.on('error', (err: NodeJS.ErrnoException) => {
      reject(new Error(err.code === 'ENOENT'
        ? `${label}: ffmpeg tidak ditemukan (${FFMPEG_PATH}) — install ffmpeg atau set FFMPEG_PATH`
        : `${label}: ${err.message}`))
    })

    proc.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${label} failed with code ${code}: ${stderrTail.trim().split('\n').pop() || ''}`))
    })
  })
}

/** true bila ffmpeg bisa dijalankan (dipakai status/preflight untuk mode full). */
export async function isFfmpegAvailable(): Promise<boolean> {
  try {
    await runFfmpeg(['-version'], 'ffmpeg check')
    return true
  } catch {
    return false
  }
}
