'use client'

import { useState } from 'react'

const BOOTH_API = process.env.NEXT_PUBLIC_BOOTH_API_URL || ''

type PrintScale = 'noscale' | 'fit' | 'shrink'

interface PrinterSettings {
  print_mode: 'digital_only' | 'local'
  printer_name: string
  copies: number
  print_scale: PrintScale
  paper_size: string
  scale_pct: number
  offset_x_mm: number
  offset_y_mm: number
}

interface PrinterInfo {
  name: string
  isDefault: boolean
  online: boolean
  status: string
}

interface PrinterState {
  settings: PrinterSettings
  printers: PrinterInfo[]
  list_error: string | null
  health: { status: 'ok' | 'warning' | 'error'; message: string }
}

const SCALE_OPTIONS: Array<{ value: PrintScale; label: string; hint: string }> = [
  { value: 'noscale', label: 'Ukuran asli 4x6', hint: 'Untuk printer foto 4R. Di kertas besar (A4) foto tercetak 10x15 cm, tinggal dipotong.' },
  { value: 'fit', label: 'Sesuaikan kertas', hint: 'Foto diperbesar/diperkecil memenuhi kertas. Pakai bila tepi foto terpotong.' },
  { value: 'shrink', label: 'Perkecil bila perlu', hint: 'Ukuran asli, hanya diperkecil bila tidak muat di area cetak printer.' }
]

const HEALTH_COLOR = {
  ok: 'bg-emerald-100 text-emerald-900',
  warning: 'bg-butter text-char',
  error: 'bg-rose text-cherry'
}

export default function OperatorPage() {
  const [pin, setPin] = useState('')
  const [authenticated, setAuthenticated] = useState(false)
  const [status, setStatus] = useState<any>(null)
  const [printer, setPrinter] = useState<PrinterState | null>(null)
  const [form, setForm] = useState<PrinterSettings | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<'save' | 'test' | 'refresh' | 'sync' | 'preview' | null>(null)
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)

  const operatorFetch = (path: string, init: RequestInit = {}) =>
    fetch(`${BOOTH_API}/api/operator${path}`, {
      ...init,
      headers: { 'X-Operator-Pin': pin, 'Content-Type': 'application/json', ...(init.headers || {}) }
    })

  const applyPrinterState = (data: PrinterState) => {
    setPrinter(data)
    setForm(data.settings)
  }

  const refreshStatus = async () => {
    const res = await fetch(`${BOOTH_API}/api/status`)
    if (res.ok) setStatus(await res.json())
  }

  const handleLogin = async () => {
    setLoading(true)
    setNotice(null)
    try {
      // endpoint printer dilindungi PIN — sekaligus validasi login
      const res = await operatorFetch('/printer')
      if (res.status === 401) {
        setNotice({ ok: false, text: 'PIN salah' })
        return
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      applyPrinterState(await res.json())
      await refreshStatus()
      setAuthenticated(true)
    } catch (err) {
      console.error('Login failed:', err)
      setNotice({ ok: false, text: 'Booth API tidak terjangkau' })
    } finally {
      setLoading(false)
    }
  }

  const handleRefreshPrinters = async () => {
    setBusy('refresh')
    try {
      const res = await operatorFetch('/printer')
      if (res.ok) applyPrinterState(await res.json())
      await refreshStatus()
    } finally {
      setBusy(null)
    }
  }

  const handleSave = async () => {
    if (!form) return
    setBusy('save')
    setNotice(null)
    try {
      const res = await operatorFetch('/printer', { method: 'PUT', body: JSON.stringify(form) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      applyPrinterState(data)
      await refreshStatus()
      setNotice({ ok: true, text: 'Pengaturan printer tersimpan, berlaku untuk sesi berikutnya' })
    } catch (err: any) {
      setNotice({ ok: false, text: err.message || 'Gagal menyimpan' })
    } finally {
      setBusy(null)
    }
  }

  const handleTestPrint = async () => {
    setBusy('test')
    setNotice(null)
    try {
      const res = await operatorFetch('/test-print', { method: 'POST' })
      const data = await res.json()
      setNotice(res.ok
        ? { ok: true, text: 'Test print terkirim. Cek garis tepi di hasil cetak.' }
        : { ok: false, text: data.error || 'Test print gagal' })
    } catch {
      setNotice({ ok: false, text: 'Booth API tidak terjangkau' })
    } finally {
      setBusy(null)
    }
  }

  // halaman uji dengan pengaturan di form (belum disimpan) — setel geser/skala tanpa membuang kertas
  const handlePreview = async () => {
    if (!form) return
    setBusy('preview')
    setNotice(null)
    try {
      const res = await operatorFetch('/print-preview', { method: 'POST', body: JSON.stringify(form) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setPreviewImage(data.image)
    } catch (err: any) {
      setNotice({ ok: false, text: err.message || 'Preview gagal' })
    } finally {
      setBusy(null)
    }
  }

  const handleRetrySync = async () => {
    setBusy('sync')
    try {
      const res = await operatorFetch('/retry-sync', { method: 'POST' })
      const data = await res.json()
      setNotice(res.ok ? { ok: true, text: `Sync dicoba ulang (${data.pending_items} antrean)` } : { ok: false, text: data.error })
    } finally {
      setBusy(null)
    }
  }

  if (!authenticated) {
    return (
      <main className="kiosk-page items-center justify-center">
        <div className="card max-w-sm w-full p-6">
          <h1 className="text-3xl font-display italic text-cherry mb-6 text-center">
            Operator Panel
          </h1>

          <input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && pin && handleLogin()}
            placeholder="Masukkan PIN"
            className="w-full px-4 py-3 rounded-lg border border-line bg-white text-char mb-4"
          />

          <button
            onClick={handleLogin}
            disabled={loading || !pin}
            className="btn-primary w-full disabled:opacity-50"
          >
            {loading ? 'Memeriksa...' : 'Masuk'}
          </button>
          {notice && !notice.ok && <p role="alert" className="mt-3 text-center text-sm text-cherry">{notice.text}</p>}
        </div>
      </main>
    )
  }

  const selectedScale = SCALE_OPTIONS.find((o) => o.value === form?.print_scale)
  // printer tersimpan yang sudah tidak terpasang tetap ditampilkan agar tidak hilang diam-diam
  const savedMissing = !!form?.printer_name && !printer?.printers.some((p) => p.name === form.printer_name)

  return (
    <main className="kiosk-page">
      <div className="max-w-2xl mx-auto w-full space-y-5 pb-10">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-display italic text-cream">
            Operator Panel
          </h1>
          <div className="flex gap-4 text-cream/85">
            <a href="/" className="hover:text-cream">Ke kiosk</a>
            <button onClick={() => { setAuthenticated(false); setPin('') }} className="hover:text-cream">
              Keluar
            </button>
          </div>
        </div>

        {notice && (
          <div role="status" className={`rounded-xl px-4 py-3 text-sm font-bold ${notice.ok ? 'bg-cream text-char' : 'bg-rose text-cherry'}`}>
            {notice.text}
          </div>
        )}

        {form && printer && (
          <section className="card text-char space-y-5">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-xl font-bold">Printer</h2>
              <button onClick={handleRefreshPrinters} disabled={!!busy} className="text-sm font-bold text-cherry disabled:opacity-50">
                {busy === 'refresh' ? 'Memuat...' : 'Muat ulang daftar'}
              </button>
            </div>

            <div className={`rounded-lg px-3 py-2 text-sm font-bold ${HEALTH_COLOR[printer.health.status]}`}>
              {printer.health.message}
            </div>

            <fieldset>
              <legend className="mb-2 text-sm font-bold">Mode</legend>
              <div className="grid grid-cols-2 gap-2">
                {([['local', 'Cetak foto'], ['digital_only', 'Digital saja (QR)']] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setForm({ ...form, print_mode: value })}
                    className={`rounded-lg border px-3 py-3 font-bold ${form.print_mode === value ? 'border-cherry bg-cherry text-cream' : 'border-line bg-white'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="block">
              <span className="mb-2 block text-sm font-bold">Printer di laptop</span>
              <select
                value={form.printer_name}
                onChange={(e) => setForm({ ...form, printer_name: e.target.value })}
                className="w-full rounded-lg border border-line bg-white px-3 py-3"
              >
                <option value="">Printer default Windows/OS</option>
                {printer.printers.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}{p.isDefault ? ' (default)' : ''} — {p.status}
                  </option>
                ))}
                {savedMissing && <option value={form.printer_name}>{form.printer_name} — tidak terpasang</option>}
              </select>
              {printer.list_error && <span className="mt-1 block text-sm text-cherry">{printer.list_error}</span>}
            </label>

            <fieldset>
              <legend className="mb-2 text-sm font-bold">Skala cetak</legend>
              <div className="grid gap-2 md:grid-cols-3">
                {SCALE_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setForm({ ...form, print_scale: o.value })}
                    className={`rounded-lg border px-3 py-3 text-sm font-bold ${form.print_scale === o.value ? 'border-cherry bg-cherry text-cream' : 'border-line bg-white'}`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              {selectedScale && <p className="mt-2 text-sm opacity-75">{selectedScale.hint}</p>}
            </fieldset>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-2 block text-sm font-bold">Jumlah salinan</span>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={form.copies}
                  onChange={(e) => setForm({ ...form, copies: Math.min(10, Math.max(1, Number(e.target.value) || 1)) })}
                  className="w-full rounded-lg border border-line bg-white px-3 py-3"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-bold">Ukuran kertas</span>
                <input
                  type="text"
                  value={form.paper_size}
                  onChange={(e) => setForm({ ...form, paper_size: e.target.value })}
                  placeholder="Kosong = default driver"
                  list="paper-sizes"
                  className="w-full rounded-lg border border-line bg-white px-3 py-3"
                />
                <datalist id="paper-sizes">
                  <option value="4x6">Foto 4R (10,16 × 15,24 cm)</option>
                  <option value="10x15">10 × 15 cm</option>
                  <option value="5x7">5R</option>
                  <option value="A6" />
                  <option value="A5" />
                  <option value="A4" />
                  <option value="letter" />
                </datalist>
              </label>
            </div>
            <p className="text-sm opacity-75">
              Pilih ukuran kertas dari daftar (4x6, 10x15, 5x7, A6, A5, A4, letter) agar booth sendiri yang menempatkan foto di kertas,
              sehingga hasil cetak sama dengan preview. Kosong = posisi diserahkan ke driver printer.
            </p>

            {/* penyesuaian bila hasil cetak terpotong / tidak di tengah */}
            <fieldset>
              <legend className="mb-2 text-sm font-bold">Penyesuaian posisi</legend>
              <div className="grid grid-cols-3 gap-3">
                {([
                  ['scale_pct', 'Skala (%)', 50, 150, 1],
                  ['offset_x_mm', 'Geser kanan (mm)', -50, 50, 0.5],
                  ['offset_y_mm', 'Geser bawah (mm)', -50, 50, 0.5],
                ] as const).map(([key, label, min, max, step]) => (
                  <label key={key} className="block">
                    <span className="mb-1 block text-xs font-bold">{label}</span>
                    <input
                      type="number"
                      min={min}
                      max={max}
                      step={step}
                      value={form[key]}
                      onChange={(e) => {
                        const value = Number(e.target.value)
                        setForm({ ...form, [key]: Number.isFinite(value) ? Math.min(max, Math.max(min, key === 'scale_pct' ? Math.round(value) : value)) : form[key] })
                      }}
                      className="w-full rounded-lg border border-line bg-white px-3 py-3"
                    />
                  </label>
                ))}
              </div>
              <p className="mt-2 text-sm opacity-75">Nilai minus menggeser ke kiri/atas. Foto keluar kertas di sisi kanan? Isi geser kanan negatif, mis. -8.</p>
            </fieldset>

            <div className="flex flex-wrap gap-3">
              <button onClick={handleSave} disabled={!!busy} className="btn-primary border border-line disabled:opacity-50">
                {busy === 'save' ? 'Menyimpan...' : 'Simpan'}
              </button>
              <button onClick={handlePreview} disabled={!!busy} className="btn-secondary disabled:opacity-50">
                {busy === 'preview' ? 'Memuat...' : 'Preview'}
              </button>
              <button onClick={handleTestPrint} disabled={!!busy} className="btn-secondary disabled:opacity-50">
                {busy === 'test' ? 'Mengirim...' : 'Test Print'}
              </button>
            </div>
            <p className="text-sm opacity-75">Preview memakai isian form (belum perlu disimpan). Test Print memakai pengaturan yang sudah disimpan.</p>

            {previewImage && (
              <figure className="rounded-xl bg-line/40 p-3 text-center">
                <img src={previewImage} alt="Preview halaman uji di kertas" className="mx-auto max-h-[60dvh] w-auto max-w-full shadow-lg" />
                <figcaption className="mt-2 text-xs opacity-75">Garis hitam = tepi kertas · merah = tepi foto · biru putus-putus = 5 mm dari tepi kertas</figcaption>
              </figure>
            )}
          </section>
        )}

        <section className="card text-char">
          <h2 className="text-xl font-bold mb-4">Status Sistem</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm opacity-75">Config Version</div>
              <div className="text-lg font-bold">{status?.config_version || 0}</div>
            </div>
            <div>
              <div className="text-sm opacity-75">Mode Output</div>
              <div className="text-lg font-bold">{status?.output_mode || '-'}</div>
            </div>
            <div>
              <div className="text-sm opacity-75">Antrean Sync</div>
              <div className="text-lg font-bold">{status?.outbox_pending || 0}</div>
            </div>
            <div>
              <div className="text-sm opacity-75">Disk Kosong</div>
              <div className="text-lg font-bold">{typeof status?.disk_free_gb === 'number' ? `${status.disk_free_gb.toFixed(1)} GB` : '-'}</div>
            </div>
          </div>
          <button onClick={handleRetrySync} disabled={!!busy} className="btn-secondary mt-4 disabled:opacity-50">
            Retry Sync
          </button>
        </section>
      </div>
    </main>
  )
}
