'use client'

import { useEffect, useState } from 'react'
import { adminFetch, adminSend, errorMessage } from '../../../lib/supabase'

interface PrinterSettings {
  print_mode: 'digital_only' | 'local' | 'custom_api'
  printer_name?: string
  media_capacity?: number
  media_warn_at: number
  copies: number
}

export default function PrinterPage() {
  const [printer, setPrinter] = useState<PrinterSettings>({
    print_mode: 'digital_only',
    printer_name: '',
    media_capacity: 100,
    media_warn_at: 10,
    copies: 1
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  // null = kolom print_debug belum ada (migrasi 20260101000003 belum dijalankan)
  const [printDebug, setPrintDebug] = useState<boolean | null>(null)
  const [savingDebug, setSavingDebug] = useState(false)

  useEffect(() => {
    async function fetchPrinter() {
      try {
        const res = await adminFetch('/api/admin/settings')
        if (res.ok) {
          const data = await res.json()
          setPrinter({
            print_mode: data.print_mode || 'digital_only',
            printer_name: data.printer_name || '',
            media_capacity: data.media_capacity || 100,
            media_warn_at: data.media_warn_at || 10,
            copies: data.copies || 1
          })
          setPrintDebug(typeof data.print_debug === 'boolean' ? data.print_debug : null)
        }
      } catch (err) {
        console.error('Failed to fetch printer settings:', err)
      } finally {
        setLoading(false)
      }
    }
    
    fetchPrinter()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await adminSend('/api/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify(printer)
      })
      alert('Printer settings saved')
    } catch (err) {
      console.error('Failed to save:', err)
      alert(`Gagal menyimpan: ${errorMessage(err, 'unknown')}`)
    } finally {
      setSaving(false)
    }
  }

  const handleToggleDebug = async () => {
    const next = !printDebug
    setSavingDebug(true)
    try {
      await adminSend('/api/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify({ print_debug: next })
      })
      setPrintDebug(next)
    } catch (err) {
      alert(`Gagal mengubah mode debug cetak: ${errorMessage(err, 'unknown')}`)
    } finally {
      setSavingDebug(false)
    }
  }

  const handleTestPrint = async () => {
    try {
      await adminSend('/api/admin/commands', {
        method: 'POST',
        body: JSON.stringify({ type: 'test_print' })
      })
      alert('Test print command sent')
    } catch (err) {
      console.error('Failed to send test print:', err)
      alert(`Gagal mengirim perintah: ${errorMessage(err, 'unknown')}`)
    }
  }

  if (loading) {
    return <div className="text-char opacity-75">Loading...</div>
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Printer</h1>
      
      <div className="card max-w-md">
        <div className="mb-4">
          <label className="block text-sm font-semibold mb-1">Mode Print</label>
          <select
            value={printer.print_mode}
            onChange={(e) => setPrinter({ ...printer, print_mode: e.target.value as any })}
            className="w-full px-3 py-2 border border-line rounded-lg"
          >
            <option value="digital_only">Digital saja (tidak print)</option>
            <option value="local">Printer lokal (USB/jaringan)</option>
            <option value="custom_api">Custom API</option>
          </select>
        </div>
        
        {printer.print_mode !== 'digital_only' && (
          <>
            <div className="mb-4">
              <label className="block text-sm font-semibold mb-1">Nama Printer</label>
              <input
                type="text"
                value={printer.printer_name}
                onChange={(e) => setPrinter({ ...printer, printer_name: e.target.value })}
                className="w-full px-3 py-2 border border-line rounded-lg"
              />
            </div>
            
            <div className="mb-4">
              <label className="block text-sm font-semibold mb-1">Kapasitas Media (lembar)</label>
              <input
                type="number"
                value={printer.media_capacity}
                onChange={(e) => setPrinter({ ...printer, media_capacity: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-line rounded-lg"
              />
            </div>
            
            <div className="mb-4">
              <label className="block text-sm font-semibold mb-1">Jumlah Salinan</label>
              <input
                type="number"
                min={1}
                value={printer.copies}
                onChange={(e) => setPrinter({ ...printer, copies: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-line rounded-lg"
              />
            </div>
          </>
        )}
        
        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-cherry text-cream px-6 py-3 rounded-lg font-semibold disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Simpan'}
          </button>
          
          {printer.print_mode !== 'digital_only' && (
            <button
              onClick={handleTestPrint}
              className="bg-char text-cream px-6 py-3 rounded-lg font-semibold"
            >
              Test Print
            </button>
          )}
        </div>
      </div>

      {/* debug cetak: kiosk menampilkan preview halaman cetak (kertas + posisi foto) sebelum job masuk antrean */}
      <div className="card max-w-md mt-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-bold">Mode debug cetak</h2>
            <p className="text-sm text-char opacity-75">
              Saat aktif, tombol Print di kiosk menampilkan preview cetak dulu. Job baru masuk antrean setelah
              operator/tamu menekan Cetak. Pakai saat menyetel printer, matikan saat event.
            </p>
          </div>
          <button
            role="switch"
            aria-checked={printDebug === true}
            onClick={handleToggleDebug}
            disabled={savingDebug || printDebug === null}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold ${printDebug ? 'bg-cherry text-cream' : 'bg-line text-char'}`}
          >
            {printDebug ? 'Aktif' : 'Nonaktif'}
          </button>
        </div>
        {printDebug === null && (
          <p className="mt-3 text-sm text-cherry">
            Kolom print_debug belum ada di database. Jalankan supabase/migrations/20260101000003_print_debug.sql di SQL Editor Supabase.
          </p>
        )}
        <p className="mt-3 text-xs text-char opacity-60">Berlaku di booth ±1 menit setelah diubah.</p>
      </div>
    </div>
  )
}
