# 11. Kebutuhan Non-Fungsional dan Keamanan

- **Performa:** first load kiosk < 3 detik (lokal), aset frame di-prefetch dan disimpan di cache lokal. Halaman download < 2 detik di 4G.
- **Keandalan:** foto dan klip ditulis ke disk lokal segera, job render idempotent dan bisa diulang, kegagalan satu output tidak membatalkan output lain, sinkron memakai retry dan upload yang bisa dilanjutkan, dan booth berjalan penuh tanpa internet.
- **Keamanan:** Booth API hanya bind ke 127.0.0.1. Bucket privat, presigned URL berumur pendek (≤ 15 menit), validasi tipe dan ukuran file, rate limit dan CORS terpisah di tiap permukaan API cloud, secret dan service role hanya di server cloud, device key booth bisa dicabut dari dashboard, HTTPS wajib di cloud, dan kode download acak sulit ditebak.
- **Privasi:** foto tamu dihapus otomatis sesuai retensi (lokal dan cloud), ada opsi hapus manual per sesi, dan teks kebijakan singkat di halaman Home atau download.
- **Kiosk hardening:** Chrome mode `--kiosk` (localhost dianggap secure context, jadi kamera jalan tanpa HTTPS), nonaktifkan gestur navigasi, cegah zoom, tombol besar (min 64 px), mendukung layar sentuh dan landscape/portrait.
- **Observabilitas:** event penting masuk log lokal lalu `system_logs` di cloud lewat sinkron. Dashboard memberi alert untuk booth offline melewati batas, antrean sync tua, dan media hampir habis.
- **Kompatibilitas:** Chrome/Edge terbaru untuk kiosk; halaman download mendukung Safari iOS dan Chrome Android.
- **Zona waktu:** semua laporan memakai Asia/Jakarta (WIB), timestamp disimpan UTC.
- **Offline:** font dan aset kiosk di-self-host, tanpa request ke CDN (lihat `DESIGN.md`).

## Checklist keamanan per permukaan

| Permukaan | Wajib |
|---|---|
| Booth API | Bind 127.0.0.1, endpoint operator berPIN, validasi Zod, tidak menyimpan service role |
| Device API | Device key (hash di DB), rate limit per device, key bisa dicabut, idempotent |
| Admin API | JWT admin + MFA, CORS satu origin, rate limit ketat, audit log untuk mutasi |
| Public API | Read-only, rate limit per IP, respons seragam untuk kode salah dan belum sinkron |
| S3 | Bucket privat, presigned URL singkat, kunci deterministik |
| Frame upload | Validasi ukuran dan tipe file, batas ukuran, analisis di server |
