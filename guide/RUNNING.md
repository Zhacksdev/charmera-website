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
| Browser | Chrome/Edge terbaru; Safari iPad untuk mode tablet HTTPS | Ya |

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

## MVP Tablet Safari di Wi-Fi Booth

Setup ini membuat tablet dan laptop booth memakai satu origin HTTPS. Booth API tetap hanya bind ke `127.0.0.1`; Caddy menjadi reverse proxy lokal. Jangan arahkan API booth ke internet publik: endpoint sesi booth belum memakai autentikasi jaringan.

### Prasyarat

- Tablet dan laptop booth berada di Wi-Fi/LAN yang sama.
- IP laptop booth dibuat tetap melalui DHCP reservation di router.
- DNS lokal/router punya record `booth.home.arpa` yang menunjuk ke IP laptop booth. Jika router tidak mendukung local DNS record, siapkan DNS lokal yang bisa digunakan tablet.
- Port TCP `8443` dari subnet Wi-Fi booth boleh masuk ke laptop; jangan forward port ini dari router ke internet atau jaringan tamu.
- Sertifikat CA lokal Caddy dipasang dan dipercaya oleh iPad. Safari tidak menerima sertifikat internal sebelum CA dipercaya.

### Jalankan

1. Di router, buat DHCP reservation untuk laptop booth dan DNS record lokal `booth.home.arpa` ke IP laptop itu.
2. Instal Caddy di laptop booth. Linux x86_64:

	```bash
	mkdir -p "$HOME/.local/bin"
	curl -fsSL 'https://caddyserver.com/api/download?os=linux&arch=amd64' -o "$HOME/.local/bin/caddy"
	chmod 755 "$HOME/.local/bin/caddy"
	"$HOME/.local/bin/caddy" version
	```

	Untuk Linux ARM64, ganti `arch=amd64` menjadi `arch=arm64`. Caddyfile MVP menggunakan port `8443`, jadi dapat dijalankan sebagai user biasa tanpa membuka port privileged `443`.

3. Hapus `NEXT_PUBLIC_BOOTH_API_URL` dari `apps/kiosk/.env.local` jika sebelumnya diisi. Kiosk memakai path relatif `/api/...`; Next meneruskan path itu ke Booth API melalui rewrite server-side.
4. Jalankan Booth API di terminal pertama:

	```bash
	pnpm --filter @chamera/booth-api dev
	```

	Pastikan log menunjukkan `Booth API listening on http://127.0.0.1:4000`.

5. Jalankan kiosk di terminal kedua:

	```bash
	pnpm --filter @chamera/kiosk dev
	```

	Pastikan kiosk berjalan di port `3000`. Jika port itu sudah digunakan, hentikan instance kiosk lama atau sesuaikan upstream pada Caddyfile.

6. Jalankan Caddy dari root repository di terminal ketiga:

	```bash
	~/.local/bin/caddy run --config deploy/tablet/Caddyfile
	```

	Tunggu sampai Caddy berhasil start dan membuat sertifikat internal untuk `booth.home.arpa`.

7. Ambil **sertifikat root publik** Caddy di laptop:

	```bash
	find "${XDG_DATA_HOME:-$HOME/.local/share}/caddy" -type f -path '*/pki/authorities/local/root.crt' -print
	```

	Transfer hanya `root.crt` ke iPad (misalnya melalui AirDrop). Jangan transfer `root.key`. Di iPad buka file sertifikat untuk memasang configuration profile, kemudian aktifkan kepercayaan penuh di **Settings → General → About → Certificate Trust Settings**.

8. Pastikan Safari/iPad memakai DNS Wi-Fi yang memiliki record `booth.home.arpa`, buka `https://booth.home.arpa:8443`, lalu izinkan akses kamera.

Caddy meneruskan `/api/*` dan `/health` ke `127.0.0.1:4000`; semua route lain diteruskan ke kiosk pada port `3000`. Uji dari tablet:

```text
https://booth.home.arpa:8443/health      -> JSON health Booth API
https://booth.home.arpa:8443/api/status  -> status/config booth
https://booth.home.arpa:8443/            -> kiosk customer
```

Jika nama host tidak ditemukan, periksa local DNS/router. Jika Safari menunjukkan sertifikat tidak dipercaya, CA `root.crt` belum dipasang atau **Certificate Trust Settings** belum diaktifkan.

Jangan isi `NEXT_PUBLIC_BOOTH_API_URL` dengan `127.0.0.1` untuk mode tablet: alamat loopback akan menunjuk ke tablet, bukan laptop booth. URL tersebut sebaiknya tidak disetel agar request API memakai origin HTTPS kiosk yang sama.

### Catatan Safari

Foto memakai kamera browser dan membutuhkan HTTPS tepercaya. Perekam klip saat ini meminta `video/webm`; Safari mungkin tidak mendukung format tersebut. Uji kamera dan satu sesi penuh pada iPad target. Foto diam dapat berjalan, tetapi GIF/Live Photo mungkin memerlukan penyesuaian format recorder sebelum digunakan.

URL QR download adalah pengaturan terpisah: isi `PUBLIC_BASE_URL` dengan URL **Download app** yang benar-benar sudah dideploy, bukan URL kiosk atau Admin.

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
