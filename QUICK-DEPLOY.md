# Quick Start: Deploy 3 Project Terpisah

Karena Vercel Services untuk Express bermasalah, ikuti panduan ini:

## 1. Deploy Cloud API

**Via Vercel Dashboard:**
1. Add New → Project
2. Pilih repository `charmera-website`
3. **Root Directory:** `apps/cloud-api`
4. **Framework Preset:** Other
5. **Build Command:** `npm run build`
6. **Output Directory:** `dist`
7. **Install Command:** `npm install`

**Environment Variables:**
```
SUPABASE_URL=https://oktolrfbccvbwiseiifh.supabase.co/
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9rdG9scmZiY2N2Yndpc2VpaWZoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MTQ0MzAxNSwiZXhwIjoyMTA3MDE5MDE1fQ.3gG_kboknpBNNsb00tjAMFyV29ZbpxAEDKjOjNduuaw
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9rdG9scmZiY2N2Yndpc2VpaWZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0NDMwMTUsImV4cCI6MjEwNzAxOTAxNX0.JBFDdP7DnOatNQDnwlmejcT7a2asasIc0a0vjGf1aA0
S3_REGION=auto
S3_BUCKET=charmera-assets
S3_ACCESS_KEY_ID=8e1b371d17278f1af9136cd143d95870
S3_SECRET_ACCESS_KEY=2f2a5f5551295203e9255e1270d90d2f7e79d309d21136ceb073518f665c2635
S3_ENDPOINT=https://e855d5fd3b21004032c9a6cb9a226e28.r2.cloudflarestorage.com/
NODE_ENV=production
```

## 2. Deploy Download Page

**Via Vercel Dashboard:**
1. Add New → Project
2. Pilih repository yang sama
3. **Root Directory:** `apps/download`
4. **Framework Preset:** Next.js
5. **Build Command:** `npm run build`
6. **Output Directory:** `.next`

**Environment Variables:**
```
NEXT_PUBLIC_API_URL=https://[cloud-api-url]/api/public
NEXT_PUBLIC_SUPABASE_URL=https://oktolrfbccvbwiseiifh.supabase.co/
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9rdG9scmZiY2N2Yndpc2VpaWZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0NDMwMTUsImV4cCI6MjEwNzAxOTAxNX0.JBFDdP7DnOatNQDnwlmejcT7a2asasIc0a0vjGf1aA0
```

## 3. Deploy Admin Dashboard

**Via Vercel Dashboard:**
1. Add New → Project
2. Pilih repository yang sama
3. **Root Directory:** `apps/admin`
4. **Framework Preset:** Next.js
5. **Build Command:** `npm run build`
6. **Output Directory:** `.next`

**Environment Variables:**
```
NEXT_PUBLIC_SUPABASE_URL=https://oktolrfbccvbwiseiifh.supabase.co/
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9rdG9scmZiY2N2Yndpc2VpaWZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0NDMwMTUsImV4cCI6MjEwNzAxOTAxNX0.JBFDdP7DnOatNQDnwlmejcT7a2asasIc0a0vjGf1aA0
NEXT_PUBLIC_ADMIN_API_URL=https://[cloud-api-url]
```

## 4. Update Cloud API

Setelah download & admin di-deploy, update cloud-api env:
```
ADMIN_ORIGIN=https://[admin-url]
```

## 5. Test

```bash
# Cloud API
curl https://[cloud-api-url]/api/health

# Download
curl https://[download-url]/download/test

# Admin
curl -I https://[admin-url]/
```
