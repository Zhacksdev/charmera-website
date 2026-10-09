# 05. Spesifikasi API

API dibagi menurut penggunanya. Booth API hanya lokal, dan cloud punya tiga permukaan terpisah (host dan akses: lihat `03-ARCHITECTURE.md`). Validasi semua input dengan Zod.

## Booth API (lokal, 127.0.0.1, dipakai Kiosk UI)

| Method | Endpoint | Fungsi |
|---|---|---|
| POST | `/api/sessions` | Buat sesi baru, mengembalikan `session_id`, timer, dan snapshot config |
| GET | `/api/sessions/:id` | Status sesi dan sisa waktu tahap |
| POST | `/api/sessions/:id/reset` | Batalkan/reset sesi |
| GET | `/api/frames` | Daftar frame aktif dari cache lokal |
| PATCH | `/api/sessions/:id/frame` | Pilih frame (dengan `selected_by`) |
| PATCH | `/api/sessions/:id/text` | Simpan custom text |
| POST | `/api/sessions/:id/photos` | Simpan foto dan klip satu slot ke disk lokal |
| POST | `/api/sessions/:id/finalize` | Mulai render, print, dan QR |
| GET | `/api/sessions/:id/result` | Status render, print, sync, dan URL QR |
| GET | `/api/status` | Hasil pre-flight terbaru dan status booth |
| POST | `/api/operator/*` | Aksi operator dengan PIN: pre-flight sekarang, Test Print, Retry Sync, cetak ulang |

## Public API (cloud, publik, read-only)

| Method | Endpoint | Fungsi |
|---|---|---|
| GET | `/api/public/download/:code` | Metadata dan signed URL file sesi, atau status "sedang diproses" |

## Device API (cloud, khusus booth, device key)

| Method | Endpoint | Fungsi |
|---|---|---|
| GET | `/api/device/config` | Config dan frame aktif beserta `config_version` |
| POST | `/api/device/sessions` | Upsert sesi dari outbox (idempotent) |
| POST | `/api/device/uploads/presign` | Presigned URL multipart untuk file hasil |
| POST | `/api/device/sessions/:id/complete` | Konfirmasi semua file sesi sudah terunggah |
| POST | `/api/device/heartbeat` | Kesehatan booth, printer, sisa media, antrean sync |
| GET | `/api/device/commands` | Ambil perintah dari dashboard (Test Print, Retry Sync, cetak ulang) |
| POST | `/api/device/commands/:id/result` | Lapor hasil perintah |
| POST | `/api/device/logs` | Kirim log secara batch |

## Admin API (cloud, JWT admin, host `api-admin`)

CRUD `/api/admin/frames`, `POST /api/admin/frames/analyze` (deteksi slot green screen), `/api/admin/settings`, `GET /api/admin/sessions`, `GET /api/admin/stats`, `GET /api/admin/revenue?from&to`, `GET /api/admin/logs`, `GET /api/admin/health`, `POST /api/admin/commands`.

## Aturan umum

- Booth API: tanpa autentikasi jaringan karena hanya bind ke 127.0.0.1. Endpoint operator memakai PIN.
- Device API: autentikasi device key, rate limit per device.
- Admin API: JWT Supabase role `admin`, CORS hanya `admin.domain.com`.
- Public API: tanpa login, rate limit per IP, tidak membedakan kode salah dan kode yang belum tersinkron.
- Endpoint yang menulis dari outbox harus idempotent.
