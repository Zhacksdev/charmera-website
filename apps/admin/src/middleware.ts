import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

const PROTECTED_PREFIXES = [
  '/overview',
  '/sessions',
  '/revenue',
  '/frames',
  '/pricing',
  '/output',
  '/timers',
  '/camera',
  '/printer',
  '/health',
  '/logs',
  '/settings',
]

export async function middleware(request: NextRequest) {
  const isProtected = PROTECTED_PREFIXES.some(
    (p) => request.nextUrl.pathname === p || request.nextUrl.pathname.startsWith(p + '/')
  )
  const isAuthPage = request.nextUrl.pathname.startsWith('/login')

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return NextResponse.next()
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers
    }
  })

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value
      },
      set(name: string, value: string, options: CookieOptions) {
        request.cookies.set({ name, value, ...options })
        response = NextResponse.next({
          request: {
            headers: request.headers
          }
        })
        response.cookies.set({ name, value, ...options })
      },
      remove(name: string, options: CookieOptions) {
        request.cookies.set({ name, value: '', ...options })
        response = NextResponse.next({
          request: {
            headers: request.headers
          }
        })
        response.cookies.set({ name, value: '', ...options })
      }
    }
  })

  const { data: { session } } = await supabase.auth.getSession()

  if (isProtected && !session) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (isAuthPage && session) {
    return NextResponse.redirect(new URL('/overview', request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)']
}
