'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from '../../lib/supabase'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

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
  const [menuOpen, setMenuOpen] = useState(false)

  const handleLogout = async () => {
    await signOut()
    router.push('/login')
  }

  return (
    <div className="min-h-screen lg:flex">
      {/* tablet portrait / layar sempit: bilah atas + tombol menu; lg ke atas: sidebar tetap */}
      <header className="web-shell sticky top-0 z-30 flex items-center justify-between px-4 py-3 lg:hidden">
        <img src="/logo.png" alt="Chamera" className="h-10 w-auto object-contain" />
        <button
          onClick={() => setMenuOpen(true)}
          aria-label="Buka menu"
          aria-expanded={menuOpen}
          className="rounded-lg bg-cream/20 px-3 py-2 text-sm font-bold text-cream"
          style={{ minHeight: 0 }}
        >
          ☰ Menu
        </button>
      </header>

      {menuOpen && <div className="fixed inset-0 z-40 bg-char/50 lg:hidden" onClick={() => setMenuOpen(false)} aria-hidden="true" />}

      <aside
        className={`web-shell fixed inset-y-0 left-0 z-50 flex w-64 flex-col overflow-y-auto p-4 text-cream transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
          menuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="mb-8 flex items-start justify-between">
          <div>
            <img src="/logo.png" alt="Chamera" className="w-36 object-contain" />
            <p className="mt-2 text-sm font-bold opacity-90">Admin Dashboard</p>
          </div>
          <button onClick={() => setMenuOpen(false)} aria-label="Tutup menu" className="rounded-lg px-2 text-xl text-cream lg:hidden" style={{ minHeight: 0 }}>✕</button>
        </div>
        
        <nav className="flex-1 space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
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
      
      <main className="min-w-0 flex-1 p-4 md:p-6 lg:p-8">
        {children}
      </main>
    </div>
  )
}
