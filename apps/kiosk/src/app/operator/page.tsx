'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const BOOTH_API = process.env.NEXT_PUBLIC_BOOTH_API_URL || ''

export default function OperatorPage() {
  const router = useRouter()
  const [pin, setPin] = useState('')
  const [authenticated, setAuthenticated] = useState(false)
  const [status, setStatus] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${BOOTH_API}/api/status`, {
        headers: { 'X-Operator-Pin': pin },
      })
      
      if (res.ok) {
        const data = await res.json()
        setStatus(data)
        setAuthenticated(true)
      } else {
        alert('Invalid PIN')
      }
    } catch (err) {
      console.error('Login failed:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleTestPrint = async () => {
    try {
      await fetch(`${BOOTH_API}/api/operator/test-print`, {
        method: 'POST',
        headers: { 'X-Operator-Pin': pin },
      })
      alert('Test print sent')
    } catch (err) {
      console.error('Test print failed:', err)
    }
  }

  const handleRetrySync = async () => {
    try {
      await fetch(`${BOOTH_API}/api/operator/retry-sync`, {
        method: 'POST',
        headers: { 'X-Operator-Pin': pin },
      })
      alert('Sync retry triggered')
    } catch (err) {
      console.error('Retry sync failed:', err)
    }
  }

  if (!authenticated) {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen p-8">
        <div className="card max-w-sm w-full p-6">
          <h1 className="text-3xl font-display italic text-cherry mb-6 text-center">
            Operator Panel
          </h1>
          
          <input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="Enter PIN"
            className="w-full px-4 py-3 rounded-lg border border-line bg-white text-char mb-4"
          />
          
          <button
            onClick={handleLogin}
            disabled={loading || !pin}
            className="btn-primary w-full disabled:opacity-50"
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="flex flex-col min-h-screen p-8">
      <div className="max-w-2xl mx-auto w-full">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-display italic text-cherry">
            Operator Panel
          </h1>
          <button
            onClick={() => setAuthenticated(false)}
            className="text-char opacity-75 hover:opacity-100"
          >
            Logout
          </button>
        </div>
        
        <div className="card mb-6">
          <h2 className="text-xl font-bold mb-4">System Status</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-char opacity-75">Config Version</div>
              <div className="text-lg font-bold">{status?.config_version || 0}</div>
            </div>
            <div>
              <div className="text-sm text-char opacity-75">Config Loaded</div>
              <div className="text-lg font-bold">{status?.config_loaded ? 'Yes' : 'No'}</div>
            </div>
            <div>
              <div className="text-sm text-char opacity-75">Pending Sync</div>
              <div className="text-lg font-bold">{status?.outbox_pending || 0}</div>
            </div>
          </div>
        </div>
        
        <div className="card">
          <h2 className="text-xl font-bold mb-4">Actions</h2>
          <div className="flex gap-4">
            <button onClick={handleTestPrint} className="btn-primary">
              Test Print
            </button>
            <button onClick={handleRetrySync} className="btn-primary">
              Retry Sync
            </button>
          </div>
        </div>
      </div>
    </main>
  )
}
