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
    <main className="flex items-center justify-center min-h-screen p-8">
      <div className="card w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-cherry mb-2">chamera</h1>
          <p className="text-char opacity-75">Admin Dashboard</p>
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
