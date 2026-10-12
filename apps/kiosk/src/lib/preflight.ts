export interface PreflightResult {
  camera: {
    status: 'ok' | 'warning' | 'error'
    message: string
    details?: {
      deviceId?: string
      width?: number
      height?: number
    }
  }
  disk: {
    status: 'ok' | 'warning' | 'error'
    message: string
    freeGB: number
  }
  printer?: {
    status: 'ok' | 'warning' | 'error'
    message: string
  }
  config: {
    status: 'ok' | 'warning' | 'error'
    message: string
    hasFrames: boolean
  }
}

export interface PreflightCheck {
  name: string
  status: 'pending' | 'checking' | 'ok' | 'warning' | 'error'
  message?: string
}

export async function checkCamera(): Promise<PreflightResult['camera']> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    const videoDevices = devices.filter(d => d.kind === 'videoinput')
    
    if (videoDevices.length === 0) {
      return {
        status: 'error',
        message: 'Tidak ada kamera terdeteksi'
      }
    }
    
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false
    })
    
    const track = stream.getVideoTracks()[0]
    const settings = track.getSettings()
    
    track.stop()
    
    const minSize = 1920
    if ((settings.width || 0) < minSize || (settings.height || 0) < 1080) {
      return {
        status: 'warning',
        message: `Resolusi rendah: ${settings.width}x${settings.height}`,
        details: {
          deviceId: settings.deviceId,
          width: settings.width,
          height: settings.height
        }
      }
    }
    
    return {
      status: 'ok',
      message: 'Kamera siap',
      details: {
        deviceId: settings.deviceId,
        width: settings.width,
        height: settings.height
      }
    }
  } catch (err: any) {
    return {
      status: 'error',
      message: err.message || 'Gagal akses kamera'
    }
  }
}

export async function checkDisk(): Promise<PreflightResult['disk']> {
  // cek disk fisik via booth-api (statfs) — navigator.storage.estimate()
  // hanya menunjukkan kuota origin browser, bukan disk sebenarnya
  const BOOTH_API = process.env.NEXT_PUBLIC_BOOTH_API_URL || ''

  try {
    const res = await fetch(`${BOOTH_API}/api/status`)

    if (!res.ok) {
      return {
        status: 'ok',
        message: 'Disk tidak terverifikasi (booth-api tidak merespons)',
        freeGB: 0
      }
    }

    const data = await res.json()
    const freeGB: number = typeof data.disk_free_gb === 'number' ? data.disk_free_gb : 0

    if (freeGB > 0 && freeGB < 5) {
      return {
        status: 'error',
        message: `Disk hampir penuh: ${freeGB.toFixed(1)} GB tersisa`,
        freeGB
      }
    }

    if (freeGB > 0 && freeGB < 10) {
      return {
        status: 'warning',
        message: `Disk menipis: ${freeGB.toFixed(1)} GB tersisa`,
        freeGB
      }
    }

    return {
      status: 'ok',
      message: freeGB > 0 ? `Disk OK: ${freeGB.toFixed(0)} GB tersisa` : 'Disk OK',
      freeGB
    }
  } catch {
    // booth-api tidak terjangkau — config check sudah menandai error, di sini netral saja
    return {
      status: 'ok',
      message: 'Disk tidak terverifikasi (booth-api tidak terjangkau)',
      freeGB: 0
    }
  }
}

export async function checkConfig(): Promise<PreflightResult['config']> {
  const BOOTH_API = process.env.NEXT_PUBLIC_BOOTH_API_URL || ''

  try {
    const res = await fetch(`${BOOTH_API}/api/status`)

    if (!res.ok) {
      return {
        status: 'error',
        message: `Booth API merespons ${res.status} di ${BOOTH_API}`,
        hasFrames: false
      }
    }

    const data = await res.json()

    if (!data.config_loaded) {
      return {
        status: 'error',
        message: 'Konfigurasi belum dimuat — restart booth-api untuk auto-seed',
        hasFrames: false
      }
    }

    const framesRes = await fetch(`${BOOTH_API}/api/frames`)
    const frames = await framesRes.json()

    if (data.output_mode === 'full' && data.ffmpeg_ok === false) {
      return {
        status: 'warning',
        message: 'ffmpeg tidak terpasang di laptop — GIF & Live Photo akan gagal (foto strip tetap jalan)',
        hasFrames: Array.isArray(frames) && frames.length > 0
      }
    }

    if (!frames || frames.length === 0) {
      return {
        status: 'warning',
        message: 'Tidak ada frame aktif',
        hasFrames: false
      }
    }

    return {
      status: 'ok',
      message: 'Konfigurasi siap',
      hasFrames: true
    }
  } catch (err: any) {
    return {
      status: 'error',
      message: `Booth API tidak terjangkau di ${BOOTH_API} (${err?.name || 'Error'}) — pastikan terminal 1 jalan dan sudah restart setelah fix CORS`,
      hasFrames: false
    }
  }
}

// Printer tidak pernah memblokir Start: cetak gagal tetap menghasilkan QR
export async function checkPrinter(): Promise<PreflightResult['printer']> {
  const BOOTH_API = process.env.NEXT_PUBLIC_BOOTH_API_URL || ''

  try {
    const res = await fetch(`${BOOTH_API}/api/status`)
    if (!res.ok) return undefined
    const data = await res.json()
    if (data.print_mode !== 'local' || !data.printer) return undefined
    return { status: data.printer.status, message: data.printer.message }
  } catch {
    return undefined
  }
}

export async function runPreflight(): Promise<PreflightResult> {
  const [camera, disk, config, printer] = await Promise.all([
    checkCamera(),
    checkDisk(),
    checkConfig(),
    checkPrinter()
  ])
  
  return { camera, disk, config, printer }
}
