import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Satu domain dengan admin (Vercel Services): aset /_next harus di bawah /download agar tidak terarah ke admin
  basePath: '/download',
  images: {
    unoptimized: true
  }
}

export default nextConfig
