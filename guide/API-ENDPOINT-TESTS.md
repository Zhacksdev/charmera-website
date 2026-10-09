# API Endpoint Access and Smoke Test Results

Tanggal pengujian: 2026-10-09

## Ringkasan

Inventaris source menemukan **42 path API unik**: 18 Booth API dan 24 Cloud API. Semua path diuji terhadap server lokal yang terisolasi. Tidak ada credential produksi yang digunakan.

| Kelompok | Path unik | Hasil smoke test |
|---|---:|---|
| Booth API | 18 | Route aktif; alur sesi disposable berhasil; route operator menolak tanpa PIN (`401`) |
| Cloud API | 24 | Health `200`; Public API mencapai validasi; Device dan Admin menolak tanpa token (`401`) |
| URL production yang tersedia | - | URL yang diperiksa melayani Admin, bukan Cloud API; `/api/health` memberi `404` |

Smoke test membuktikan routing dan perilaku handler dasar, bukan integrasi penuh dengan printer fisik, Supabase, atau S3. Endpoint yang menulis data diuji hanya pada database/file sementara di `/tmp`.

## URL Akses

| Service | Base URL | Catatan |
|---|---|---|
| Booth API | `http://127.0.0.1:4000` | Hanya dapat diakses dari laptop booth. Smoke test dijalankan pada port terisolasi `43120`. |
| Cloud API lokal | `http://127.0.0.1:4001` | Smoke test dijalankan pada port terisolasi `43121`, tanpa credential Supabase/S3. |
| Cloud API production | `https://<cloud-api-project>.vercel.app` | URL project Cloud API terpisah belum diberikan, jadi endpoint production Cloud API belum dapat diverifikasi. |
| Admin production yang diuji | `https://charmera-website-md8a-rouge.vercel.app` | `/login` merespons `200`; deployment ini tidak mengekspos Cloud API pada `/api/*`. |
| Download production | `https://<download-project>.vercel.app/download/:code` | URL project download terpisah belum diberikan. |

Contoh health check setelah base URL Cloud API tersedia:

```bash
curl -i https://<cloud-api-project>.vercel.app/health
curl -i https://<cloud-api-project>.vercel.app/api/health
```

## Booth API

Base URL produksi/local booth: `http://127.0.0.1:4000`. Operator endpoint memerlukan header `x-operator-pin` atau PIN di body. Hasil di bawah berasal dari server lokal terisolasi pada port `43120`.

| Method | Path | Hasil | Catatan |
|---|---|---:|---|
| GET | `/health` | 200 | Health JSON |
| POST | `/api/sessions` | 201 | Membuat sesi disposable di SQLite `/tmp` |
| GET | `/api/sessions/:id` | 200 | Dibaca sebelum dan sesudah reset; sesudah reset status sesi `abandoned` |
| PATCH | `/api/sessions/:id/frame` | 200 | Memakai frame seed lokal |
| POST | `/api/sessions/:id/reset` | 200 | Menghapus data turunan sesi disposable |
| POST | `/api/sessions/:id/advance` | 200 | Memajukan state sesi disposable |
| GET | `/api/frames` | 200 | Mengembalikan frame seed lokal |
| POST | `/api/sessions/:sessionId/photos` | 200 | Menulis payload uji ke direktori `/tmp` |
| POST | `/api/sessions/:sessionId/text` | 200 | Menyimpan teks pada sesi disposable |
| POST | `/api/sessions/:sessionId/finalize` | 200 | Membuat render job pada DB sementara |
| GET | `/api/sessions/:sessionId/result` | 200 | Dibaca sebelum dan sesudah finalize |
| GET | `/api/sessions/:sessionId/print` | 404 | Belum ada print job saat GET dilakukan |
| POST | `/api/sessions/:sessionId/print` | 201 | Membuat print job hanya di DB sementara; bukan uji printer fisik |
| GET | `/api/status` | 200 | Status booth lokal |
| POST | `/api/operator/preflight` | 401 | PIN tidak dikirim |
| POST | `/api/operator/test-print` | 401 | PIN tidak dikirim; tidak memicu test print |
| POST | `/api/operator/retry-sync` | 401 | PIN tidak dikirim |
| POST | `/api/operator/reprint/:sessionId` | 401 | PIN tidak dikirim |

## Cloud API

Base URL lokal: `http://127.0.0.1:4001`. Endpoint Device memerlukan `Authorization: Bearer <DEVICE_KEY>`. Endpoint Admin memerlukan `Authorization: Bearer <SUPABASE_ACCESS_TOKEN>` milik admin. Kredensial sengaja tidak digunakan pada smoke test, sehingga respons `401` berarti auth gate tercapai, bukan operasi database berhasil.

| Method | Path | Hasil lokal | Catatan |
|---|---|---:|---|
| GET | `/health` | 200 | Health JSON |
| GET | `/api/health` | 200 | Alias health JSON |
| GET | `/api/public/download/:code` | 400 / 503 | Kode pendek `400`; kode 12 karakter `503` karena Supabase tidak dikonfigurasi pada server test |
| GET | `/api/device/config` | 401 | Tanpa device key |
| POST | `/api/device/sessions` | 401 | Tanpa device key |
| POST | `/api/device/uploads/presign` | 401 | Tanpa device key |
| POST | `/api/device/sessions/:id/complete` | 401 | Tanpa device key |
| POST | `/api/device/heartbeat` | 401 | Tanpa device key |
| GET | `/api/device/commands` | 401 | Tanpa device key |
| POST | `/api/device/commands/:id/result` | 401 | Tanpa device key |
| POST | `/api/device/logs` | 401 | Tanpa device key |
| POST | `/api/admin/frames/analyze` | 401 | Tanpa JWT admin |
| GET | `/api/admin/frames` | 401 | Tanpa JWT admin |
| POST | `/api/admin/frames` | 401 | Tanpa JWT admin |
| PATCH | `/api/admin/frames/:id` | 401 | Tanpa JWT admin |
| DELETE | `/api/admin/frames/:id` | 401 | Tanpa JWT admin |
| GET | `/api/admin/settings` | 401 | Tanpa JWT admin |
| PATCH | `/api/admin/settings` | 401 | Tanpa JWT admin |
| GET | `/api/admin/sessions` | 401 | Tanpa JWT admin |
| GET | `/api/admin/stats` | 401 | Tanpa JWT admin |
| GET | `/api/admin/revenue` | 401 | Tanpa JWT admin |
| GET | `/api/admin/logs` | 401 | Tanpa JWT admin |
| GET | `/api/admin/health` | 401 | Tanpa JWT admin |
| POST | `/api/admin/commands` | 401 | Tanpa JWT admin |

## Production Probe

URL yang diuji: `https://charmera-website-md8a-rouge.vercel.app`.

| Request | Hasil | Arti |
|---|---:|---|
| GET `/login` | 200 | Halaman login Admin tersedia |
| GET `/health` | 200 HTML | Ini halaman dashboard Admin `/health`, bukan Cloud API health JSON |
| GET `/api/health` | 404 | API tidak dipasang pada deployment Admin ini |
| GET `/api/admin/health` | 404 | Cloud API tidak diproxy dari deployment Admin ini |
| GET `/api/public/download/test` | 404 | Public API tidak diproxy dari deployment Admin ini |

Karena deployment sekarang dipisah, gunakan URL project Cloud API untuk probe Cloud API dan URL project Download untuk halaman download. Jangan memakai URL Admin untuk menyimpulkan status kedua service tersebut.

## Catatan Build dan Batas Tes

- Smoke test Cloud API tanpa credential memverifikasi route, health, validasi input Public API, dan middleware auth. Integrasi Supabase/R2 serta respons endpoint dengan token valid belum diuji.
- Smoke test operator tanpa PIN sengaja hanya memverifikasi penolakan `401`; test print, retry-sync, dan reprint tidak dieksekusi dengan PIN valid.
- Saat menjalankan hasil build Booth API, `runMigrations()` mencari SQL pada `apps/booth-api/dist/db/migrations`, tetapi `tsc` tidak menyalin folder tersebut. Untuk smoke test, SQL disalin ke artefak `dist` lokal; build/release Booth API perlu memasukkan file migration agar dapat boot setelah instalasi bersih.
- Tidak ada Next.js `route.ts` API handlers tambahan yang ditemukan; halaman Next.js bukan bagian dari daftar endpoint HTTP API di atas.
