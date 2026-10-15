import { execFile } from 'child_process'
import { promisify } from 'util'
import { join, basename } from 'path'
import { mkdir, writeFile, unlink } from 'fs/promises'
import { existsSync } from 'fs'
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
  /** penyesuaian bila hasil cetak terpotong/tidak center: skala tambahan (%) dan geser (mm, + = kanan/bawah) */
  scale_pct: number
  offset_x_mm: number
  offset_y_mm: number
}

/**
 * Ukuran kertas yang dikenal (mm, portrait). Bila paper_size salah satu dari ini, PDF dibuat seukuran
 * kertas dan foto ditempatkan oleh booth (bukan driver) â€” hasil cetak = preview.
 */
export const PAPER_SIZES_MM: Record<string, [number, number]> = {
  '4x6': [101.6, 152.4],
  '10x15': [100, 150],
  'a6': [105, 148],
  '5x7': [127, 177.8],
  'a5': [148, 210],
  'a4': [210, 297],
  'letter': [215.9, 279.4]
}

// nama kertas yang dikenali SumatraPDF (-print-settings paper=...); ukuran foto (4x6 dll.) tidak ada
// di daftarnya, jadi untuk kertas foto ukuran diambil dari default driver
const SUMATRA_PAPER: Record<string, string> = { a4: 'A4', a5: 'A5', a6: 'A6', letter: 'letter' }

function knownPaper(paperSize: string): [number, number] | null {
  return PAPER_SIZES_MM[paperSize.trim().toLowerCase()] || null
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
  paper_size: z.string().trim().max(50),
  scale_pct: z.number().int().min(50).max(150).default(100),
  offset_x_mm: z.number().min(-50).max(50).default(0),
  offset_y_mm: z.number().min(-50).max(50).default(0)
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
    paper_size: typeof raw.paper_size === 'string' ? raw.paper_size.trim() : '',
    scale_pct: clampNumber(raw.scale_pct, 50, 150, 100),
    offset_x_mm: clampNumber(raw.offset_x_mm, -50, 50, 0),
    offset_y_mm: clampNumber(raw.offset_y_mm, -50, 50, 0)
  }
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
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
  // lpstat keluar dengan kode != 0 bila tidak ada printer/default â€” tangkap output-nya saja
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
      : { status: 'error', message: 'Belum ada printer default di OS â€” pilih printer di panel operator' }
  }

  if (!target.online) {
    return { status: 'warning', message: `Printer ${target.name}: ${target.status}`, printer: target.name }
  }

  return { status: 'ok', message: `Printer siap: ${target.name}`, printer: target.name }
}

// ---------- Cetak ----------

export interface PrintLayout {
  /** ukuran halaman PDF (mm, portrait) */
  page_w_mm: number
  page_h_mm: number
  /** posisi & ukuran foto di halaman (mm, dari kiri-atas) */
  image_x_mm: number
  image_y_mm: number
  image_w_mm: number
  image_h_mm: number
  /** true = halaman = kertas yang dipilih, foto ditempatkan booth; false = halaman seukuran foto, driver yang menempatkan */
  paper_known: boolean
}

const MM_PER_INCH = 25.4

/** Foto siap cetak (landscape diputar ke portrait) + ukuran pikselnya */
async function printableImage(imagePath: string): Promise<{ data: Buffer; width: number; height: number }> {
  const meta = await sharp(imagePath).metadata()
  let pipeline = sharp(imagePath)
  if ((meta.width || 0) > (meta.height || 0)) {
    pipeline = pipeline.rotate(90)
  }
  const { data, info } = await pipeline.jpeg({ quality: 95 }).toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height }
}

/** Satu-satunya hitungan tata letak â€” dipakai PDF cetak dan gambar preview, jadi keduanya selalu sama. */
export function computePrintLayout(imageWpx: number, imageHpx: number, settings: PrinterSettings): PrintLayout {
  const naturalW = (imageWpx / PRINT_DPI) * MM_PER_INCH
  const naturalH = (imageHpx / PRINT_DPI) * MM_PER_INCH
  const paper = knownPaper(settings.paper_size)

  let pageW = naturalW
  let pageH = naturalH
  let base = 1
  if (paper) {
    ;[pageW, pageH] = paper
    const fit = Math.min(pageW / naturalW, pageH / naturalH)
    base = settings.print_scale === 'fit' ? fit : settings.print_scale === 'shrink' ? Math.min(1, fit) : 1
  }

  const scale = base * (settings.scale_pct / 100)
  const w = naturalW * scale
  const h = naturalH * scale
  return {
    page_w_mm: pageW,
    page_h_mm: pageH,
    image_x_mm: (pageW - w) / 2 + settings.offset_x_mm,
    image_y_mm: (pageH - h) / 2 + settings.offset_y_mm,
    image_w_mm: w,
    image_h_mm: h,
    paper_known: !!paper
  }
}

const mmToPt = (mm: number) => (mm / MM_PER_INCH) * 72

/** PDF satu halaman sesuai tata letak (kertas dikenal: seukuran kertas; selain itu seukuran foto). */
async function buildPrintPdf(imagePath: string, settings: PrinterSettings): Promise<string> {
  const { data, width, height } = await printableImage(imagePath)
  const layout = computePrintLayout(width, height, settings)

  const pdf = await PDFDocument.create()
  const page = pdf.addPage([mmToPt(layout.page_w_mm), mmToPt(layout.page_h_mm)])
  const image = await pdf.embedJpg(data)
  // PDF berkoordinat dari kiri-bawah
  page.drawImage(image, {
    x: mmToPt(layout.image_x_mm),
    y: mmToPt(layout.page_h_mm - layout.image_y_mm - layout.image_h_mm),
    width: mmToPt(layout.image_w_mm),
    height: mmToPt(layout.image_h_mm)
  })

  await mkdir(PRINT_DIR, { recursive: true })
  const pdfPath = join(PRINT_DIR, `${basename(imagePath).replace(/\.[^.]+$/, '')}_${Date.now()}.pdf`)
  await writeFile(pdfPath, await pdf.save())
  return pdfPath
}

const PREVIEW_PX_PER_MM = 4
const SAFE_MARGIN_MM = 5

/**
 * Gambar preview halaman cetak: kertas, foto di posisinya (bagian di luar kertas terpotong seperti
 * hasil cetak), garis tepi foto dan garis aman 5 mm dari tepi kertas.
 */
export async function renderPrintPreview(imagePath: string, settings: PrinterSettings): Promise<{ png: Buffer; layout: PrintLayout }> {
  const { data, width, height } = await printableImage(imagePath)
  const layout = computePrintLayout(width, height, settings)
  const k = PREVIEW_PX_PER_MM
  const pageW = Math.round(layout.page_w_mm * k)
  const pageH = Math.round(layout.page_h_mm * k)

  const imgW = Math.max(1, Math.round(layout.image_w_mm * k))
  const imgH = Math.max(1, Math.round(layout.image_h_mm * k))
  const imgX = Math.round(layout.image_x_mm * k)
  const imgY = Math.round(layout.image_y_mm * k)

  // bagian foto yang jatuh di atas kertas
  const left = Math.max(0, imgX)
  const top = Math.max(0, imgY)
  const right = Math.min(pageW, imgX + imgW)
  const bottom = Math.min(pageH, imgY + imgH)
  const composites: sharp.OverlayOptions[] = []
  if (right > left && bottom > top) {
    const visible = await sharp(data)
      .resize(imgW, imgH, { fit: 'fill' })
      .extract({ left: left - imgX, top: top - imgY, width: right - left, height: bottom - top })
      .png()
      .toBuffer()
    composites.push({ input: visible, left, top })
  }

  const safe = SAFE_MARGIN_MM * k
  const overlay = Buffer.from(`<svg width='${pageW}' height='${pageH}' xmlns='http://www.w3.org/2000/svg'>
    <rect x='${imgX}' y='${imgY}' width='${imgW}' height='${imgH}' fill='none' stroke='#D62839' stroke-width='3'/>
    <rect x='${safe}' y='${safe}' width='${pageW - safe * 2}' height='${pageH - safe * 2}' fill='none' stroke='#2563EB' stroke-width='2' stroke-dasharray='12 8'/>
    <rect x='1' y='1' width='${pageW - 2}' height='${pageH - 2}' fill='none' stroke='#26211F' stroke-width='2'/>
  </svg>`)
  composites.push({ input: overlay, left: 0, top: 0 })

  const png = await sharp({ create: { width: pageW, height: pageH, channels: 3, background: '#FFFFFF' } })
    .composite(composites)
    .png()
    .toBuffer()
  return { png, layout }
}

const CUPS_SCALE: Record<PrintScale, string> = {
  noscale: 'none',
  fit: 'fit',
  shrink: 'auto-fit'
}

async function sendPdfToPrinter(pdfPath: string, settings: PrinterSettings, copies: number): Promise<void> {
  // kertas dikenal: PDF sudah seukuran kertas & foto sudah ditempatkan â€” printer cukup cetak 1:1
  const paperKnown = !!knownPaper(settings.paper_size)
  const scale: PrintScale = paperKnown ? 'noscale' : settings.print_scale

  if (process.platform === 'win32') {
    // pdf-to-printer membawa SumatraPDF: cetak senyap tanpa dialog
    const { print } = await import('pdf-to-printer')
    const key = settings.paper_size.trim().toLowerCase()
    await print(pdfPath, {
      printer: settings.printer_name || undefined,
      copies,
      scale,
      paperSize: paperKnown ? SUMATRA_PAPER[key] : settings.paper_size || undefined,
      orientation: 'portrait',
      silent: true
    })
    return
  }

  const args = ['-n', String(copies), '-o', `print-scaling=${CUPS_SCALE[scale]}`]
  if (settings.printer_name) args.push('-d', settings.printer_name)
  if (settings.paper_size) args.push('-o', `media=${settings.paper_size}`)
  args.push(pdfPath)
  await execFileAsync('lp', args, { timeout: 30000 })
}

export async function printImage(imagePath: string, copies: number, settings = getPrinterSettings()): Promise<void> {
  // printer hilang/tidak ada default: gagal dengan pesan yang bisa dibaca operator,
  // bukan output mentah SumatraPDF/lp. Offline tetap dikirim â€” spooler OS menahannya.
  // cek sebagai mode lokal: Test Print boleh dijalankan sebelum mode cetak diaktifkan
  const health = await getPrinterHealth({ ...settings, print_mode: 'local' })
  if (health.status === 'error') {
    throw new Error(health.message)
  }

  const pdfPath = await buildPrintPdf(imagePath, settings)
  try {
    await sendPdfToPrinter(pdfPath, settings, copies)
  } catch (err: any) {
    logger.error({ err, printer: settings.printer_name || '(default)' }, 'Printer command failed')
    throw new Error(`Printer ${health.printer || ''} menolak job â€” cek driver, kertas, dan kabel`.replace('  ', ' '))
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
  // isi statis: dibuat sekali lalu dipakai ulang. Menulis ulang file yang sama gagal di Windows
  // karena cache sharp masih memegang file dari Test Print/preview sebelumnya.
  // Naikkan versi nama file bila isi SVG di atas diubah.
  const path = join(PRINT_DIR, 'test_print_v2.jpg')
  if (!existsSync(path)) {
    await sharp(svg).withMetadata({ density: PRINT_DPI }).jpeg({ quality: 95 }).toFile(path)
  }
  return path
}
