# 13. Roadmap, Checklist Milestone, UAT, dan Risiko

## Ringkasan milestone

| Fase | Lingkup | Kriteria selesai |
|---|---|---|
| M1 Fondasi (minggu 1-2) | Monorepo, skema Postgres dan SQLite, auth admin + MFA, Device API dan device key, `frame-engine` (deteksi green screen) | Admin login, upload frame green screen, slot terdeteksi |
| M2 Kiosk inti (minggu 3-4) | Booth API lokal, Home sampai Action, timer, klip per slot (countdown 5 dtk), retake, custom text, pre-flight kamera dan disk | Sesi foto lengkap tersimpan lokal tanpa internet |
| M3 Output (minggu 5-6) | Render strip, GIF, live photo (frame di layer atas), Preview, QR, uji spesifikasi laptop | Tiga output tampil dengan layering benar dan siap dicetak/diunduh |
| M4 Sync dan Download (minggu 7) | Outbox, Sync worker, upload multipart, halaman download publik, status "sedang diproses" | Sesi offline tersinkron otomatis dan terbuka lewat QR |
| M5 Print (minggu 8) | Print module 4R, status job, pencacah media, pre-flight printer, Test Print, `custom_api` | Cetak 4R sukses dan gagal-aman, tanpa internet |
| M6 Dashboard (minggu 9-10) | Statistik, pendapatan, sesi, harga, timer, output, kamera, printer, kesehatan booth, log, editor visual frame | Semua pengaturan admin sampai ke booth |
| M7 Hardening (minggu 11) | Retensi, rate limit, uji beban, uji kiosk 8 jam, uji putus internet, dokumentasi | Lulus checklist UAT |
| Fase 2 | Multi-booth, template tema, email/WhatsApp kirim hasil | Sesuai prioritas bisnis |

## Checklist per milestone (untuk agen)

Kerjakan satu milestone per sesi. Baca file yang tercantum, jangan yang lain.

### M1 Fondasi
Baca: `03-ARCHITECTURE.md`, `04-DATA-MODEL.md`, `06-FRAME-AND-OUTPUT.md`, `09-ADMIN-DASHBOARD.md` (auth), `12-SETUP.md`.
- [ ] Monorepo pnpm + Turborepo, `packages/config`, `packages/shared` (tipe, Zod, konstanta status).
- [ ] Migrasi Postgres + RLS, skema SQLite + migrasi.
- [ ] Auth admin: Supabase Auth + MFA, tabel `admin_users`, middleware dashboard.
- [ ] Device API dasar + `booths.device_key_hash` + otentikasi device key.
- [ ] `packages/frame-engine`: deteksi hijau dengan toleransi, komponen terhubung, bounding box, penomoran slot, keying + despill, validasi ukuran.
- [ ] Endpoint `POST /api/admin/frames/analyze` dan upload frame di dashboard.
- [ ] Test unit frame-engine (tepi anti-alias, slot bulat, dua strip bernomor sama).
- Selesai bila: admin login, upload frame green screen, slot terdeteksi.

### M2 Kiosk inti
Baca: `02-USER-FLOW.md`, `04-DATA-MODEL.md`, `05-API.md` (Booth API), `06-FRAME-AND-OUTPUT.md` (klip, layer), `08-PREFLIGHT-HEALTH.md`, `DESIGN.md`.
- [ ] Booth API: sesi, reset, `stage_expires_at`, snapshot config, job pembersih sesi.
- [ ] Kiosk: Home, Pilih Frame (`selected_by`), Action, ReminderModal, timer dari server.
- [ ] `useCamera`, `useClipRecorder`, `FrameStage` (video/foto di bawah, `keyed.png` di atas).
- [ ] Countdown 5 detik, klip per slot, retake sesuai aturan, custom text.
- [ ] Foto dan klip ke disk lokal per slot.
- [ ] Pre-flight kamera dan disk, Start dinonaktifkan bila gagal.
- [ ] Font self-host dan token UI sesuai `DESIGN.md`.
- Selesai bila: sesi foto lengkap tersimpan lokal tanpa internet.

### M3 Output
Baca: `06-FRAME-AND-OUTPUT.md`, `02-USER-FLOW.md` (Preview, Processing, Result), `03-ARCHITECTURE.md` (render worker).
- [ ] Render strip (Sharp, 1200 x 1800, 300 DPI) dengan urutan layer yang benar.
- [ ] Render GIF.
- [ ] Render live photo: klip dinormalkan, crop cover ke slot, frame di atas, H.265 + preview H.264.
- [ ] Halaman Preview, Processing, Result (QR 15 dtk), Closing (5 dtk), reset penuh.
- [ ] Uji spesifikasi laptop terhadap target waktu render.
- Selesai bila: tiga output tampil dengan layering benar dan siap dicetak/diunduh.

### M4 Sync dan Download
Baca: `03-ARCHITECTURE.md` (sinkronisasi), `05-API.md` (Device, Public), `10-DOWNLOAD-PAGE.md`, `04-DATA-MODEL.md`.
- [ ] Tabel `outbox`, Sync worker dengan prioritas, backoff, upload multipart yang bisa dilanjutkan.
- [ ] Device API: config, upsert sesi, presign, complete, heartbeat, logs.
- [ ] Tarik config tiap 60 detik + saat start, cache lokal.
- [ ] Public API + `apps/download`, status "sedang diproses", ZIP, retensi dan 410.
- [ ] Pembersihan file lokal setelah `synced` + masa simpan.
- Selesai bila: sesi offline tersinkron otomatis dan terbuka lewat QR.

### M5 Print
Baca: `07-PRINTING.md`, `08-PREFLIGHT-HEALTH.md`, `05-API.md` (operator).
- [ ] Print module (`pdf-to-printer` / `lp`), 4R ukuran asli, rotasi frame landscape.
- [ ] Job print dengan status, retry 2x, idempotency key per sesi.
- [ ] Pencacah media dan peringatan.
- [ ] Pre-flight printer, fallback digital sesuai pengaturan, Test Print.
- [ ] Mode `custom_api`.
- Selesai bila: cetak 4R sukses dan gagal-aman, tanpa internet.

### M6 Dashboard
Baca: `09-ADMIN-DASHBOARD.md`, `05-API.md` (Admin), `08-PREFLIGHT-HEALTH.md`, `DESIGN.md`.
- [ ] Overview, Sesi, Pendapatan (WIB), Harga, Output, Timer, Kamera, Printer, Kesehatan booth, Log, Pengaturan.
- [ ] Editor visual frame (geser slot, nomor, area teks, preview foto contoh).
- [ ] Perintah ke booth (`device_commands`): Test Print, Retry Sync, cetak ulang.
- [ ] Audit log untuk semua mutasi.
- Selesai bila: semua pengaturan admin sampai ke booth.

### M7 Hardening
Baca: `11-NFR-SECURITY.md`, `13-ROADMAP.md` (UAT, risiko).
- [ ] Retensi lokal dan cloud, rate limit tiap permukaan, CORS per host.
- [ ] Uji beban render, uji kiosk 8 jam, uji putus internet di tengah sesi.
- [ ] Review keamanan per permukaan, dokumentasi akhir.
- Selesai bila: lulus checklist UAT di bawah.

## Kriteria penerimaan (UAT)

- [ ] Start membuat sesi baru di Booth API lokal dan membawa pengguna ke Pilih Frame, tanpa internet.
- [ ] Timer tiap halaman mengikuti pengaturan admin dan tetap akurat setelah refresh.
- [ ] Pop-up reminder muncul sebelum waktu habis, dan setelah waktu habis alur lanjut otomatis sesuai tabel di `02-USER-FLOW.md`. Timeout di Pilih Frame mengunci frame yang terakhir dipilih dan tercatat `selected_by = timeout`.
- [ ] Retake hanya aktif jika waktu dan kuota cukup, dan merekam ulang klip serta foto slot itu.
- [ ] Upload frame green screen memunculkan slot terdeteksi yang bisa diedit. Hasil render menempatkan foto di bawah dan frame di atas, tanpa tepi hijau.
- [ ] Output sesuai mode admin: hanya strip, atau strip + GIF + live photo (klip tiap slot sekitar 5 detik diputar bersamaan dan di-loop).
- [ ] Semua output berukuran kanvas 4R (1200 x 1800 px). Print fisik terkirim via mode yang dipilih dengan ukuran selalu 4R, dan kegagalan print tidak menghilangkan QR.
- [ ] Print tidak ganda saat tombol ditekan berulang.
- [ ] Pre-flight: kamera mati atau tidak terdeteksi menonaktifkan Start dan memunculkan alert; printer error memunculkan peringatan dan fallback digital sesuai pengaturan; media hampir habis memunculkan peringatan di dashboard.
- [ ] Saat internet dicabut di tengah satu sesi penuh, sesi tetap selesai, print jalan, dan QR tampil. Setelah internet kembali, sesi tersinkron dan `/download/[code]` menampilkan file yang benar (sebelumnya menampilkan status "sedang diproses").
- [ ] QR tampil 15 detik, Closing 5 detik, lalu sesi reset ke Home tanpa sisa data sesi sebelumnya.
- [ ] `/download/[code]` menolak kode tidak valid atau kedaluwarsa dan hanya memakai Public API read-only.
- [ ] Dashboard hanya bisa diakses admin terautentikasi dengan MFA di host terpisah, Booth API tidak bisa diakses dari luar laptop, dan seluruh perubahan pengaturan tercatat di audit log.
- [ ] Perubahan config di dashboard tiba di booth dan berlaku mulai sesi berikutnya, tanpa mengubah sesi yang sedang berjalan.
- [ ] Statistik sesi, pendapatan (WIB), dan frame favorit (hanya pilihan `user`) sesuai data sesi di database.

## Risiko dan mitigasi

| Risiko | Mitigasi |
|---|---|
| Render live photo lambat di laptop | Klip pendek per slot, preset ffmpeg cepat, resolusi dibatasi, strip dan QR tidak menunggu video, uji spesifikasi laptop di M3 |
| Printer offline atau kertas habis | Pre-flight, pencacah media, status di dashboard, fallback digital, QR tetap muncul |
| Internet putus lama | Local-first: booth jalan penuh, sync async dengan retry dan upload yang bisa dilanjutkan, halaman download menampilkan "sedang diproses" sampai tersinkron |
| Laptop rusak sebelum sinkron | Prioritas kirim metadata dan hasil akhir dulu, alert antrean tua, pre-flight disk, disarankan backup folder data berkala |
| Izin kamera diblokir atau kamera lepas | Izin permanen untuk localhost, pre-flight kamera sebelum tiap sesi, Start dinonaktifkan dan alert ke dashboard |
| Penyimpanan lokal atau cloud membengkak | Retensi otomatis (lokal setelah `synced`, cloud sesuai pengaturan), kompresi foto, lifecycle rule S3 |
| Akses tidak sah ke file tamu | Bucket privat, signed URL singkat, kode download acak, rate limit, kode belum sinkron tidak dibedakan dari kode salah |
| Desain frame salah (tepi hijau, hijau dipakai di luar slot) | Validasi saat upload, despill, preview sebelum aktif, panduan untuk desainer |
| Perangkat tidak bisa memutar HEVC | Preview H.264, unduhan H.265, opsi H.264 saja di dashboard |
| Perubahan config di tengah sesi | Snapshot config per sesi, berlaku mulai sesi berikutnya |
