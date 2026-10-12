# Chamera Photobooth

Photobooth self-service berbasis web (brand: **Chamera**), berjalan dalam mode kiosk di laptop dengan kamera dan printer 4R. Local-first: sesi, render, dan cetak berjalan tanpa internet, lalu disinkronkan ke cloud secara async untuk QR download dan dashboard.

## Alur Tamu

Start → Pilih Frame → Action (foto + countdown) → Preview → Processing → Result (QR) → Closing

## Output

- **Strip Photo** — 4R (1200x1800 px, 300 DPI), JPEG
- **GIF** — animasi foto tiap slot
- **Live Photo** — klip tiap slot diputar bersamaan, H.265 (unduh) + H.264 (preview)

## Arsitektur

```
apps/
├── kiosk/          Kiosk UI (Next.js, laptop booth)
├── booth-api/      Booth API lokal (Express + SQLite, 127.0.0.1)
├── cloud-api/      Cloud API (Public, Device, Admin)
├── download/       Halaman download publik (Next.js)
└── admin/          Dashboard admin (Next.js)

packages/
├── shared/         Tipe, skema Zod, konstanta
├── frame-engine/   Deteksi green screen + komposit render
├── config/         Konfigurasi TypeScript
└── device-auth/    Autentikasi device key
```

## Prasyarat

- Node.js 20 LTS, pnpm
- ffmpeg (render GIF & live photo)
- Printer 4R terpasang di OS (mode fisik)

## Menjalankan

Booth dengan tablet + laptop Windows: [`guide/RUNNING-TABLET.md`](guide/RUNNING-TABLET.md).

```bash
pnpm install
pnpm dev
```

- Kiosk: `http://localhost:3000`
- Booth API: `http://127.0.0.1:4000`
- Download: `http://localhost:3001`
- Admin: `http://localhost:3002`
- Cloud API: `http://localhost:4001`

## Konfigurasi

Isi `.env` di tiap app (jangan di-commit). Variabel booth ada di `guide/RUNNING-TABLET.md`, variabel cloud di `guide/DEPLOY-VERCEL.md`.

## Dokumentasi

- `guide/RUNNING-TABLET.md` — **cara running booth di tablet** (mulai dari sini)
- `guide/DEPLOY-VERCEL.md` — **checklist deploy cloud ke Vercel**
- `guide/` — PRD, arsitektur, data model, API, printing, dan brand guide
