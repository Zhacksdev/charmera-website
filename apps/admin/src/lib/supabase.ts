import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

export const ADMIN_API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL || 'http://localhost:4001'

export function isSupabaseConfigured(): boolean {
  return supabaseUrl !== '' && supabaseAnonKey !== ''
}

let client: SupabaseClient | null = null

function getClient(): SupabaseClient {
  if (!client) {
    client = createClient(supabaseUrl, supabaseAnonKey)
  }
  return client
}

export function getSupabase(): SupabaseClient {
  return getClient()
}

export interface AdminSession {
  user_id: string
  role: string
}

export async function getSession(): Promise<AdminSession | null> {
  if (!isSupabaseConfigured()) return null
  
  const { data: { session }, error } = await getClient().auth.getSession()
  
  if (error || !session) {
    return null
  }
  
  return {
    user_id: session.user.id,
    role: 'admin'
  }
}

export async function signIn(email: string, password: string): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { error: 'Supabase belum dikonfigurasi. Isi NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_ANON_KEY di .env' }
  }
  
  const { error } = await getClient().auth.signInWithPassword({
    email,
    password
  })
  
  if (error) {
    return { error: error.message }
  }
  
  return { error: null }
}

export async function signOut(): Promise<void> {
  if (!isSupabaseConfigured()) return
  await getClient().auth.signOut()
}

export async function adminFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {})
  }
  
  if (isSupabaseConfigured()) {
    const { data: { session } } = await getClient().auth.getSession()
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`
    }
  }
  
  return fetch(`${ADMIN_API_URL}${path}`, {
    ...options,
    headers
  })
}
