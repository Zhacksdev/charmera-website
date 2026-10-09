'use client'

import { useEffect, useState } from 'react'
import { adminFetch } from '../../../lib/supabase'

interface Stats {
  total_sessions: number
  completed_sessions: number
  revenue_today: number
  revenue_week: number
  revenue_month: number
  active_frames: number
  print_success_rate: number
  booth_online: boolean
  sync_pending: number
}

export default function OverviewPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await adminFetch('/api/admin/stats')
        if (res.ok) {
          const data = await res.json()
          setStats(data)
        } else {
          setError('Failed to load stats')
        }
      } catch (err) {
        setError('Failed to load stats')
      } finally {
        setLoading(false)
      }
    }
    
    fetchStats()
  }, [])

  if (loading) {
    return <div className="text-char opacity-75">Loading...</div>
  }

  if (error) {
    return <div className="text-cherry">{error}</div>
  }

  const statCards = [
    { label: 'Total Sesi', value: stats?.total_sessions || 0 },
    { label: 'Sesi Selesai', value: stats?.completed_sessions || 0 },
    { label: 'Pendapatan Hari Ini', value: `Rp ${(stats?.revenue_today || 0).toLocaleString('id-ID')}` },
    { label: 'Pendapatan Minggu', value: `Rp ${(stats?.revenue_week || 0).toLocaleString('id-ID')}` },
    { label: 'Pendapatan Bulan', value: `Rp ${(stats?.revenue_month || 0).toLocaleString('id-ID')}` },
    { label: 'Frame Aktif', value: stats?.active_frames || 0 },
    { label: 'Print Success Rate', value: `${stats?.print_success_rate || 0}%` },
    { label: 'Booth Status', value: stats?.booth_online ? 'Online' : 'Offline' },
  ]

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Overview</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div key={card.label} className="card">
            <div className="text-sm text-char opacity-75">{card.label}</div>
            <div className="text-2xl font-bold mt-1">{card.value}</div>
          </div>
        ))}
      </div>
      
      {stats?.sync_pending !== undefined && stats.sync_pending > 0 && (
        <div className="mt-6 card bg-butter">
          <div className="text-char font-semibold">
            ⚠️ {stats.sync_pending} item menunggu sinkronisasi
          </div>
        </div>
      )}
    </div>
  )
}
