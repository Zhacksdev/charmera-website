# Perbaikan Deployment Chamera

## Masalah yang Ditemukan

1. **Admin upload foto tidak bisa** - CORS dan ADMIN_ORIGIN belum diset
2. **Download mengarah ke domain salah** - Environment variables belum diupdate
3. **Output hanya strip** - Settings di database kosong

## Solusi

### 1. Update Environment Variables di Vercel

Buka setiap project di Vercel Dashboard → Settings → Environment Variables

#### Cloud API Project
Tambahkan/update:
```
ADMIN_ORIGIN=https://[admin-project-url].vercel.app
```
Contoh: `ADMIN_ORIGIN=https://charmera-website-xyz.vercel.app`

#### Download Page Project
Update:
```
NEXT_PUBLIC_API_URL=https://charmera-website-md8a-rouge.vercel.app/api/public
NEXT_PUBLIC_SUPABASE_URL=https://oktolrfbccvbwiseiifh.supabase.co/
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9rdG9scmZiY2N2Yndpc2VpaWZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0NDMwMTUsImV4cCI6MjEwNzAxOTAxNX0.JBFDdP7DnOatNQDnwlmejcT7a2asasIc0a0vjGf1aA0
```

#### Admin Dashboard Project
Update:
```
NEXT_PUBLIC_ADMIN_API_URL=https://charmera-website-md8a-rouge.vercel.app
NEXT_PUBLIC_SUPABASE_URL=https://oktolrfbccvbwiseiifh.supabase.co/
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9rdG9scmZiY2N2Yndpc2VpaWZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0NDMwMTUsImV4cCI6MjEwNzAxOTAxNX0.JBFDdP7DnOatNQDnwlmejcT7a2asasIc0a0vjGf1aA0
```

### 2. Setup Settings di Supabase

Buka Supabase Dashboard → SQL Editor, jalankan:

```sql
-- Insert default settings untuk output full (strip + gif + live)
INSERT INTO settings (key, value, updated_at) VALUES
('price', '50000', NOW()),
('output_mode', 'full', NOW()),
('print_mode', 'auto', NOW()),
('timer_frame_select_sec', '30', NOW()),
('timer_action_countdown_sec', '3', NOW()),
('timer_result_sec', '15', NOW()),
('camera_width', '1920', NOW()),
('camera_height', '1080', NOW()),
('printer_name', 'default', NOW()),
('printer_media_capacity', '100', NOW())
ON CONFLICT (key) DO NOTHING;
```

### 3. Upload Frame di Admin Dashboard

Setelah settings ada:
1. Login ke admin dashboard
2. Buka halaman **Frames**
3. Upload frame PNG dengan green screen (#00FF00)
4. Sistem akan auto-detect slot

### 4. Redeploy Semua Projects

Setelah update environment variables:
1. Buka masing-masing project di Vercel
2. Deployments tab
3. Klik titik tiga `...` di deployment terbaru
4. Pilih **Redeploy**

### 5. Test

```bash
# Test cloud API
curl https://charmera-website-md8a-rouge.vercel.app/api/health

# Test settings
curl "https://oktolrfbccvbwiseiifh.supabase.co/rest/v1/settings?select=*" \
  -H "apikey: YOUR_ANON_KEY"

# Test admin upload (buka di browser)
https://[admin-url]/

# Test download (buka di browser)
https://[download-url]/download/[code]
```

## Urutan Deploy yang Benar

1. **Cloud API** dulu → dapat URL
2. **Admin Dashboard** → set `NEXT_PUBLIC_ADMIN_API_URL` ke cloud API URL
3. **Download Page** → set `NEXT_PUBLIC_API_URL` ke cloud API URL
4. Update **Cloud API** → set `ADMIN_ORIGIN` ke admin dashboard URL
5. Redeploy semua

## Checklist

- [ ] Cloud API deployed dengan URL: `https://charmera-website-md8a-rouge.vercel.app`
- [ ] Admin Dashboard deployed dengan URL: `___________________`
- [ ] Download Page deployed dengan URL: `___________________`
- [ ] Environment variables sudah diupdate di ketiga project
- [ ] Settings sudah diinsert di Supabase
- [ ] Frame sudah diupload via admin dashboard
- [ ] Booth sudah bisa pull config dari cloud
- [ ] Test end-to-end: session → upload → download berhasil
