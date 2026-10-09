import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  async rewrites() {
    const boothApiUrl = process.env.BOOTH_API_INTERNAL_URL || 'http://127.0.0.1:4000'
    return [{ source: '/api/:path*', destination: `${boothApiUrl}/api/:path*` }]
  },
  images: {
    unoptimized: true
  }
}

export default nextConfig
