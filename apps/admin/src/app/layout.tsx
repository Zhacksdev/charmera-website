import type { Metadata } from 'next'
import '../styles/globals.css'

export const metadata: Metadata = {
  title: 'Chamera - Admin Dashboard',
  description: 'Photobooth management dashboard',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="id">
      <body className="bg-cream text-char font-sans min-h-screen">
        {children}
      </body>
    </html>
  )
}
