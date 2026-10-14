import type { Metadata } from 'next'
import '../styles/globals.css'

export const metadata: Metadata = {
  title: 'Chamera - Download',
  description: 'Download your photos',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="id">
      <body className="web-shell font-sans min-h-screen">
        {children}
      </body>
    </html>
  )
}
