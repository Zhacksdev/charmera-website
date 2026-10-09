# AGENTS.md: Chamera Photobooth

Panduan untuk AI coding agent (Claude Code, Codex, dsb.) dan developer. Baca file ini dulu, lalu baca hanya file di `docs/` yang dibutuhkan task. Jangan memuat semua dokumen sekaligus.

> Tool tertentu mencari `CLAUDE.md`. Salin atau ganti nama file ini sesuai tool yang dipakai.

## Produk dalam 5 baris

1. Photobooth self-service berbasis web (brand: **Chamera**), jalan mode kiosk di laptop dengan kamera dan printer 4R.
2. Alur tamu: Start, pilih frame, foto (countdown + klip per slot), preview 3 output, print (opsional), QR download, reset.
3. Tiga output: **Strip Photo**, **GIF**, **Live Photo** (klip tiap slot diputar bersamaan di dalam frame).
4. **Local-first**: sesi, render, dan cetak jalan di laptop tanpa internet. Hasil disinkronkan ke cloud secara async untuk QR, halaman download, dan dashboard.
5. Dashboard admin terpisah (host sendiri, login + MFA) untuk frame, harga, timer, output, kamera, printer, statistik, dan log.

## Peta dokumen

| File | Isi | Baca saat |
|---|---|---|
| `docs/01-PRODUCT.md` | Tujuan, metrik, non-goals, persona, keputusan final | Awal proyek, atau ragu soal scope |
| `docs/02-USER-FLOW.md` | State machine sesi, timer, aturan tiap halaman kiosk | Mengerjakan UI kiosk dan Booth API sesi |
| `docs/03-ARCHITECTURE.md` | Arsitektur, host, sinkronisasi async, stack, struktur direktori | Membuat struktur repo, menyentuh sync atau deploy |
| `docs/04-DATA-MODEL.md` | Skema Postgres (cloud), SQLite (booth), struktur S3 | Membuat migrasi atau query |
| `docs/05-API.md` | Endpoint Booth, Public, Device, Admin | Membuat atau memanggil API |
| `docs/06-FRAME-AND-OUTPUT.md` | Frame green screen, layer, klip, render strip/GIF/live photo, format | Frame engine, render, preview |
| `docs/07-PRINTING.md` | Print module 4R, mode print, status job, pencacah media | Print |
| `docs/08-PREFLIGHT-HEALTH.md` | Pengecekan kamera sampai sync, panel operator, heartbeat | Pre-flight, kesehatan booth |
| `docs/09-ADMIN-DASHBOARD.md` | Modul dashboard, autentikasi admin | Dashboard |
| `docs/10-DOWNLOAD-PAGE.md` | Halaman `/download/[code]` dan Public API | Halaman download |
| `docs/11-NFR-SECURITY.md` | Performa, keandalan, keamanan, privasi, observabilitas | Review, hardening |
| `docs/12-SETUP.md` | Prasyarat, env vars, langkah setup dan deploy | Setup lingkungan |
| `docs/13-ROADMAP.md` | Milestone M1-M7 dengan checklist, UAT, risiko | Merencanakan task, menutup milestone |
| `DESIGN.md` | Brand guide Chamera: warna, logo, tipografi, suara, token UI | Menyentuh UI apa pun, atau desain frame |

## Aturan kerja agen

1. Satu milestone per sesi kerja. Ikuti checklist di `docs/13-ROADMAP.md`, jangan loncat milestone.
2. Jangan menambah fitur di luar PRD. Bila ada celah atau ambigu, pilih opsi paling sederhana yang konsisten dengan dokumen, lalu catat keputusannya di `docs/DECISIONS.md` (buat bila belum ada, satu baris per keputusan: tanggal, konteks, keputusan).
3. Ubah dokumen bersamaan dengan kode bila perilaku berubah. Dokumen dan kode tidak boleh berbeda.
4. Commit kecil dan sering, satu perubahan logis per commit.
5. Tulis test untuk logika yang berisiko: state machine timer, deteksi green screen, urutan layer render, outbox sync, idempotency print.
6. Selalu cek `DESIGN.md` sebelum membuat komponen UI, teks, atau frame.

## Invariants (jangan dilanggar)

- Semua output memakai kanvas **4R: 1200 x 1800 px, 300 DPI** (frame landscape 1800 x 1200 diputar saat print). Tidak ada ukuran kertas lain.
- Booth **harus berjalan penuh tanpa internet**: sesi, render, print, dan QR tidak boleh menunggu cloud.
- **Booth API hanya bind ke 127.0.0.1**. Tidak ada endpoint publik untuk membuat sesi.
- Timer: **Booth API adalah sumber kebenaran** (`stage_expires_at`). Timer di UI hanya tampilan.
- Render final selalu dari **foto/klip asli + layout frame yang sama**, sehingga cetak dan digital identik.
- Urutan layer render: latar, foto/klip di slot, `keyed.png` (frame) paling atas, custom text.
- **Kegagalan print tidak boleh menghalangi QR.**
- Sesi menyimpan **snapshot config** saat dibuat. Perubahan admin berlaku mulai sesi berikutnya.
- **Service role Supabase hanya di server cloud**. Laptop booth hanya memegang `DEVICE_KEY`.
- Host dipisah: kiosk lokal, download publik, admin, Admin API, Device API (lihat `docs/03-ARCHITECTURE.md`).
- Pembayaran dilakukan offline di luar sistem. Jangan membuat flow pembayaran.
- Start tanpa gerbang. Hanya panel operator yang memakai PIN.
- Semua laporan memakai zona waktu Asia/Jakarta (WIB). Timestamp disimpan UTC.
- Font dan aset kiosk **tidak boleh bergantung pada CDN** (booth harus bisa jalan offline). Self-host font.

## Konvensi kode

- TypeScript strict di semua package. pnpm workspaces + Turborepo.
- Validasi input di setiap batas (HTTP, file, config) dengan Zod. Skema dibagi lewat `packages/shared`.
- Logging dengan Pino, field konsisten: `session_id`, `booth_id`, `event`.
- Test: Vitest (unit/integrasi), Playwright (alur kiosk dan admin).
- ESLint + Prettier, dijalankan di CI dan pre-commit.
- Operasi sinkron harus **idempotent** (UUID dibuat lokal, kunci S3 deterministik).
- Status sesi dan status sinkron adalah dua dimensi terpisah (`status` dan `sync_status`).

## Definition of done (per task)

- [ ] Perilaku sesuai dokumen yang relevan, dan dokumen sudah diperbarui bila berubah.
- [ ] Lulus typecheck, lint, dan test.
- [ ] Error path ditangani (kamera hilang, disk penuh, printer error, internet putus).
- [ ] Event penting masuk log.
- [ ] UI memakai token dan tipografi dari `DESIGN.md`.
- [ ] Tidak melanggar invariants di atas.

## Urutan kerja

M1 Fondasi, M2 Kiosk inti, M3 Output, M4 Sync dan Download, M5 Print, M6 Dashboard, M7 Hardening. Detail dan checklist: `docs/13-ROADMAP.md`.

## Perintah umum (dibuat di M1)

```
pnpm install      # pasang dependensi
pnpm dev          # jalankan app yang relevan secara paralel
pnpm typecheck
pnpm lint
pnpm test
```

## Istilah

| Istilah | Arti |
|---|---|
| Booth API | Express lokal di laptop booth (127.0.0.1), SQLite + file lokal |
| Device API | API cloud khusus booth (sinkron, config, heartbeat, perintah), pakai device key |
| Public API / Admin API | Permukaan cloud untuk halaman download dan dashboard |
| Slot | Area foto di frame, ditandai hijau murni (#00FF00) pada gambar sumber |
| `keyed.png` | Frame dengan piksel hijau diubah transparan, dipasang sebagai layer paling atas |
| Outbox | Tabel lokal berisi perubahan yang menunggu dikirim ke cloud |
| Pre-flight | Pengecekan kamera, disk, printer, config, render, sync, dan jam |
| `public_code` | Kode acak 12 karakter untuk URL download dan QR |
| Config snapshot | Salinan config yang dikunci ke sesi saat sesi dibuat |
