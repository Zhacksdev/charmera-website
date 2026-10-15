'use client'

import { useEffect, useState } from 'react'

const BOOTH_API = process.env.NEXT_PUBLIC_BOOTH_API_URL || ''

interface PreviewData {
  image: string
  layout: {
    page_w_mm: number
    page_h_mm: number
    image_x_mm: number
    image_y_mm: number
    image_w_mm: number
    image_h_mm: number
    paper_known: boolean
  }
  settings: {
    printer_name: string
    paper_size: string
    print_scale: string
    scale_pct: number
    offset_x_mm: number
    offset_y_mm: number
    copies: number
  }
  health: { status: 'ok' | 'warning' | 'error'; message: string }
}

const SCALE_LABEL: Record<string, string> = {
  noscale: 'Ukuran asli 4x6',
  fit: 'Sesuaikan kertas',
  shrink: 'Perkecil bila perlu'
}

const mm = (value: number) => `${Math.round(value * 10) / 10} mm`

/**
 * Mode debug cetak (diaktifkan di admin → Printer): halaman cetak persis seperti yang dikirim ke printer
 * — kertas, posisi & ukuran foto, garis aman 5 mm — sebelum job masuk antrean.
 */
export function PrintPreviewModal({
  sessionId,
  beforeLoad,
  onPrint,
  onSkipPrint,
  onClose,
}: {
  sessionId: string
  /** tunggu filter/upload tersimpan agar preview memakai strip terbaru */
  beforeLoad: () => Promise<void>
  onPrint: () => void
  onSkipPrint: () => void
  onClose: () => void
}) {
  const [data, setData] = useState<PreviewData | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await beforeLoad()
        const res = await fetch(`${BOOTH_API}/api/sessions/${sessionId}/print-preview`)
        const body = await res.json()
        if (cancelled) return
        if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
        setData(body)
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Preview cetak gagal dimuat')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [sessionId, beforeLoad])

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-char/75 p-4" role="dialog" aria-modal="true" aria-labelledby="print-preview-title">
      <div className="flex max-h-[94dvh] w-full max-w-4xl flex-col overflow-hidden rounded-[24px] bg-cream text-char shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 id="print-preview-title" className="text-xl font-extrabold text-cherry">Preview cetak (mode debug)</h2>
          <button onClick={onClose} aria-label="Tutup" className="px-2 text-2xl text-char" style={{ minHeight: 0 }}>✕</button>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-5 landscape:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div className="flex min-h-[260px] items-center justify-center rounded-xl bg-[repeating-conic-gradient(#e9e2d6_0_25%,#f5efe4_0_50%)] bg-[length:20px_20px] p-3">
            {data ? (
              <img src={data.image} alt="Preview halaman cetak" className="max-h-[62dvh] w-auto max-w-full shadow-lg" />
            ) : error ? (
              <p role="alert" className="text-center font-bold text-cherry">{error}</p>
            ) : (
              <div className="flex flex-col items-center gap-3 text-char/70">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-cherry border-t-transparent" />
                Menyiapkan preview cetak...
              </div>
            )}
          </div>

          <div className="space-y-3 text-sm">
            {data && (
              <>
                <div className={`rounded-lg px-3 py-2 font-bold ${data.health.status === 'ok' ? 'bg-emerald-100 text-emerald-900' : data.health.status === 'warning' ? 'bg-butter' : 'bg-rose text-cherry'}`}>
                  {data.health.message}
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                  <dt className="font-bold">Printer</dt><dd>{data.settings.printer_name}</dd>
                  <dt className="font-bold">Kertas</dt>
                  <dd>{data.settings.paper_size} — {mm(data.layout.page_w_mm)} × {mm(data.layout.page_h_mm)}</dd>
                  <dt className="font-bold">Skala</dt><dd>{SCALE_LABEL[data.settings.print_scale] || data.settings.print_scale} · {data.settings.scale_pct}%</dd>
                  <dt className="font-bold">Foto</dt><dd>{mm(data.layout.image_w_mm)} × {mm(data.layout.image_h_mm)}</dd>
                  <dt className="font-bold">Posisi</dt><dd>kiri {mm(data.layout.image_x_mm)}, atas {mm(data.layout.image_y_mm)}</dd>
                  <dt className="font-bold">Geser</dt><dd>X {mm(data.settings.offset_x_mm)}, Y {mm(data.settings.offset_y_mm)}</dd>
                  <dt className="font-bold">Salinan</dt><dd>{data.settings.copies}</dd>
                </dl>
                <p className="opacity-75">
                  Garis hitam = tepi kertas, merah = tepi foto, biru putus-putus = 5 mm dari tepi kertas.
                  {!data.layout.paper_known && ' Ukuran kertas kosong/tidak dikenal: posisi akhir ditentukan driver printer — pilih ukuran kertas di panel operator agar hasil cetak sama dengan preview.'}
                </p>
                <p className="opacity-75">Tidak pas? Atur ukuran kertas, skala, dan geser di panel operator (/operator), lalu ulangi.</p>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-3 border-t border-line px-5 py-3">
          <button onClick={onSkipPrint} className="btn-secondary min-w-40 text-lg">Lewati cetak</button>
          <button onClick={onPrint} disabled={!data} className="btn-primary min-w-40 border border-line text-lg">Cetak</button>
        </div>
      </div>
    </div>
  )
}
