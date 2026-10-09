'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

const PUBLIC_API = process.env.NEXT_PUBLIC_API_URL || 'https://domain.com/api/public'

interface DownloadFile {
  type: string
  s3_key: string
  url?: string | null
}

export default function DownloadPage() {
  const params = useParams()
  const code = typeof params?.code === 'string' ? params.code : Array.isArray(params?.code) ? params.code[0] : null
  
  const [status, setStatus] = useState<'loading' | 'processing' | 'ready' | 'error'>('loading')
  const [files, setFiles] = useState<DownloadFile[]>([])
  const [error, setError] = useState<string>('')
  const [expiresAt, setExpiresAt] = useState<string>('')

  useEffect(() => {
    if (!code) {
      setStatus('error')
      setError('Kode tidak valid')
      return
    }
    
    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout>
    
    async function fetchDownloads() {
      if (cancelled) return
      try {
        const res = await fetch(`${PUBLIC_API}/download/${code}`)
        const data = await res.json()
        
        if (cancelled) return
        
        if (res.status === 202 || data.status === 'processing') {
          setStatus('processing')
          setError(data.message)
          retryTimer = setTimeout(fetchDownloads, 3000)
        } else if (res.ok && data.status === 'ready') {
          setStatus('ready')
          setFiles(data.files || [])
          setExpiresAt(data.expires_at)
        } else {
          setStatus('error')
          setError(data.message || data.error || 'File tidak ditemukan')
        }
      } catch (err) {
        if (!cancelled) {
          setStatus('error')
          setError('Gagal mengambil file')
        }
      }
    }
    
    fetchDownloads()
    
    return () => {
      cancelled = true
      clearTimeout(retryTimer)
    }
  }, [code])

  return (
    <main className="flex flex-col items-center justify-center min-h-screen p-8 bg-cream">
      <div className="max-w-md w-full">
        <div className="card text-center mb-6">
          <h1 className="text-4xl font-bold text-cherry mb-2">chamera</h1>
          <p className="text-lg text-char">
            Download hasil foto kamu
          </p>
        </div>
        
        {status === 'loading' && (
          <div className="text-center text-char opacity-75">
            Memuat...
          </div>
        )}
        
        {status === 'processing' && (
          <div className="card text-center">
            <div className="mb-4">
              <div className="w-12 h-12 border-4 border-cherry border-t-transparent rounded-full animate-spin mx-auto" />
            </div>
            <p className="text-char opacity-75">
              {error}
            </p>
          </div>
        )}
        
        {status === 'ready' && files.length > 0 && (
          <div className="space-y-4">
            {files.map((file) => (
              <div key={file.type} className="card">
                <div className="font-bold text-char mb-2">
                  {file.type === 'strip' && 'Strip Photo'}
                  {file.type === 'gif' && 'GIF Animation'}
                  {file.type === 'live_h265' && 'Live Photo (High Quality)'}
                  {file.type === 'live_h264' && 'Live Photo'}
                </div>
                {file.url ? (
                  <a
                    href={file.url}
                    download
                    className="btn-primary w-full block text-center"
                  >
                    Download
                  </a>
                ) : (
                  <button className="btn-primary w-full" disabled>
                    Belum tersedia
                  </button>
                )}
              </div>
            ))}
            
            <div className="text-xs text-char opacity-50 text-center">
              File expires: {new Date(expiresAt).toLocaleDateString('id-ID')}
            </div>
            
            <div className="text-sm text-cherry text-center mt-6">
              #WearYourChamera
            </div>
          </div>
        )}
        
        {status === 'error' && (
          <div className="card text-center">
            <p className="text-cherry mb-4">⚠️ {error}</p>
            <p className="text-sm text-char opacity-75">
              Coba refresh halaman atau periksa kode QR kamu
            </p>
          </div>
        )}
      </div>
    </main>
  )
}
