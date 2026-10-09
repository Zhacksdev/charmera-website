# 12. Setup dan Deploy

## Prasyarat

Di cloud: Node.js 20 LTS, pnpm, akun Supabase, bucket S3, dan server (atau Vercel + VPS) untuk `cloud-api`, `admin`, dan `download`.

Di laptop booth: Node.js 20 LTS, ffmpeg, kamera, printer 4R terpasang di OS, dan SSD dengan ruang bebas minimal 20 GB (rekomendasi awal: CPU 4 core, RAM 8 GB).

## Environment variables

```
# apps/kiosk (laptop booth)
NEXT_PUBLIC_BOOTH_API_URL=http://127.0.0.1:4000

# apps/booth-api (laptop booth)
BOOTH_API_HOST=127.0.0.1
BOOTH_API_PORT=4000
DATA_DIR=./data
DEVICE_API_URL=https://device.domain.com
DEVICE_KEY=
OPERATOR_PIN_HASH=
PUBLIC_BASE_URL=https://domain.com
TZ=Asia/Jakarta

# apps/cloud-api
PORT=4000
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=
S3_REGION= · S3_BUCKET= · S3_ACCESS_KEY_ID= · S3_SECRET_ACCESS_KEY= · S3_ENDPOINT=
ADMIN_ORIGIN=https://admin.domain.com
DEVICE_KEY_SECRET=

# apps/admin
NEXT_PUBLIC_ADMIN_API_URL=https://api-admin.domain.com
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# apps/download
PUBLIC_API_URL=https://domain.com
```

Jangan commit nilai rahasia. Sediakan `.env.example` tanpa nilai.

## Langkah setup

1. Clone repo, `pnpm install`.
2. Buat project Supabase, jalankan migrasi `supabase/migrations`, buat user admin pertama (aktifkan MFA) dan isi `admin_users`.
3. Buat bucket S3 privat dan atur lifecycle rule cadangan. Upload dari booth dilakukan Sync worker (Node) lewat presigned URL, jadi CORS tidak diperlukan untuk upload.
4. Deploy `cloud-api` dengan tiga router di host terpisah lewat reverse proxy (`domain.com/api/public`, `device.domain.com`, `api-admin.domain.com`), lalu deploy `download` dan `admin`. Isi `.env` masing-masing.
5. Daftarkan booth di dashboard untuk mendapatkan `DEVICE_KEY`.
6. Di dashboard, unggah frame green screen, lalu atur harga, timer, output, kamera, dan printer. Pastikan config tiba di booth.
7. Di laptop booth: isi `.env`, jalankan `booth-api` dan `kiosk` (pm2 atau service OS), buka Chrome `--kiosk` ke alamat kiosk lokal, lalu jalankan pre-flight dari panel operator (kamera, Test Print, sync).
8. Uji end to end dengan internet menyala, lalu cabut internet: satu sesi penuh harus tetap selesai, tercetak, dan tersinkron setelah internet kembali.
