# 06. Frame Green Screen dan Output

## Konsep frame green screen

Desainer menyiapkan frame sebagai gambar 4R dengan area foto diisi hijau murni (#00FF00). Sistem membaca area hijau itu sebagai slot, jadi koordinat tidak perlu diisi manual. Saat render, foto atau klip ditaruh di bawah, lalu gambar frame ditimpa di atasnya sebagai layer paling atas, seolah area hijau itu jendela.

### Alur admin

1. Admin mengunggah gambar frame (1200 x 1800 px atau 1800 x 1200 px, slot berwarna hijau murni).
2. Endpoint analisis (`POST /api/admin/frames/analyze`) mendeteksi piksel hijau (dengan toleransi agar tepi anti-alias ikut), memisahkan tiap area terhubung, menghitung bounding box, lalu menomori slot dari atas ke bawah dan kiri ke kanan.
3. Admin memeriksa hasil di editor visual: geser atau ubah ukuran slot, hapus deteksi palsu, ubah nomor slot, dan tentukan area custom text. Slot bernomor sama memakai foto yang sama, misalnya dua strip berdampingan di kertas 4R untuk dipotong.
4. Sistem membuat `keyed.png`: piksel hijau diubah menjadi transparan dengan despill agar tidak ada tepi hijau, disimpan bersama `layout` (slot, area teks, kanvas).
5. Preview memakai foto contoh dengan urutan layer yang sama seperti render asli. Setelah cocok, admin menyimpan dan mengaktifkan frame.

### Urutan layer render (bawah ke atas)

1. Warna latar kanvas (putih atau warna pilihan admin).
2. Foto atau klip tiap slot, di-crop mode cover ke bounding box slot dan diperbesar sekitar 4 px agar tidak ada celah di tepi.
3. `keyed.png` sebagai layer paling atas. Lubang transparannya membentuk bentuk slot, baik kotak, bulat, maupun bentuk bebas.
4. Custom text di area teks.

### Validasi upload

Upload ditolak bila ukuran bukan 4R, tidak ada area hijau, atau slot lebih kecil dari batas minimum (default 200 px sisi terpendek). Hijau murni hanya dipakai untuk slot, jadi desain di luar slot tidak boleh memakai #00FF00.

### Layout (contoh bentuk data)

```json
{
  "canvas": { "w": 1200, "h": 1800 },
  "slots": [
    { "n": 1, "x": 90, "y": 120, "w": 1020, "h": 380 },
    { "n": 2, "x": 90, "y": 540, "w": 1020, "h": 380 }
  ],
  "text_area": { "x": 90, "y": 1620, "w": 1020, "h": 120 }
}
```

Angka di atas hanya ilustrasi bentuk. Nilai nyata berasal dari hasil deteksi dan editor.

### Frame di kiosk

Kiosk memakai layout dan `keyed.png` yang sama saat Action: video dan foto di slot (layer bawah), PNG frame di atas. Tamu melihat hasil akhir sejak awal.

## Pengambilan foto dan klip (ringkas)

- Countdown default 5 detik (3 sampai 8).
- Selama countdown, MediaRecorder merekam klip untuk slot itu. Durasi klip sama dengan countdown, berhenti tepat saat foto diambil.
- Retake merekam ulang klip dan foto slot itu.
- Foto dan klip langsung disimpan ke Booth API lokal.

## Tiga output

| Output | Deskripsi | Cara render |
|---|---|---|
| Strip Photo | Foto ditempatkan di slot frame (foto di bawah, frame di atas), plus custom text | Lokal: Sharp, komposit JPEG kanvas 4R 1200 x 1800 px, 300 DPI |
| GIF | Animasi dari foto-foto di strip, tiap foto tampil ± 0,8 detik, loop | Lokal: ffmpeg (palettegen/paletteuse) atau gifenc, sisi panjang maks 1080 px |
| Live Photo | Klip tiap slot (± 5 detik, sesuai countdown) diputar bersamaan di slotnya masing-masing di dalam frame, lalu di-loop | Lokal: ffmpeg, tiap klip di-crop (cover) ke slotnya, ditimpa PNG frame di atas, keluaran MP4 H.265/HEVC |

- Output aktif ditentukan admin: mode `photo_only` (hanya strip) atau `full` (strip + GIF + live photo).
- Preview menampilkan hasil cepat di sisi client (canvas dan elemen video, tanpa menunggu render). Render final berjalan di worker lokal memakai foto dan klip asli plus layout frame yang sama, sehingga hasil cetak dan digital identik.
- Live photo diputar berulang (atribut loop) di preview dan halaman download. File MP4 tidak perlu mengulang isinya.
- Klip dari MediaRecorder (webm) perlu dinormalkan ke frame rate konstan sebelum komposit.

## Ketetapan ukuran dan format

Semua output mengikuti kanvas 4R (4x6 inci, 102 x 152 mm) pada 300 DPI, yaitu 1200 x 1800 px.

File unduhan live photo dikodekan H.265/HEVC (tag `hvc1`, CRF 28, preset fast, sisi panjang maks 1080 px, yuv420p, faststart), kira-kira 30 sampai 50 persen lebih kecil daripada H.264 pada kualitas setara. Karena HEVC tidak diputar di semua perangkat (Firefox, Windows tanpa codec, sebagian Chrome tanpa hardware decode), preview di kiosk dan di halaman download memakai salinan H.264 720p yang ringan, sedangkan tombol Unduh memberi H.265. Admin bisa memilih H.264 saja bila tidak ingin dua versi. AV1 tidak dipilih karena encoding lambat dan dukungan iOS terbatas.

## Target waktu render

Strip < 10 detik, GIF < 20 detik, live photo < 40 detik setelah sesi foto selesai. Strip dan QR tidak boleh menunggu render video. Kegagalan satu output tidak membatalkan output lain.
