# 09. Dashboard Admin

Dashboard berjalan di host terpisah `admin.domain.com` dengan Admin API sendiri (`api-admin.domain.com`), sengaja dipisah dari halaman download publik dan dari kiosk. Perubahan di dashboard disinkronkan ke booth sebagai config.

## Modul

| Modul | Fungsi |
|---|---|
| Overview | Total sesi, sesi selesai, pendapatan (hari/minggu/bulan, zona waktu WIB), grafik tren, frame terpopuler (pilihan `user`), rasio print sukses, status booth (kamera, printer, sisa media, antrean sync) |
| Sesi | Tabel sesi (filter tanggal, status, status sinkron, frame), detail sesi (foto, output, status print, link download), aksi cetak ulang (dikirim sebagai perintah ke booth) dan hapus |
| Pendapatan | Rekap per periode dan per frame, ekspor CSV. Pendapatan dihitung dari harga sesi yang selesai (pembayaran dilakukan offline) |
| Frame (CRUD) | Upload frame green screen (1200 x 1800 px atau 1800 x 1200 px untuk 4R), deteksi slot otomatis, editor visual slot dan area teks, preview dengan foto contoh, font/warna teks, harga tambahan, status aktif/nonaktif, urutan |
| Harga | Harga dasar per sesi, harga tambahan per frame/print, mata uang IDR |
| Output | Pilih `photo_only` atau `full` (strip + GIF + live photo), atur durasi GIF dan durasi klip live photo, pilih codec (H.265 dengan preview H.264, atau H.264 saja) |
| Timer | Durasi tiap halaman, durasi countdown foto (default 5 dtk), ambang reminder, batas retake, durasi QR dan Closing |
| Kamera | Pilih perangkat kamera, resolusi, mirror tampilan, uji kamera dengan preview langsung |
| Printer | Pilih mode print, printer default, kapasitas media dan batas peringatan, konfigurasi `custom_api`, Test Print |
| Kesehatan booth | Hasil pre-flight terakhir, umur antrean sync, ruang disk, versi aplikasi, tombol perintah (Test Print, Retry Sync) |
| Log sistem | Event booth dan cloud, error render, status print, login admin; filter level dan tanggal |
| Pengaturan | Retensi file lokal dan cloud, teks Home dan Closing, branding |

## Autentikasi admin

- Supabase Auth (email + password, MFA TOTP wajib). Hanya akun dengan role `admin` di tabel `admin_users` yang bisa masuk. Tidak ada halaman registrasi publik.
- Middleware Next.js memeriksa sesi untuk seluruh dashboard. Admin API memverifikasi JWT Supabase di semua endpoint, dengan CORS hanya untuk `admin.domain.com`, rate limit ketat, dan opsional IP allowlist.
- Sesi admin kedaluwarsa 8 jam, lockout setelah 5 kali gagal, dan semua aksi mutasi dicatat di audit log.

## Catatan implementasi

- Perubahan config menaikkan `config_version`. Booth menariknya dan menerapkannya mulai sesi berikutnya.
- Editor frame dan aturan deteksi: lihat `06-FRAME-AND-OUTPUT.md`.
- Teks Home dan Closing, serta pilihan font dan warna custom text, mengikuti `DESIGN.md`.
- UI dashboard mengikuti token dan tipografi di `DESIGN.md`.
