import type { Metadata, Viewport } from 'next'
import '../styles/globals.css'
import { KioskRuntime } from '../components/KioskRuntime'

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
        {children}
      </body>
    </html>
  )
}
