'use client'

import { useEffect, useState } from 'react'
import { adminFetch } from '../../../lib/supabase'

interface Session {
  id: string
  public_code: string
  status: string
  sync_status: string
  frame_name?: string
  price: number
  started_at: string
  completed_at?: string
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  useEffect(() => {
    async function fetchSessions() {
      try {
        const res = await adminFetch('/api/admin/sessions')
        if (res.ok) {
          const data = await res.json()
          setSessions(data)
        }
      } catch (err) {
        console.error('Failed to fetch sessions:', err)
      } finally {
        setLoading(false)
      }
    }
    
    fetchSessions()
  }, [])

  const filteredSessions = sessions.filter((s) => {
    if (statusFilter !== 'all' && s.status !== statusFilter) return false
    if (filter && !s.public_code.toLowerCase().includes(filter.toLowerCase())) return false
    return true
  })

  const handleReprint = async (sessionId: string) => {
    try {
      await adminFetch('/api/admin/commands', {
        method: 'POST',
        body: JSON.stringify({ type: 'reprint', session_id: sessionId })
      })
      alert('Reprint command sent')
    } catch (err) {
      console.error('Failed to reprint:', err)
    }
  }

  if (loading) {
    return <div className="text-char opacity-75">Loading...</div>
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Sesi</h1>
      
      <div className="flex gap-4 mb-4">
        <input
          type="text"
          placeholder="Cari kode..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="px-3 py-2 border border-line rounded-lg"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-line rounded-lg"
        >
          <option value="all">Semua Status</option>
          <option value="completed">Selesai</option>
          <option value="abandoned">Dibatalkan</option>
          <option value="processing">Diproses</option>
        </select>
      </div>
      
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line">
              <th className="text-left py-2 px-3">Kode</th>
              <th className="text-left py-2 px-3">Status</th>
              <th className="text-left py-2 px-3">Sync</th>
              <th className="text-left py-2 px-3">Harga</th>
              <th className="text-left py-2 px-3">Mulai</th>
              <th className="text-left py-2 px-3">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {filteredSessions.map((session) => (
              <tr key={session.id} className="border-b border-line">
                <td className="py-2 px-3 font-mono">{session.public_code}</td>
                <td className="py-2 px-3">
                  <span className={`px-2 py-1 rounded text-xs font-semibold ${
                    session.status === 'completed' ? 'bg-cherry text-cream' :
                    session.status === 'abandoned' ? 'bg-char text-cream' :
                    'bg-butter text-char'
                  }`}>
                    {session.status}
                  </span>
                </td>
                <td className="py-2 px-3">
                  <span className={`px-2 py-1 rounded text-xs ${
                    session.sync_status === 'synced' ? 'bg-sky text-char' :
                    session.sync_status === 'failed' ? 'bg-cherry text-cream' :
                    'bg-butter text-char'
                  }`}>
                    {session.sync_status}
                  </span>
                </td>
                <td className="py-2 px-3">Rp {session.price.toLocaleString('id-ID')}</td>
                <td className="py-2 px-3">{new Date(session.started_at).toLocaleString('id-ID')}</td>
                <td className="py-2 px-3">
                  <button
                    onClick={() => handleReprint(session.id)}
                    className="px-2 py-1 text-xs bg-cherry text-cream rounded"
                  >
                    Reprint
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {filteredSessions.length === 0 && (
          <div className="text-center py-8 text-char opacity-50">
            Tidak ada sesi
          </div>
        )}
      </div>
    </div>
  )
}
