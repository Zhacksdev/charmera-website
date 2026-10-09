import { createClient, SupabaseClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL || ''
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

let client: SupabaseClient | null = null

export function isSupabaseConfigured(): boolean {
  return url !== '' && key !== ''
}

// service role: bypass RLS — hanya untuk server
export function getSupabase(): SupabaseClient {
  if (!client) {
    if (!isSupabaseConfigured()) {
      throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum diset')
    }
    client = createClient(url, key, {
      auth: { persistSession: false }
    })
  }
  return client
}

// verifikasi JWT user (admin dashboard) memakai anon key
const anonUrl = process.env.SUPABASE_URL || ''
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

let anonClient: SupabaseClient | null = null

export function getSupabaseAuth(): SupabaseClient {
  if (!anonClient) {
    if (!anonUrl || !anonKey) {
      throw new Error('SUPABASE_URL / SUPABASE_ANON_KEY belum diset')
    }
    anonClient = createClient(anonUrl, anonKey, {
      auth: { persistSession: false }
    })
  }
  return anonClient
}
