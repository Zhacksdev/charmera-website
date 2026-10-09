# Setup Online — Chamera Photobooth

Panduan menghubungkan booth lokal ke cloud: Supabase (database + auth), S3/R2 (storage), cloud-api, admin dashboard, dan halaman download.

---

## 0. Gambaran Alur Online

```
BOOTH (laptop)                          CLOUD
├─ Kiosk          ─── render lokal ──→  S3/R2         (foto via presigned PUT)
├─ Booth API      ─── config pull  ──→  Cloud API     → Supabase (settings, frames)
├─ Booth API      ─── sync outbox  ──→  Cloud API     → Supabase (sessions, outputs)
└─ Sync worker    ─── heartbeat    ──→  Cloud API     → Supabase (booths)

PHONE ──→ Download page ──→ Public API ──→ Supabase + presigned GET ke S3
ADMIN ──→ Admin dashboard ──→ Admin API ──→ Supabase (semua tabel)
```

Yang dibutuhkan:
- Akun **Supabase** (database + auth admin)
- Akun **S3 / Cloudflare R2** (penyimpanan file hasil)
- Tempat menjalankan **cloud-api** (localhost dulu, server/Vercel nanti)

---

## 1. Setup Supabase

### 1.1 Buat project
1. Buka https://supabase.com → **New project**
2. Simpan **database password** (tidak ditampilkan lagi)

### 1.2 Jalankan migrasi
Buka **SQL Editor** di dashboard Supabase dan jalankan isi file berikut satu per satu, sesuai urutan:

1. `supabase/migrations/20260101000000_initial_schema.sql`
2. `supabase/migrations/20260101000001_admin_auth.sql`
3. `supabase/migrations/20260101000002_online_fixes.sql`

Migrasi awal menyiapkan tabel, policy dasar, satu booth ber-ID tetap, dan row settings. Migrasi admin menambahkan trigger signup dan mengganti policy `admin_users` agar syarat MFA tidak dibuat sebagai policy permisif terpisah. Migrasi online memperbaiki database dari schema versi lama tanpa menghapus tabel atau data.

Verifikasi di **Table Editor**: tabel `booths`, `settings`, `frames`, `sessions`, `outputs`, `device_commands`, `admin_users`, dan lainnya muncul. Untuk project baru, jalankan ketiga file. Untuk project yang migrasi awalnya sudah berhasil, **jangan jalankan ulang migrasi awal**; jalankan `000002_online_fixes.sql` untuk perbaikan online. Jika `000001_admin_auth.sql` sebelumnya gagal dengan `relation "admin_users" already exists`, jalankan versi file yang sudah diperbaiki ini, lalu lanjutkan `000002`.

Jika migrasi online gagal saat membuat unique constraint `outputs_session_type_unique`, periksa duplikat sebelum mengubah data:

```sql
select session_id, type, count(*)
from public.outputs
group by session_id, type
having count(*) > 1;
```

Constraint tidak dapat dibuat sampai setiap pasangan `(session_id, type)` hanya memiliki satu baris. Jangan hapus baris produksi tanpa memastikan output duplikatnya aman dihapus.

### 1.3 Ambil kunci API
**Project Settings → API**:
- `Project URL` → `SUPABASE_URL`
- `anon public` → `SUPABASE_ANON_KEY` (untuk verifikasi JWT admin)
- `service_role` → `SUPABASE_SERVICE_ROLE_KEY` (⚠️ rahasia, hanya untuk cloud-api server)

### 1.4 Buat admin user
1. **Authentication → Users → Add user** → isi email + password (email konfirmasi bisa dimatikan untuk dev)
2. Jadikan admin lewat **SQL Editor**:

```sql
insert into admin_users (user_id, role)
select id, 'admin' from auth.users where email = 'admin@contoh.com'
on conflict (user_id) do nothing;
```

> Policy tabel `admin_users` mensyaratkan JWT dengan assurance level `aal2` untuk akses langsung memakai anon key. Admin dashboard seharusnya memakai Admin API; service role hanya digunakan di sisi server cloud dan melewati RLS. Aktifkan/enroll MFA untuk admin sebelum akses langsung dengan JWT `aal2`.

---

## 2. Setup Storage (S3 / Cloudflare R2)

### 2.1 AWS S3
1. Buat bucket (private, tanpa public access)
2. **IAM**: buat user dengan policy `s3:PutObject`, `s3:GetObject` pada bucket tersebut
3. Simpan `Access Key ID` + `Secret Access Key`

### 2.2 Cloudflare R2 (alternatif murah, egress gratis)
1. Dashboard R2 → **Create bucket**
2. R2 → **Manage API Tokens** → create token → catat `Access Key ID`, `Secret Access Key`, dan **S3 Endpoint** (`https://<accountid>.r2.cloudflarestorage.com`)

---

## 3. Device Key (autentikasi booth)

Generate key di mesin booth:

```bash
openssl rand -hex 32        # → ini DEVICE_KEY (disimpan di .env booth)
echo -n "1aecbe5d8248bdc139f16d67da7d5534ed7c7381e6bccffffacfbb849cad0278" | sha256sum   # → hash ini untuk SQL
```

Masukkan hash ke Supabase (SQL Editor) — baris booth sudah dibuat migrasi:

```sql
update booths
set device_key_hash = 'HASIL_SHA256_HEX'
where name = 'Main Booth';
```

> ⚠️ Simpan `DEVICE_KEY` seperti password. Yang tersimpan di database hanya hash SHA256.

---

## 4. Jalankan Cloud API

### 4.1 Environment

Buat `apps/cloud-api/.env`:

```env
PORT=4001

SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # service role (rahasia)
SUPABASE_ANON_KEY=eyJ...           # anon key (verifikasi JWT admin)

S3_REGION=auto
S3_BUCKET=chamera-prod
S3_ACCESS_KEY_ID=xxx
S3_SECRET_ACCESS_KEY=xxx
# S3_ENDPOINT=                     # kosong untuk AWS; isi untuk R2/MinIO

ADMIN_ORIGIN=http://localhost:3002 # origin admin dashboard (CORS)
```

### 4.2 Jalankan

```bash
cd apps/cloud-api
npx tsx src/server.ts
```

Health check: `curl http://localhost:4001/health`

> Untuk produksi, deploy cloud-api ke server/Vercel/Fly dan gunakan domain
> (mis. `api.chamera.com`) + HTTPS. Jangan pernah mengekspos service role ke browser.

---

## 5. Hubungkan Booth

Tambahkan di `apps/booth-api/.env`:

```env
DEVICE_API_URL=http://localhost:4001   # ganti ke https://api.chamera.com saat cloud-api di-deploy
DEVICE_KEY=<key dari langkah 3>
PUBLIC_BASE_URL=http://localhost:3001  # base URL halaman download (lihat bagian 7)
```

Restart booth-api, lalu verifikasi:

```
INFO: Config pulled {"config_version": 1, "frame_count": 1}   ← berhasil tarik dari cloud
```

Jika muncul `Invalid device key` → `DEVICE_KEY` tidak cocok dengan hash di tabel `booths`.

---

## 6. Admin Dashboard

Buat `apps/admin/.env`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
NEXT_PUBLIC_ADMIN_API_URL=http://localhost:4001
```

Jalankan:

```bash
cd apps/admin
npx next dev
```

Buka `http://localhost:3002/login` → login dengan admin user (bagian 1.4).

Halaman yang bisa dicoba:
- **Frames** → upload frame green screen (PNG 1200x1800) → slot terdeteksi otomatis → tersimpan ke S3 + Supabase
- **Harga / Timer / Output / Kamera / Printer** → set nilai → `config_version` naik → booth menarik dalam ±60 detik
- **Kesehatan** → status booth dari heartbeat terakhir

---

## 7. Download Page & QR

`PUBLIC_BASE_URL` di booth menentukan isi QR: `{PUBLIC_BASE_URL}/download/{kode}`.

| Skenario | Nilai `PUBLIC_BASE_URL` |
|----------|------------------------|
| Uji di laptop (HP satu WiFi) | `http://<ip-laptop>:3001` |
| Production | `https://download.chamera.com` |

Jalankan download page dengan env:

`apps/download/.env`:
```env
NEXT_PUBLIC_API_URL=http://localhost:4001/api/public
```

Untuk uji via HP tanpa deploy, gunakan tunnel:

```bash
cloudflared tunnel --url http://localhost:3001
# → https://xxxx.trycloudflare.com  → jadikan PUBLIC_BASE_URL di booth
```

---

## 8. Verifikasi End-to-End

Jalankan sesi dari kiosk sampai HP bisa download:

```bash
# 1. Ketiga service jalan: booth-api (:4000), cloud-api (:4001), download (:3001)

# 2. Selesaikan satu sesi di kiosk (atau:
node apps/booth-api/scripts/e2e-check.mjs

# 3. Booth log harus menunjukkan:
#    "Item synced" → metadata sesi terkirim
#    Upload strip → complete → outputs tercatat

# 4. Cek di Supabase Table Editor:
#    - sessions: sync_status = 'synced', status = 'completed'
#    - outputs: baris strip/gif/live dengan s3_key

# 5. Buka halaman download:
curl http://localhost:4001/api/public/download/<KODE_12_KARAKTER>
#    → status: 'ready', files[i].url = presigned URL

# 6. Buka http://localhost:3001/download/<KODE> → tombol Download berfungsi
```

---

## 9. Catatan Keamanan

| Aturan | Alasan |
|--------|--------|
| `SERVICE_ROLE_KEY` hanya di cloud-api (server) | Bypass RLS — bisa baca/tulis semua tabel |
| `DEVICE_KEY` hanya di booth + hash di DB | Booth tidak boleh bisa baca data user lain |
| `SUPABASE_ANON_KEY` boleh di browser | Diproteksi RLS + verifikasi JWT di Admin API |
| Booth API bind `127.0.0.1` | Tidak bisa diakses dari luar laptop |
| Rate limit per surface | Public 100/menit, Device 600, Admin 300 |
| Kunci env tidak di-commit | `.env` sudah di `.gitignore` |

---

## 10. Deployment Produksi (ringkas)

| Komponen | Opsi hosting |
|----------|--------------|
| cloud-api | Vercel / Fly.io / VPS (butuh HTTPS) |
| download page | Vercel (cocok Next.js) |
| admin dashboard | Vercel |
| Domain | Arahkan subdomain: `api.`, `download.`, `admin.` |

Langkah sama seperti di atas — cukup ganti semua URL localhost dengan domain publik, lalu perbarui `DEVICE_API_URL` (booth), `PUBLIC_BASE_URL` (booth), `ADMIN_ORIGIN` (cloud-api), dan `NEXT_PUBLIC_ADMIN_API_URL` (admin).
