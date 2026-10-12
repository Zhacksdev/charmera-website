# 07. Integrasi Printer

Karena booth berjalan lokal, Print module menjadi bagian dari Booth API di laptop yang sama dengan printer. Tidak ada Print Agent terpisah, polling, atau WebSocket dari cloud, sehingga cetak tetap jalan saat internet putus.

## Mode print

| Mode | Perilaku |
|---|---|
| `digital_only` | Tidak ada print, hanya QR |
| `local` | Booth API mengirim file 4R ke printer yang terdaftar di OS (USB, jaringan, atau wireless) |
| `custom_api` | Booth API memanggil endpoint HTTP milik pengguna (URL, method, header/token, template payload) untuk skema printer sendiri |

Mode dan printer dipilih di dashboard admin, disinkronkan ke booth sebagai bagian dari config, dan berlaku mulai sesi berikutnya.

Operator juga bisa memilih mode, printer, jumlah salinan, skala (`noscale` / `fit` / `shrink`), dan ukuran kertas langsung dari panel operator lokal (`/operator`). Pengaturan lokal ini disimpan di SQLite (`config_cache.printer_local`) dan **menang atas config cloud**, karena printer fisik adalah fakta laptop booth. Mode `custom_api` belum diimplementasikan dan diperlakukan sebagai `digital_only`. Panduan setup: `RUNNING-TABLET.md`.

## Print module

- Modul Node.js di Booth API (`services/printer.ts`) membungkus strip menjadi PDF satu halaman berukuran fisik 4x6 inci (300 DPI), lalu mencetaknya lewat `pdf-to-printer`/SumatraPDF (Windows, senyap tanpa dialog) atau `lp`/CUPS (macOS/Linux). Printer apa pun yang terdaftar di OS bisa dipakai (USB, jaringan, wireless); nama kosong berarti printer default OS. Daftar dan status printer dibaca dari `Win32_Printer` (Windows) atau `lpstat` (CUPS).
- Ukuran kertas dikunci ke 4R (4x6 inci, 102 x 152 mm) tanpa opsi lain, dicetak pada ukuran asli tanpa fit-to-page atau scaling. Frame landscape (1800 x 1200) diputar 90 derajat otomatis sebelum dikirim. Jumlah salinan diatur global di dashboard (default 1).
- Status job: `queued`, `sent`, `printing`, `done`, `failed` dengan `error_message`. Retry otomatis maksimal 2 kali, lalu `failed`. Satu sesi satu job cetak (idempotency key), kecuali cetak ulang yang disengaja.
- Pencacah media: kapasitas kertas/ribbon diisi admin (misalnya 100 lembar), berkurang tiap cetak sukses, dan direset saat media diganti. Peringatan muncul di dashboard dan panel operator saat sisa di bawah batas (default 10 lembar).
- Heartbeat berisi status printer, sisa media, dan hasil Test Print. Dashboard menampilkan Online/Offline dari heartbeat terakhir yang tersinkron, jadi status bisa tertunda saat booth offline.
- Test Print dan cetak ulang dari dashboard dikirim sebagai perintah (`device_commands`) yang diambil booth saat online berikutnya. Operator juga bisa Test Print dari panel lokal kapan saja.

## Aturan perilaku

- Tombol Print di Preview hanya tampil jika mode print = fisik. Jika digital saja, tombol diganti Selesai.
- Saat timer Preview habis, print berjalan otomatis (bila mode fisik).
- Kegagalan print tidak boleh menghalangi QR. Tamu melihat pesan jelas dan QR tetap muncul.
- Bila printer bermasalah saat pre-flight, kiosk memberi peringatan ke operator dan sesi bisa turun ke digital saja (bila diaktifkan admin). Lihat `08-PREFLIGHT-HEALTH.md`.
- Klik ganda atau retry tidak boleh mencetak dua kali (idempotency key per sesi).
