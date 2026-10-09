# 10. Halaman Download Sesi

- URL publik: `https://domain.com/download/[public_code]` (contoh `.../download/k3Xp9aQ2mZ`). Aplikasinya (`apps/download`) terpisah dari admin dan kiosk, dan hanya memanggil Public API read-only.
- Menampilkan langsung file hasil: strip (gambar), GIF, live photo (video loop versi H.264), dengan tombol Unduh masing-masing (live photo diunduh sebagai H.265) dan Unduh Semua (ZIP dibuat di cloud setelah semua file tersinkron).
- Mobile-first, ringan, tanpa login. Tidak memakai ID sesi asli di URL.
- Status sinkron: bila kode belum dikenal cloud atau file belum selesai diunggah, halaman menampilkan "Sedang diproses, coba lagi sebentar" dengan auto-refresh, dan per file menampilkan status menunggu atau siap. Kode yang belum tersinkron tidak dibedakan dari kode salah, sehingga kode tidak bisa ditebak.
- File diakses lewat signed URL S3 berumur pendek yang digenerate saat halaman dibuka. Halaman menampilkan tanggal kedaluwarsa.
- Retensi default 30 hari (bisa diatur admin). Setelah kedaluwarsa tampil "File sudah tidak tersedia" (HTTP 410), dan job terjadwal menghapus file S3.
- Header `noindex`, rate limit per IP, dan pencatatan jumlah download (`downloads`).
- Tampilan mengikuti `DESIGN.md`: kartu putih di atas Cream, logo utama, tagline pendukung, hashtag #WearYourChamera, tombol Unduh bergaya tombol utama.
