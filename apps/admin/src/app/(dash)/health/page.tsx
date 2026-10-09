'use client'

import { useEffect, useState } from 'react'
import { adminFetch } from '../../../lib/supabase'

interface Health {
  booth_online: boolean
  camera_status: string
  printer_status: string
  disk_free_gb: number
  outbox_pending: number
  app_version: string
  last_heartbeat?: string
  preflight?: {
    camera?: { status: string }
    disk?: { status: string }
    config?: { status: string }
    printer?: { status: string }
  }
}

export default function HealthPage() {
  const [health, setHealth] = useState<Health | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchHealth() {
      try {
        const res = await adminFetch('/api/admin/health')
        if (res.ok) {
          const data = await res.json()
          setHealth(data)
        }
      } catch (err) {
        console.error('Failed to fetch health:', err)
      } finally {
        setLoading(false)
      }
    }
    
    fetchHealth()
    const interval = setInterval(fetchHealth, 30000)
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return <div className="text-char opacity-75">Loading...</div>
  }

  const statusColor = (status: string) => {
    switch (status) {
      case 'ok': return 'bg-sky text-char'
      case 'warning': return 'bg-butter text-char'
      case 'error': return 'bg-cherry text-cream'
      default: return 'bg-line text-char'
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Kesehatan Booth</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card">
          <h3 className="font-bold mb-3">Status Booth</h3>
          <div className={`px-3 py-2 rounded-lg text-sm font-semibold inline-block ${
            health?.booth_online ? 'bg-sky text-char' : 'bg-cherry text-cream'
          }`}>
            {health?.booth_online ? 'Online' : 'Offline'}
          </div>
          {health?.last_heartbeat && (
            <p className="text-xs text-char opacity-50 mt-2">
              Last heartbeat: {new Date(health.last_heartbeat).toLocaleString('id-ID')}
            </p>
          )}
        </div>
        
        <div className="card">
          <h3 className="font-bold mb-3">Pre-flight</h3>
          <div className="space-y-2">
            {health?.preflight?.camera && (
              <div className="flex items-center gap-2">
                <span className="text-sm">Kamera:</span>
                <span className={`px-2 py-1 rounded text-xs ${statusColor(health.preflight.camera.status)}`}>
                  {health.preflight.camera.status}
                </span>
              </div>
            )}
            {health?.preflight?.disk && (
              <div className="flex items-center gap-2">
                <span className="text-sm">Disk:</span>
                <span className={`px-2 py-1 rounded text-xs ${statusColor(health.preflight.disk.status)}`}>
                  {health.preflight.disk.status}
                </span>
              </div>
            )}
            {health?.preflight?.printer && (
              <div className="flex items-center gap-2">
                <span className="text-sm">Printer:</span>
                <span className={`px-2 py-1 rounded text-xs ${statusColor(health.preflight.printer.status)}`}>
                  {health.preflight.printer.status}
                </span>
              </div>
            )}
          </div>
        </div>
        
        <div className="card">
          <h3 className="font-bold mb-3">Disk & Sync</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm">Ruang Disk:</span>
              <span className="text-sm font-semibold">{health?.disk_free_gb || 0} GB</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm">Antrean Sync:</span>
              <span className="text-sm font-semibold">{health?.outbox_pending || 0} item</span>
            </div>
          </div>
        </div>
        
        <div className="card">
          <h3 className="font-bold mb-3">Versi</h3>
          <p className="text-sm">{health?.app_version || 'Unknown'}</p>
        </div>
      </div>
      
      <div className="mt-6 flex gap-3">
        <button
          onClick={async () => {
            await adminFetch('/api/admin/commands', {
              method: 'POST',
              body: JSON.stringify({ type: 'retry_sync' })
            })
            alert('Retry sync command sent')
          }}
          className="bg-cherry text-cream px-6 py-3 rounded-lg font-semibold"
        >
          Retry Sync
        </button>
      </div>
    </div>
  )
}
