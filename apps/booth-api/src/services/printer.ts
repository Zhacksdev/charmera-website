import { execFile } from 'child_process'
import { promisify } from 'util'
import { join, basename } from 'path'
import { mkdir, writeFile, unlink } from 'fs/promises'
import sharp from 'sharp'
import { PDFDocument } from 'pdf-lib'
import { z } from 'zod'
import { db } from '../db/index.js'
import { logger } from './logger.js'

const execFileAsync = promisify(execFile)

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data')
const PRINT_DIR = join(DATA_DIR, 'print')

// Output render 1200x1800 px = 4x6 inci pada 300 DPI. PDF dibuat dengan ukuran fisik
// ini supaya mode "ukuran asli" mencetak tepat 4R di printer apa pun.
const PRINT_DPI = 300

// Pengaturan printer lokal disimpan terpisah dari 'settings' agar tidak ditimpa
// config puller: printer fisik adalah fakta laptop booth, bukan config cloud.
const LOCAL_KEY = 'printer_local'

export type PrintScale = 'noscale' | 'fit' | 'shrink'

export interface PrinterSettings {
  print_mode: 'digital_only' | 'local'
  /** '' = printer default OS */
  printer_name: string
  copies: number
  /** noscale = ukuran asli 4x6, fit = sesuaikan kertas, shrink = perkecil bila tidak muat */
  print_scale: PrintScale
  /** '' = ukuran kertas default driver; selain itu nama kertas, mis. "A4", "A6", "4x6" */
  paper_size: string
}

export interface PrinterInfo {
  name: string
  isDefault: boolean
  online: boolean
  status: string
}

export interface PrinterHealth {
  status: 'ok' | 'warning' | 'error'
  message: string
  printer?: string
}

export const printerSettingsSchema = z.object({
  print_mode: z.enum(['digital_only', 'local']),
  printer_name: z.string().trim().max(200),
  copies: z.number().int().min(1).max(10),
  print_scale: z.enum(['noscale', 'fit', 'shrink']),
  paper_size: z.string().trim().max(50)
})

function readCacheJson(key: string): Record<string, any> | null {
  const row = db.prepare(`SELECT value FROM config_cache WHERE key = ?`).get(key) as { value: string } | undefined
  if (!row) return null
  try {
    return JSON.parse(row.value)
  } catch {
    return null
  }
}

export function getLocalPrinterOverride(): Partial<PrinterSettings> | null {
  return readCacheJson(LOCAL_KEY)
}

export function getPrinterSettings(): PrinterSettings {
  const raw: Record<string, any> = { ...(readCacheJson('settings') || {}), ...(getLocalPrinterOverride() || {}) }
  const name = typeof raw.printer_name === 'string' && raw.printer_name !== 'default' ? raw.printer_name.trim() : ''
  const copies = Number.isInteger(raw.copies) ? Math.min(Math.max(raw.copies, 1), 10) : 1

  return {
    print_mode: raw.print_mode === 'local' ? 'local' : 'digital_only',
    printer_name: name,
    copies,
    print_scale: ['noscale', 'fit', 'shrink'].includes(raw.print_scale) ? raw.print_scale : 'noscale',
    paper_size: typeof raw.paper_size === 'string' ? raw.paper_size.trim() : ''
  }
}

export function savePrinterSettings(input: unknown): PrinterSettings {
  const settings = printerSettingsSchema.parse(input)
  db.prepare(`
    INSERT OR REPLACE INTO config_cache (key, value, version, fetched_at)
    VALUES (?, ?, 0, ?)
  `).run(LOCAL_KEY, JSON.stringify(settings), new Date().toISOString())
  printerListCache = null
  logger.info({ settings }, 'Printer settings saved')
  return getPrinterSettings()
}

// ---------- Daftar & status printer OS ----------

const WIN_PRINTER_STATUS: Record<number, string> = {
  3: 'Siap',
  4: 'Sedang mencetak',
  5: 'Pemanasan',
  6: 'Berhenti mencetak',
  7: 'Offline'
}

async function listPrintersWindows(): Promise<PrinterInfo[]> {
  const script = 'Get-CimInstance Win32_Printer | Select-Object Name,Default,WorkOffline,PrinterStatus | ConvertTo-Json -Compress'
  const { stdout } = await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    { timeout: 15000, windowsHide: true }
  )
  if (!stdout.trim()) return []

  const parsed = JSON.parse(stdout)
  const rows: any[] = Array.isArray(parsed) ? parsed : [parsed]

  return rows.map((p) => {
    const offline = p.WorkOffline === true || p.PrinterStatus === 7
    return {
      name: String(p.Name),
      isDefault: p.Default === true,
      online: !offline,
      status: offline ? 'Offline' : WIN_PRINTER_STATUS[p.PrinterStatus] || 'Status tidak diketahui'
    }
  })
}

async function listPrintersCups(): Promise<PrinterInfo[]> {
  // lpstat keluar dengan kode != 0 bila tidak ada printer/default — tangkap output-nya saja
  const run = async (args: string[]) => {
    try {
      return (await execFileAsync('lpstat', args, { timeout: 10000 })).stdout
    } catch (err: any) {
      return String(err?.stdout || '')
    }
  }

  const [printersOut, defaultOut] = await Promise.all([run(['-p']), run(['-d'])])
  const defaultName = defaultOut.match(/default destination:\s*(\S+)/)?.[1]

  return printersOut
    .split('\n')
    .map((line) => line.match(/^printer\s+(\S+)\s+(.*)$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map(([, name, rest]) => {
      const offline = /disabled/i.test(rest)
      return {
        name,
        isDefault: name === defaultName,
        online: !offline,
        status: offline ? 'Nonaktif' : /printing/i.test(rest) ? 'Sedang mencetak' : 'Siap'
      }
    })
}

// Cache singkat: /api/status dipoll kiosk tiap beberapa detik, PowerShell ~1 dtk per panggilan
let printerListCache: { at: number; printers: PrinterInfo[] } | null = null
const PRINTER_LIST_TTL_MS = 10000

export async function listPrinters(force = false): Promise<PrinterInfo[]> {
  if (!force && printerListCache && Date.now() - printerListCache.at < PRINTER_LIST_TTL_MS) {
    return printerListCache.printers
  }
  const printers = process.platform === 'win32' ? await listPrintersWindows() : await listPrintersCups()
  printerListCache = { at: Date.now(), printers }
  return printers
}

export async function getPrinterHealth(settings = getPrinterSettings()): Promise<PrinterHealth> {
  if (settings.print_mode !== 'local') {
    return { status: 'ok', message: 'Mode digital (tanpa cetak)' }
  }

  let printers: PrinterInfo[]
  try {
    printers = await listPrinters()
  } catch (err) {
    logger.warn({ err }, 'Failed to list printers')
    return { status: 'warning', message: 'Daftar printer tidak bisa dibaca dari OS' }
  }

  if (printers.length === 0) {
    return { status: 'error', message: 'Tidak ada printer terpasang di laptop' }
  }

  const target = settings.printer_name
    ? printers.find((p) => p.name === settings.printer_name)
    : printers.find((p) => p.isDefault)

  if (!target) {
    return settings.printer_name
      ? { status: 'error', message: `Printer "${settings.printer_name}" tidak ditemukan` }
      : { status: 'error', message: 'Belum ada printer default di OS — pilih printer di panel operator' }
  }

  if (!target.online) {
    return { status: 'warning', message: `Printer ${target.name}: ${target.status}`, printer: target.name }
  }

  return { status: 'ok', message: `Printer siap: ${target.name}`, printer: target.name }
}

// ---------- Cetak ----------

/** Bungkus gambar ke PDF satu halaman dengan ukuran fisik sesuai PRINT_DPI. Landscape diputar ke portrait. */
async function buildPrintPdf(imagePath: string): Promise<string> {
  const meta = await sharp(imagePath).metadata()
  let pipeline = sharp(imagePath)
  if ((meta.width || 0) > (meta.height || 0)) {
    pipeline = pipeline.rotate(90)
  }
  const { data, info } = await pipeline.jpeg({ quality: 95 }).toBuffer({ resolveWithObject: true })

  const pdf = await PDFDocument.create()
  const widthPt = (info.width / PRINT_DPI) * 72
  const heightPt = (info.height / PRINT_DPI) * 72
  const page = pdf.addPage([widthPt, heightPt])
  const image = await pdf.embedJpg(data)
  page.drawImage(image, { x: 0, y: 0, width: widthPt, height: heightPt })

  await mkdir(PRINT_DIR, { recursive: true })
  const pdfPath = join(PRINT_DIR, `${basename(imagePath).replace(/\.[^.]+$/, '')}_${Date.now()}.pdf`)
  await writeFile(pdfPath, await pdf.save())
  return pdfPath
}

const CUPS_SCALE: Record<PrintScale, string> = {
  noscale: 'none',
  fit: 'fit',
  shrink: 'auto-fit'
}

async function sendPdfToPrinter(pdfPath: string, settings: PrinterSettings, copies: number): Promise<void> {
  if (process.platform === 'win32') {
    // pdf-to-printer membawa SumatraPDF: cetak senyap tanpa dialog
    const { print } = await import('pdf-to-printer')
    await print(pdfPath, {
      printer: settings.printer_name || undefined,
      copies,
      scale: settings.print_scale,
      paperSize: settings.paper_size || undefined,
      orientation: 'portrait',
      silent: true
    })
    return
  }

  const args = ['-n', String(copies), '-o', `print-scaling=${CUPS_SCALE[settings.print_scale]}`]
  if (settings.printer_name) args.push('-d', settings.printer_name)
  if (settings.paper_size) args.push('-o', `media=${settings.paper_size}`)
  args.push(pdfPath)
  await execFileAsync('lp', args, { timeout: 30000 })
}

export async function printImage(imagePath: string, copies: number, settings = getPrinterSettings()): Promise<void> {
  // printer hilang/tidak ada default: gagal dengan pesan yang bisa dibaca operator,
  // bukan output mentah SumatraPDF/lp. Offline tetap dikirim — spooler OS menahannya.
  // cek sebagai mode lokal: Test Print boleh dijalankan sebelum mode cetak diaktifkan
  const health = await getPrinterHealth({ ...settings, print_mode: 'local' })
  if (health.status === 'error') {
    throw new Error(health.message)
  }

  const pdfPath = await buildPrintPdf(imagePath)
  try {
    await sendPdfToPrinter(pdfPath, settings, copies)
  } catch (err: any) {
    logger.error({ err, printer: settings.printer_name || '(default)' }, 'Printer command failed')
    throw new Error(`Printer ${health.printer || ''} menolak job — cek driver, kertas, dan kabel`.replace('  ', ' '))
  } finally {
    await unlink(pdfPath).catch(() => {})
  }
}

/** Halaman uji 4x6: garis tepi + margin 5 mm untuk mengecek potongan dan skala printer. */
export async function createTestPrintImage(): Promise<string> {
  const w = 1200
  const h = 1800
  const mm5 = Math.round((5 / 25.4) * PRINT_DPI)
  const svg = Buffer.from(`<svg width='${w}' height='${h}' xmlns='http://www.w3.org/2000/svg'>
    <rect width='${w}' height='${h}' fill='#FFFFFF'/>
    <rect x='6' y='6' width='${w - 12}' height='${h - 12}' fill='none' stroke='#D62839' stroke-width='12'/>
    <rect x='${mm5}' y='${mm5}' width='${w - mm5 * 2}' height='${h - mm5 * 2}' fill='none' stroke='#26211F' stroke-width='4' stroke-dasharray='24 16'/>
    <line x1='${w / 2}' y1='${h / 2 - 80}' x2='${w / 2}' y2='${h / 2 + 80}' stroke='#26211F' stroke-width='4'/>
    <line x1='${w / 2 - 80}' y1='${h / 2}' x2='${w / 2 + 80}' y2='${h / 2}' stroke='#26211F' stroke-width='4'/>
    <text x='600' y='420' font-family='Georgia' font-size='96' font-style='italic' fill='#D62839' text-anchor='middle'>chamera</text>
    <text x='600' y='520' font-family='Arial' font-size='48' fill='#26211F' text-anchor='middle'>Test Print 4 x 6 inci (10 x 15 cm)</text>
    <text x='600' y='1260' font-family='Arial' font-size='34' fill='#26211F' text-anchor='middle'>Garis merah = tepi foto. Garis putus-putus = 5 mm dari tepi.</text>
    <text x='600' y='1320' font-family='Arial' font-size='34' fill='#26211F' text-anchor='middle'>Tepi terpotong? Pakai skala "Sesuaikan kertas".</text>
    <text x='600' y='1380' font-family='Arial' font-size='34' fill='#26211F' text-anchor='middle'>Hasil kecil di kertas besar? Itu normal untuk "Ukuran asli".</text>
  </svg>`)

  await mkdir(PRINT_DIR, { recursive: true })
  const path = join(PRINT_DIR, 'test_print.jpg')
  await sharp(svg).withMetadata({ density: PRINT_DPI }).jpeg({ quality: 95 }).toFile(path)
  return path
}
