import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // folder build terpisah bisa dipakai untuk uji build tanpa mengganggu server yang sedang berjalan
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // tablet mengakses dev server lewat Caddy di https://<BOOTH_HOST>:8443
  allowedDevOrigins: process.env.BOOTH_HOST ? [process.env.BOOTH_HOST] : undefined,
  async rewrites() {
    const boothApiUrl = process.env.BOOTH_API_INTERNAL_URL || 'http://127.0.0.1:4000'
    return [{ source: '/api/:path*', destination: `${boothApiUrl}/api/:path*` }]
  },
  images: {
    unoptimized: true
  }
}

export default nextConfig
