'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from '../../lib/supabase'
import { useRouter } from 'next/navigation'

const NAV_ITEMS = [
  { href: '/overview', label: 'Overview' },
  { href: '/sessions', label: 'Sesi' },
  { href: '/revenue', label: 'Pendapatan' },
  { href: '/frames', label: 'Frame' },
  { href: '/pricing', label: 'Harga' },
  { href: '/output', label: 'Output' },
  { href: '/timers', label: 'Timer' },
  { href: '/camera', label: 'Kamera' },
  { href: '/printer', label: 'Printer' },
  { href: '/health', label: 'Kesehatan' },
  { href: '/logs', label: 'Log' },
  { href: '/settings', label: 'Pengaturan' },
]

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()

  const handleLogout = async () => {
    await signOut()
    router.push('/login')
  }

  return (
    <div className="flex min-h-screen">
      <aside className="web-shell w-64 text-cream p-4 flex flex-col">
        <div className="mb-8">
          <img src="/logo.png" alt="Chamera" className="w-36 object-contain" />
          <p className="mt-2 text-sm font-bold opacity-90">Admin Dashboard</p>
        </div>
        
        <nav className="flex-1 space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-cream text-cherry'
                    : 'hover:bg-cream/20 text-cream opacity-90 hover:opacity-100'
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
        
        <button
          onClick={handleLogout}
          className="w-full mt-4 px-3 py-2 rounded-lg text-sm bg-char/40 text-cream opacity-90 hover:opacity-100"
        >
          Logout
        </button>
      </aside>
      
      <main className="flex-1 p-8 overflow-auto">
        {children}
      </main>
    </div>
  )
}
