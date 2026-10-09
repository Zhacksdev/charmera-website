import { spawn } from 'child_process'
import { join } from 'path'
import { readFile, mkdir, unlink } from 'fs/promises'
import { existsSync } from 'fs'
import { db } from '../db/index.js'
import { logger } from './logger.js'
import { getConfig } from './config.js'

const FFMPEG_PATH = process.env.FFMPEG_PATH || 'ffmpeg'

export interface PrintJob {
  id: string
  sessionId: string
  status: 'queued' | 'sent' | 'printing' | 'done' | 'failed'
  attempts: number
  error?: string
  printerName: string
  copies: number
  outputPath?: string
}

export async function printStrip(
  stripPath: string,
  printerName: string,
  copies: number = 1
): Promise<void> {
  const platform = process.platform
  
  if (platform === 'win32') {
    const pdfToPrinter = require('pdf-to-printer')
    await pdfToPrinter.print(stripPath, {
      printer: printerName,
      copies
    })
  } else {
    await new Promise<void>((resolve, reject) => {
      const lp = spawn('lp', [
        '-d', printerName,
        '-n', copies.toString(),
        '-o', 'media=4x6in',
        '-o', 'fit-to-page=false',
        stripPath
      ])
      
      lp.on('close', (code) => {
        if (code === 0) resolve()
        else reject(new Error(`Print failed with code ${code}`))
      })
    })
  }
}

export async function rotateForPrint(stripPath: string): Promise<string> {
  const sharp = require('sharp')
  const image = sharp(await readFile(stripPath))
  const metadata = await image.metadata()
  
  if (metadata.width > metadata.height) {
    const rotated = await image
      .rotate(90)
      .jpeg({ quality: 95 })
      .toBuffer()
    
    const rotatedPath = stripPath.replace('.jpg', '_rotated.jpg')
    const { writeFile } = require('fs/promises')
    await writeFile(rotatedPath, rotated)
    
    return rotatedPath
  }
  
  return stripPath
}

export async function processPrintJobs() {
  const pendingJobs = db.prepare(`
    SELECT * FROM print_jobs 
    WHERE status IN ('queued', 'sent') 
    AND attempts < 3
    ORDER BY created_at ASC 
    LIMIT 1
  `).all() as any[]
  
  for (const job of pendingJobs) {
    try {
      db.prepare(`
        UPDATE print_jobs SET status = 'printing' WHERE id = ?
      `).run(job.id)
      
      const output = db.prepare(`
        SELECT path FROM outputs WHERE session_id = ? AND type = 'strip'
      `).get(job.session_id) as any
      
      if (!output) {
        throw new Error('Strip output not found')
      }
      
      let printPath = output.path
      
      const session = db.prepare(`
        SELECT frame_id FROM sessions WHERE id = ?
      `).get(job.session_id) as any
      
      if (session?.frame_id) {
        const frames = db.prepare(`
          SELECT value FROM config_cache WHERE key = 'frames'
        `).get() as any
        
        if (frames) {
          const framesList = JSON.parse(frames.value)
          const frame = framesList.find((f: any) => f.id === session.frame_id)
          
          if (frame?.orientation === 'landscape') {
            printPath = await rotateForPrint(output.path)
          }
        }
      }
      
      await printStrip(printPath, job.printer_name, job.copies)
      
      db.prepare(`
        UPDATE print_jobs 
        SET status = 'done', finished_at = ?
        WHERE id = ?
      `).run(new Date().toISOString(), job.id)
      
      const config = getConfig()
      if (config?.media_capacity) {
        db.prepare(`
          UPDATE config_cache 
          SET value = json_set(value, '$.media_remaining', json_extract(value, '$.media_remaining') - 1)
          WHERE key = 'settings'
        `).run()
      }
      
      logger.info({ job_id: job.id, session_id: job.session_id }, 'Print job completed')
      
    } catch (err: any) {
      logger.error({ err, job_id: job.id }, 'Print job failed')
      
      const attempts = job.attempts + 1
      
      db.prepare(`
        UPDATE print_jobs 
        SET status = ?, attempts = ?, error_message = ?
        WHERE id = ?
      `).run(attempts >= 3 ? 'failed' : 'queued', attempts, err.message, job.id)
    }
  }
}

export function startPrintWorker() {
  setInterval(processPrintJobs, 3000)
  logger.info('Print worker started')
}

export async function testPrint(printerName: string): Promise<boolean> {
  try {
    const testImagePath = join(process.cwd(), 'data', 'test_print.jpg')
    
    if (!existsSync(testImagePath)) {
      const sharp = require('sharp')
      const testImage = await sharp({
        create: {
          width: 1200,
          height: 1800,
          channels: 3,
          background: '#FFFFFF'
        }
      })
      .jpeg({ quality: 95 })
      .toBuffer()
      
      await mkdir(join(process.cwd(), 'data'), { recursive: true })
      const { writeFile } = require('fs/promises')
      await writeFile(testImagePath, testImage)
    }
    
    await printStrip(testImagePath, printerName, 1)
    
    logger.info({ printer: printerName }, 'Test print successful')
    return true
    
  } catch (err) {
    logger.error({ err, printer: printerName }, 'Test print failed')
    return false
  }
}
