'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from '../../../lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    
    const { error } = await signIn(email, password)
    
    if (error) {
      setError(error)
      setLoading(false)
      return
    }
    
    router.push('/overview')
  }

  return (
    <main className="web-shell flex flex-col items-center justify-center min-h-screen gap-6 p-8">
      {/* sama dengan layar booth: logo krem di atas latar cherry */}
      <img src="/logo.png" alt="Chamera, Wear your memories" className="w-[min(60vw,220px)] object-contain" />
      <div className="card w-full max-w-sm shadow-2xl" style={{ backgroundColor: 'var(--cream)', border: 'none', borderRadius: 24 }}>
        <div className="text-center mb-6">
          <p className="text-xl font-extrabold text-cherry">Admin Dashboard</p>
        </div>
        
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold mb-1 text-char">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 border border-line rounded-lg"
            />
          </div>
          
          <div>
            <label className="block text-sm font-semibold mb-1 text-char">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2 border border-line rounded-lg"
            />
          </div>
          
          {error && (
            <div className="text-cherry text-sm">{error}</div>
          )}
          
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-cherry text-cream py-3 rounded-lg font-semibold disabled:opacity-50"
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>
      </div>
    </main>
  )
}
