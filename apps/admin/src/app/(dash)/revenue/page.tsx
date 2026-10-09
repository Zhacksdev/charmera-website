'use client'

import { useEffect, useState } from 'react'
import { adminFetch } from '../../../lib/supabase'

export default function RevenuePage() {
  const [revenue, setRevenue] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  useEffect(() => {
    fetchRevenue()
  }, [])

  async function fetchRevenue() {
    try {
      const params = new URLSearchParams()
      if (from) params.append('from', from)
      if (to) params.append('to', to)
      
      const res = await adminFetch(`/api/admin/revenue?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setRevenue(data)
      }
    } catch (err) {
      console.error('Failed to fetch revenue:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="text-char opacity-75">Loading...</div>
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Pendapatan</h1>
      
      <div className="flex gap-4 mb-6">
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="px-3 py-2 border border-line rounded-lg"
        />
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="px-3 py-2 border border-line rounded-lg"
        />
        <button
          onClick={fetchRevenue}
          className="bg-cherry text-cream px-6 py-2 rounded-lg font-semibold"
        >
          Filter
        </button>
      </div>
      
      <div className="card mb-6">
        <div className="text-sm text-char opacity-75">Total Pendapatan</div>
        <div className="text-3xl font-bold text-cherry">
          Rp {(revenue?.total || 0).toLocaleString('id-ID')}
        </div>
      </div>
      
      <div className="card">
        <h3 className="font-bold mb-4">Pendapatan per Frame</h3>
        {(revenue?.periods || []).map((period: any) => (
          <div key={period.label} className="flex justify-between py-2 border-b border-line">
            <span className="text-sm">{period.label}</span>
            <span className="text-sm font-semibold">
              Rp {period.value.toLocaleString('id-ID')}
            </span>
          </div>
        ))}
        
        {(!revenue?.periods || revenue.periods.length === 0) && (
          <div className="text-center py-8 text-char opacity-50">
            Tidak ada data pendapatan
          </div>
        )}
      </div>
    </div>
  )
}
