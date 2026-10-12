import type { Metadata, Viewport } from 'next'
import '../styles/globals.css'
import { Suspense } from 'react'
import { KioskRuntime } from '../components/KioskRuntime'
import { LongPressReset } from '../components/LongPressReset'

export const metadata: Metadata = {
  title: 'Chamera - Photobooth',
  description: 'Wear your memories',
  appleWebApp: { capable: true, title: 'Chamera', statusBarStyle: 'black-translucent' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#D62839',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="id">
      <body className="kiosk-shell font-sans min-h-screen overflow-hidden">
        <KioskRuntime />
        <Suspense fallback={null}>
          <LongPressReset />
        </Suspense>
        {children}
      </body>
    </html>
  )
}
