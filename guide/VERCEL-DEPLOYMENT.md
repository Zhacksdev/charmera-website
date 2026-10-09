# Vercel Deployment Guide — Chamera Photobooth

Panduan lengkap deploy cloud-api, download page, dan admin dashboard ke Vercel.

---

## Prasyarat

- Akun Vercel (https://vercel.com)
- Repository sudah di GitHub/GitLab/Bitbucket
- Supabase project sudah setup (migrasi sudah dijalankan)
- R2 bucket sudah dikonfigurasi
- Vercel CLI (opsional, untuk deploy dari terminal)

---

## Arsitektur Deployment

```
┌─────────────────────────────────────────────────────────────┐
│                        VERCEL                                │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  api.chamera.com        → cloud-api (Express)               │
│  download.chamera.com   → download page (Next.js)           │
│  admin.chamera.com      → admin dashboard (Next.js)         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                     SUPABASE + R2                            │
│                                                              │
│  Supabase: Database, Auth, RLS                               │
│  R2: Storage untuk foto hasil                                │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                          ▲
                          │
┌─────────────────────────────────────────────────────────────┐
│                      BOOTH (Laptop)                          │
│                                                              │
│  kiosk.chamera.local    → Next.js UI (localhost:3000)       │
│  booth-api.local        → Express + SQLite (localhost:4000) │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Daftar Environment Variables

### Cloud API (apps/cloud-api/.env)

```env
# Server
PORT=4001
NODE_ENV=production

# Supabase
SUPABASE_URL=https://oktolrfbccvbwiseiifh.supabase.co/
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9rdG9scmZiY2N2Yndpc2VpaWZoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MTQ0MzAxNSwiZXhwIjoyMTA3MDE5MDE1fQ.3gG_kboknpBNNsb00tjAMFyV29ZbpxAEDKjOjNduuaw
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9rdG9scmZiY2N2Yndpc2VpaWZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0NDMwMTUsImV4cCI6MjEwNzAxOTAxNX0.JBFDdP7DnOatNQDnwlmejcT7a2asasIc0a0vjGf1aA0

# Cloudflare R2 (S3-compatible)
S3_REGION=auto
S3_BUCKET=charmera-assets
S3_ACCESS_KEY_ID=8e1b371d17278f1af9136cd143d95870
S3_SECRET_ACCESS_KEY=2f2a5f5551295203e9255e1270d90d2f7e79d309d21136ceb073518f665c2635
S3_ENDPOINT=https://e855d5fd3b21004032c9a6cb9a226e28.r2.cloudflarestorage.com/

# CORS (ganti dengan domain admin yang sebenarnya)
ADMIN_ORIGIN=https://admin.chamera.com
```

### Download Page (apps/download/.env)

```env
# API endpoint untuk public API
NEXT_PUBLIC_API_URL=https://api.chamera.com/api/public
```

### Admin Dashboard (apps/admin/.env)

```env
# Supabase (client-side)
NEXT_PUBLIC_SUPABASE_URL=https://oktolrfbccvbwiseiifh.supabase.co/
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9rdG9scmZiY2N2Yndpc2VpaWZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0NDMwMTUsImV4cCI6MjEwNzAxOTAxNX0.JBFDdP7DnOatNQDnwlmejcT7a2asasIc0a0vjGf1aA0

# Admin API endpoint
NEXT_PUBLIC_ADMIN_API_URL=https://api.chamera.com
```

---

## Langkah 1: Persiapan Repository

### 1.1 Push ke GitHub (jika belum)

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/username/chamera-website.git
git push -u origin main
```

### 1.2 Pastikan .gitignore benar

```gitignore
# Environment variables
.env
.env.local
.env.*.local

# Dependencies
node_modules/

# Build outputs
dist/
.next/

# OS files
.DS_Store
Thumbs.db
```

---

## Langkah 2: Setup Project di Vercel

### 2.1 Login ke Vercel

1. Buka https://vercel.com
2. Login dengan GitHub/GitLab/Bitbucket
3. Klik **"Add New..." → "Project"**

### 2.2 Import Repository

1. Pilih repository `chamera-website`
2. Klik **Import**

---

## Langkah 3: Deploy Cloud API

### 3.1 Konfigurasi Project

Di halaman "Configure Project":

| Field | Value |
|-------|-------|
| **Framework Preset** | Other |
| **Root Directory** | `apps/cloud-api` |
| **Build Command** | `npm run build` |
| **Output Directory** | `dist` |
| **Install Command** | `npm install` |

### 3.2 Set Environment Variables

Klik **"Environment Variables"** dan tambahkan:

```
SUPABASE_URL=https://oktolrfbccvbwiseiifh.supabase.co/
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9rdG9scmZiY2N2Yndpc2VpaWZoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MTQ0MzAxNSwiZXhwIjoyMTA3MDE5MDE1fQ.3gG_kboknpBNNsb00tjAMFyV29ZbpxAEDKjOjNduuaw
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9rdG9scmZiY2N2Yndpc2VpaWZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0NDMwMTUsImV4cCI6MjEwNzAxOTAxNX0.JBFDdP7DnOatNQDnwlmejcT7a2asasIc0a0vjGf1aA0
S3_REGION=auto
S3_BUCKET=charmera-assets
S3_ACCESS_KEY_ID=8e1b371d17278f1af9136cd143d95870
S3_SECRET_ACCESS_KEY=2f2a5f5551295203e9255e1270d90d2f7e79d309d21136ceb073518f665c2635
S3_ENDPOINT=https://e855d5fd3b21004032c9a6cb9a226e28.r2.cloudflarestorage.com/
ADMIN_ORIGIN=https://admin.chamera.com
NODE_ENV=production
```

### 3.3 Deploy

1. Klik **Deploy**
2. Tunggu hingga selesai (±2-3 menit)
3. Catat URL deployment, misal: `https://chamera-website-xyz.vercel.app`

### 3.4 Set Custom Domain (Opsional)

1. Buka project di Vercel Dashboard
2. Settings → Domains
3. Tambahkan: `api.chamera.com`
4. Update DNS records sesuai instruksi Vercel

---

## Langkah 4: Deploy Download Page

### 4.1 Buat Project Baru

1. Klik **"Add New..." → "Project"**
2. Pilih repository yang sama: `chamera-website`
3. Klik **Import**

### 4.2 Konfigurasi Project

| Field | Value |
|-------|-------|
| **Framework Preset** | Next.js |
| **Root Directory** | `apps/download` |
| **Build Command** | `npm run build` |
| **Output Directory** | `.next` |
| **Install Command** | `npm install` |

### 4.3 Set Environment Variables

```
NEXT_PUBLIC_API_URL=https://api.chamera.com/api/public
```

> Ganti `api.chamera.com` dengan URL cloud-api yang sebenarnya

### 4.4 Deploy

1. Klik **Deploy**
2. Catat URL, misal: `https://chamera-website-abc.vercel.app`

### 4.5 Set Custom Domain (Opsional)

Settings → Domains → Tambahkan: `download.chamera.com`

---

## Langkah 5: Deploy Admin Dashboard

### 5.1 Buat Project Baru

1. Klik **"Add New..." → "Project"**
2. Pilih repository yang sama: `chamera-website`
3. Klik **Import**

### 5.2 Konfigurasi Project

| Field | Value |
|-------|-------|
| **Framework Preset** | Next.js |
| **Root Directory** | `apps/admin` |
| **Build Command** | `npm run build` |
| **Output Directory** | `.next` |
| **Install Command** | `npm install` |

### 5.3 Set Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=https://oktolrfbccvbwiseiifh.supabase.co/
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9rdG9scmZiY2N2Yndpc2VpaWZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0NDMwMTUsImV4cCI6MjEwNzAxOTAxNX0.JBFDdP7DnOatNQDnwlmejcT7a2asasIc0a0vjGf1aA0
NEXT_PUBLIC_ADMIN_API_URL=https://api.chamera.com
```

### 5.4 Deploy

1. Klik **Deploy**
2. Catat URL, misal: `https://chamera-website-def.vercel.app`

### 5.5 Set Custom Domain (Opsional)

Settings → Domains → Tambahkan: `admin.chamera.com`

---

## Langkah 6: Update Environment Variables Cross-Reference

Setelah semua project di-deploy dan punya URL masing-masing:

### 6.1 Update Cloud API

Di Vercel Dashboard → cloud-api project → Settings → Environment Variables:

```
ADMIN_ORIGIN=https://admin.chamera.com
```

> Atau URL admin yang sebenarnya jika belum pakai custom domain

### 6.2 Update Download Page

```
NEXT_PUBLIC_API_URL=https://api.chamera.com/api/public
```

### 6.3 Update Admin Dashboard

```
NEXT_PUBLIC_ADMIN_API_URL=https://api.chamera.com
```

### 6.4 Redeploy Semua Project

Setelah update environment variables, redeploy semua 3 project agar perubahan efektif.

---

## Langkah 7: Update Booth Configuration

Di laptop booth, update file `apps/booth-api/.env`:

```env
# Cloud API endpoint
DEVICE_API_URL=https://api.chamera.com

# Download page base URL (untuk QR code)
PUBLIC_BASE_URL=https://download.chamera.com

# Device key (sudah ada)
DEVICE_KEY=<device_key_anda>
```

Restart booth-api:

```bash
cd apps/booth-api
pnpm dev
```

Verifikasi koneksi ke cloud:

```bash
# Check log untuk melihat config pull berhasil
# Harus muncul: "Config pulled {"config_version": X, "frame_count": Y}"
```

---

## Langkah 8: Verifikasi End-to-End

### 8.1 Test Cloud API

```bash
# Health check
curl https://api.chamera.com/health

# Expected response: {"status":"ok"}
```

### 8.2 Test Admin Dashboard

1. Buka `https://admin.chamera.com`
2. Login dengan admin user
3. Cek halaman Frames, Settings, Statistics

### 8.3 Test Download Page

1. Buka `https://download.chamera.com`
2. Masukkan kode session yang sudah selesai
3. Verifikasi file bisa didownload

### 8.4 Test Booth Sync

1. Jalankan session di kiosk
2. Setelah selesai, cek log booth-api:
   ```
   "Item synced" → session metadata terkirim
   "Upload strip → complete" → file tersimpan di R2
   ```
3. Cek Supabase Table Editor:
   - `sessions` table: `sync_status = 'synced'`
   - `outputs` table: ada baris dengan `s3_key`
4. Test download via QR atau halaman download

---

## Deployment via CLI (Alternatif)

Jika prefer deploy dari terminal:

### Install Vercel CLI

```bash
npm i -g vercel
vercel login
```

### Deploy dari Root Project

```bash
# Cloud API
cd apps/cloud-api
vercel --prod

# Download Page
cd ../download
vercel --prod

# Admin Dashboard
cd ../admin
vercel --prod
```

Set environment variables via CLI:

```bash
vercel env add SUPABASE_URL production
# Paste value when prompted
# Repeat for all variables
```

---

## Monorepo Considerations

Karena ini monorepo dengan Turborepo, ada beberapa opsi deployment:

### Opsi A: Deploy Per App (Direkomendasikan)

Setiap app (`cloud-api`, `download`, `admin`) di-deploy sebagai project terpisah di Vercel dengan **Root Directory** yang berbeda. Ini yang sudah dijelaskan di atas.

**Keuntungan:**
- Setiap app independen
- Scaling terpisah
- Logging dan monitoring terpisah

### Opsi B: Turborepo Remote Cache (Advanced)

Setup Turborepo remote cache untuk mempercepat build:

```bash
npx turbo login
npx turbo link
```

Tambahkan di `turbo.json`:

```json
{
  "remoteCache": {
    "enabled": true
  }
}
```

---

## Troubleshooting

### Build Error: "Module not found"

**Masalah:** Dependency dari `packages/*` tidak ditemukan

**Solusi:** Pastikan `Root Directory` benar dan monorepo structure dikenali

### CORS Error di Admin Dashboard

**Masalah:** Request ke API ditolak browser

**Solusi:**
1. Pastikan `ADMIN_ORIGIN` di cloud-api sudah benar
2. Cek header `Access-Control-Allow-Origin` di response API

```bash
curl -I https://api.chamera.com/health
# Look for: access-control-allow-origin: https://admin.chamera.com
```

### Environment Variables Tidak Terbaca

**Masalah:** Env vars `undefined` di runtime

**Solusi:**
1. Pastikan prefix `NEXT_PUBLIC_` untuk client-side variables (Next.js)
2. Redeploy setelah update env vars
3. Cek Vercel Dashboard → Settings → Environment Variables

### R2 Upload Failed

**Masalah:** "Access Denied" saat upload ke R2

**Solusi:**
1. Verifikasi R2 credentials di Supabase dashboard
2. Cek bucket policy di Cloudflare R2
3. Test dengan script:

```javascript
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const client = new S3Client({
  region: 'auto',
  endpoint: 'https://e855d5fd3b21004032c9a6cb9a226e28.r2.cloudflarestorage.com/',
  credentials: {
    accessKeyId: 'YOUR_KEY',
    secretAccessKey: 'YOUR_SECRET'
  }
});

// Test upload
await client.send(new PutObjectCommand({
  Bucket: 'charmera-assets',
  Key: 'test.txt',
  Body: 'test'
}));
```

### QR Code Tidak Bisa Diakses

**Masalah:** QR code menunjukkan 404

**Solusi:**
1. Pastikan `PUBLIC_BASE_URL` di booth-api sudah benar
2. Cek session sudah `sync_status = 'synced'` di database
3. Verifikasi download page bisa diakses publik

---

## Security Checklist

- [ ] `SUPABASE_SERVICE_ROLE_KEY` hanya di cloud-api (server-side)
- [ ] `DEVICE_KEY` tidak di-commit ke git
- [ ] R2 bucket set ke **private** (tidak public)
- [ ] CORS di cloud-api hanya allow origin dari admin dashboard
- [ ] Environment variables Production berbeda dari Development
- [ ] HTTPS di semua endpoints
- [ ] Rate limiting aktif di Public API

---

## Monitoring & Alerts

### Vercel Analytics

1. Buka project di Vercel Dashboard
2. Analytics tab untuk melihat:
   - Page views
   - Performance metrics
   - Errors

### Supabase Dashboard

1. Monitor database size
2. Check API usage
3. Review auth events

### Cloudflare R2

1. Monitor storage usage
2. Check egress traffic (free tier: 10GB/month)
3. Review access logs

---

## Backup & Rollback

### Rollback Deployment

Di Vercel Dashboard:
1. Buka project → Deployments
2. Klik deployment sebelumnya
3. Klik **"Promote to Production"**

### Database Backup

Supabase otomatis backup harian (retention 7 hari untuk free tier).

Manual backup:

```bash
pg_dump $DATABASE_URL > backup.sql
```

---

## Next Steps

1. Setup custom domain untuk branding professional
2. Enable Vercel Analytics untuk monitoring
3. Setup error tracking (Sentry, LogRocket)
4. Configure CI/CD untuk auto-deploy dari main branch
5. Setup staging environment untuk testing

---

## Referensi

- [Vercel Documentation](https://vercel.com/docs)
- [Next.js Deployment](https://nextjs.org/docs/deployment)
- [Turborepo on Vercel](https://turbo.build/repo/docs/core-concepts/monorepos)
- [Supabase Documentation](https://supabase.com/docs)
- [Cloudflare R2](https://developers.cloudflare.com/r2/)
