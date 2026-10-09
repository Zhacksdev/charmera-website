# Cara Running — Chamera Photobooth

Panduan menjalankan sistem secara lokal (development) sampai siap dipakai di booth.

---

## Prasyarat

| Komponen | Versi | Wajib? |
|----------|-------|--------|
| Node.js | 20+ (tes di 24) | Ya |
| pnpm | 9+ | Ya |
| ffmpeg | 8.x | Hanya untuk render GIF & Live Photo |
| Printer 4R + driver | - | Hanya untuk mode print fisik |
| Browser | Chrome/Edge terbaru | Ya |

```bash
# Install dependensi sekali di root
pnpm install
```

---

## Menjalankan (3 Terminal)

### Terminal 1 — Booth API (wajib)

```bash
cd apps/booth-api
npx tsx src/server.ts
```

Tunggu log berikut (boot pertama otomatis men-seed config + 1 frame contoh):

```
INFO: Default config + 1 contoh frame di-seed (boot pertama / offline mode)
INFO: Booth API listening on http://127.0.0.1:4000
```

> `tsx watch src/server.ts` juga bisa dipakai (auto-restart saat kode berubah).
> Jalankan **hanya satu instance** — dua instance menyebabkan `EADDRINUSE`.

### Terminal 2 — Kiosk (wajib)

```bash
cd apps/kiosk
npx next dev
```

Buka **http://localhost:3000** — tombol Start aktif setelah preflight hijau (±3 detik).

### Terminal 3 (opsional) — Download page

```bash
cd apps/download
npx next dev
```

Buka `http://localhost:3001/download/<kode-sesi>` setelah ada sesi selesai.

### Opsional lainnya

| App | Perintah | URL | Catatan |
|-----|----------|-----|---------|
| Admin dashboard | `cd apps/admin && npx next dev` | http://localhost:3002 | Perlu `NEXT_PUBLIC_SUPABASE_URL` + `ANON_KEY` di `.env` |
| Cloud API | `cd apps/cloud-api && PORT=4001 npx tsx src/server.ts` | http://localhost:4001 | Default PORT=4000, **bentrok dengan booth-api** — wajib set PORT lain |

---

## Mode Offline vs Online

| | Offline (default dev) | Online |
|--|----------------------|--------|
| Syarat | `DEVICE_API_URL` kosong | `DEVICE_API_URL` + `DEVICE_KEY` diisi di `.env` |
| Config | Auto-seed lokal | Ditarik dari cloud tiap 60 detik |
| Sync outbox | Menumpuk di SQLite (aman), terkirim saat online | Terkirim otomatis dengan backoff |
| Render & print | Jalan normal | Jalan normal |

Sesi, render, dan print **selalu jalan lokal** — internet hanya dipakai untuk sinkronisasi dan halaman download.

---

## Uji Cepat End-to-End

Dengan booth-api berjalan, di terminal terpisah:

```bash
cd apps/booth-api

# mode strip saja (cepat)
node scripts/e2e-check.mjs

# mode penuh: strip + GIF + live photo (butuh ffmpeg, ±10-60 detik)
node scripts/e2e-full.mjs
```

Output `=== E2E PASS ===` berarti pipeline render sehat. File hasil ada di `apps/booth-api/data/outputs/`.

---

## Mode Kiosk Chrome (untuk laptop booth)

```bash
# Linux
google-chrome --kiosk http://localhost:3000

# Windows
"C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk http://localhost:3000
```

PENTING: akses **harus via `localhost`**, bukan IP. `getUserMedia` (kamera) diblokir browser pada origin non-HTTPS non-localhost. Jika harus via IP:

```bash
google-chrome --unsafely-treat-insecure-origin-as-secure=http://192.168.1.10:3000 --kiosk http://192.168.1.10:3000
```

---

## Variabel Environment (`.env` di `apps/booth-api`)

| Variabel | Default | Fungsi |
|----------|---------|--------|
| `BOOTH_API_HOST` | `127.0.0.1` | Bind address booth-api |
| `BOOTH_API_PORT` | `4000` | Port booth-api |
| `KIOSK_ORIGINS` | `http://localhost:3000,...` | Whitelist CORS, pisah koma |
| `DATA_DIR` | `./data` | Lokasi SQLite + foto + output |
| `OPERATOR_PIN_HASH` | - | SHA256 PIN panel operator |
| `DEVICE_API_URL` | kosong (offline) | URL cloud API untuk sync |
| `DEVICE_KEY` | - | Key autentikasi device |
| `PUBLIC_BASE_URL` | `https://domain.com` | Base URL yang di-encode ke QR |
| `FFMPEG_PATH` | `ffmpeg` | Lokasi binary ffmpeg |

---

## Troubleshooting

### "Konfigurasi gagal dimuat" / tombol Start mati
1. Cek Terminal 1 — booth-api harus menampilkan `Booth API listening`.
2. Pesan error di layar kiosk sekarang spesifik: ikuti petunjuknya.
3. Preflight retry otomatis tiap 3 detik — tunggu, tidak perlu refresh.
4. Pastikan booth-api di-restart setelah update kode (fix CORS butuh restart).

### `EADDRINUSE: port 4000`
Ada booth-api lain masih jalan (kemungkinan `tsx watch` + instance manual bersamaan):
```bash
fuser -k 4000/tcp        # bunuh pemegang port 4000
# lalu jalankan satu instance saja
```

### `Camera error: AbortError`
Normal di dev mode (React StrictMode double-mount) — sudah ditangani hook. Abaikan jika hanya muncul sesaat saat hot-reload. Jika kamera benar-benar hitam: tutup aplikasi lain yang memakai kamera (Zoom/Teams), lalu refresh.

### Warning "Disk menipis"
Angka disk kini dibaca dari disk fisik server via `statfs` (bukan kuota browser). Warning muncul hanya jika disk real < 10 GB; error < 5 GB. Cek nilai sebenarnya:
```bash
curl -s http://127.0.0.1:4000/api/status | grep disk
```

### `ENOTFOUND device.domain.com` di log
Mode offline tanpa `DEVICE_API_URL` — sudah diperbaiki: puller tidak start jika env kosong. Jika masih muncul, `.env` memuat nilai lama; hapus/komentari `DEVICE_API_URL`.

### `no such table` saat seed manual
Jalankan seed **setelah** server selesai migrasi (tunggu log `listening`). Dengan auto-seed saat ini, seed manual tidak lagi diperlukan.

### Reset total data
```bash
cd apps/booth-api
rm -rf data       # SQLite + foto + outputs terhapus
# restart booth-api → auto-seed berjalan lagi
```

---

## Ringkasan URL

| Layanan | URL |
|---------|-----|
| Kiosk | http://localhost:3000 |
| Panel Operator | http://localhost:3000/operator |
| Booth API | http://127.0.0.1:4000 |
| Health check | http://127.0.0.1:4000/health |
| Download page | http://localhost:3001/download/{kode} |
| Admin dashboard | http://localhost:3002 |
| Cloud API (opsional) | http://localhost:4001 |
