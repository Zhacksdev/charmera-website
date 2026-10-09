# 01. Produk

## Ringkasan

Sistem photobooth self-service berbasis website yang berjalan dalam mode kiosk di laptop dengan kamera dan printer 4R. Booth bekerja local-first: sesi, render, dan cetak berjalan di laptop tanpa bergantung internet, lalu hasilnya disinkronkan ke cloud secara async untuk QR, halaman download, dan dashboard.

Pengguna menekan Start, memilih frame, berfoto dalam batas waktu, melihat preview hasil (strip foto, GIF, live photo), lalu mencetak (opsional) dan mengunduh file digital lewat QR. Seluruh alur dibatasi timer per halaman dan otomatis reset ke halaman utama. Admin mengelola frame, harga, timer, output, mode printer, dan memantau data lewat dashboard terautentikasi.

## Tujuan dan metrik

| Tujuan | Metrik target |
|---|---|
| Alur kiosk mulus tanpa bantuan operator | ≥ 90% sesi selesai tanpa intervensi |
| Hasil cepat | Strip siap < 10 detik, GIF < 20 detik, live photo < 40 detik setelah sesi foto selesai |
| Cetak andal | ≥ 98% print job berstatus sukses (di luar masalah kertas/tinta) |
| Digital selalu tersedia | 100% sesi selesai akhirnya tersinkron ke cloud dan punya halaman download; booth tetap bisa dipakai saat internet putus |
| Konfigurasi tanpa deploy ulang | Frame, harga, timer, output, mode print diubah dari dashboard |
| Siklus sesi singkat | Rata-rata 3 sampai 5 menit per sesi |

## Non-goals (versi 1)

- Aplikasi mobile native.
- Filter AR atau efek wajah real-time.
- Multi-booth dan multi-tenant (v1 hanya melayani satu booth). Skema data tetap menyertakan kolom `booth_id` agar multi-booth mudah ditambah.
- Pembayaran online. Pembayaran dilakukan offline di luar sistem.
- Produksi charm fisik (gantungan kunci, charm bracelet). Sistem hanya menghasilkan strip 4R, GIF, dan live photo.

## Persona

- **Tamu (pengguna kiosk):** awam, sentuh layar, tidak sabar, butuh instruksi visual besar.
- **Operator/Admin:** pemilik booth. Mengatur frame, harga, timer, memantau pendapatan dan log, memastikan printer jalan.
- **Penerima file digital:** membuka QR dari HP, hanya perlu download cepat.

## Keputusan yang sudah ditetapkan

1. **Pembayaran:** offline di luar sistem. Tidak ada halaman bayar maupun payment gateway. Harga di dashboard hanya dipakai untuk mencatat nilai sesi dan menghitung rekap pendapatan.
2. **Booth:** satu booth dengan satu laptop kiosk. Kolom `booth_id` tetap ada agar multi-booth mudah ditambah kelak.
3. **Ukuran cetak:** dikunci ke 4R (4x6 inci), kanvas 1200 x 1800 px pada 300 DPI.
4. **Timeout Pilih Frame:** frame yang terakhir dipilih otomatis terkunci dan alur lanjut ke Action. Jika belum ada yang dipilih, dipakai frame di urutan teratas.
5. **Live photo:** klip tiap slot sekitar 5 detik (sesuai countdown) diputar bersamaan di slotnya dan di-loop. Format MP4: unduhan H.265/HEVC, preview H.264, dengan opsi H.264 saja di dashboard.
6. **Internet:** semi-offline. Booth local-first dan sinkron async ke cloud, jadi tetap jalan saat internet putus.
7. **Start tanpa gerbang:** lokasi booth strategis, tamu langsung menekan Start. Hanya panel operator yang memakai PIN.
8. **URL:** kiosk dan Booth API lokal; download publik di `domain.com/download`; dashboard terpisah di `admin.domain.com` dengan Admin API sendiri; Device API khusus booth.
9. **Frame:** konsep green screen (hijau murni = slot), frame ditimpa sebagai layer paling atas, slot terdeteksi otomatis dan bisa diedit di dashboard.
10. **Asumsi yang perlu dikonfirmasi:** `domain.com` hanya contoh, dan laptop booth cukup kuat untuk render lokal (CPU 4 core, RAM 8 GB, SSD).
