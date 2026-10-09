'use client'

import { useEffect, useState } from 'react'
import { adminFetch } from '../../../lib/supabase'

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
      await adminFetch('/api/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify(printer)
      })
      alert('Printer settings saved')
    } catch (err) {
      console.error('Failed to save:', err)
      alert('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleTestPrint = async () => {
    try {
      await adminFetch('/api/admin/commands', {
        method: 'POST',
        body: JSON.stringify({ type: 'test_print' })
      })
      alert('Test print command sent')
    } catch (err) {
      console.error('Failed to send test print:', err)
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
    </div>
  )
}
