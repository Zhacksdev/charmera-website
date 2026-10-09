# 02. Alur Pengguna dan Kiosk

## State machine sesi

```
HOME → FRAME_SELECT → ACTION (capture) → PREVIEW → PROCESSING → RESULT (QR + print) → CLOSING → HOME
```

| # | Halaman | Aksi pengguna | Timer default | Saat timer habis |
|---|---|---|---|---|
| 1 | Home | Tekan Start | Tanpa timer (idle) | Attract mode / slideshow contoh hasil |
| 2 | Pilih Frame | Pilih satu frame | 30 dtk | Otomatis mengunci frame yang terakhir dipilih (jika belum ada, frame urutan teratas), lanjut ke Action |
| 3 | Action | Ambil foto, ulangi foto, ubah custom text | 120 dtk | Lanjut otomatis ke Preview |
| 4 | Preview | Lihat 3 output, tombol Lanjutkan/Print | 45 dtk | Lanjut otomatis ke Processing |
| 5 | Processing | Menunggu render, cetak, dan QR | Tanpa timer pengguna (timeout teknis 90 dtk) | Tampilkan QR walau print gagal |
| 6 | Result (QR) | Scan QR | 15 dtk | Lanjut ke Closing |
| 7 | Closing | Ucapan terima kasih | 5 dtk | Reset sesi, ke Home |

Semua durasi bisa diubah admin (lihat `09-ADMIN-DASHBOARD.md`, modul Timer).

## Aturan khusus

- Sesi dibuat di Booth API (laptop booth) saat Start ditekan (`POST /sessions`) dan menyimpan `expires_at` per tahap. Timer di UI hanya tampilan; Booth API adalah sumber kebenaran, sehingga refresh browser tidak mengubah waktu.
- Pop-up reminder muncul saat sisa waktu halaman Action ≤ 20 persen atau 15 detik (yang lebih besar), dengan hitung mundur. Reminder juga dipakai di Pilih Frame dan Preview.
- Ulangi foto hanya aktif jika sisa waktu ≥ waktu minimum per foto (default 8 detik) dan jumlah retake belum melebihi batas (default 3, bisa diatur admin).
- Tombol Lanjutkan di Action aktif setelah seluruh slot foto frame terisi. Jika waktu habis dengan slot belum terisi, slot kosong diisi foto terakhir yang ada, dan jika tidak ada satu pun foto sesi dibatalkan (`abandoned`).
- Tombol Print di Preview hanya tampil jika mode print = fisik. Jika mode digital saja, tombol diganti Selesai.
- Status sesi: `created`, `frame_selected`, `capturing`, `previewing`, `processing`, `completed`, `abandoned`, `failed`. Status sinkron (`pending`, `syncing`, `synced`, `failed`) adalah dimensi terpisah.

## 5.1 Manajemen sesi

- Create sesi (Start) dan reset sesi (otomatis oleh timer atau tombol batal) dilakukan di Booth API lokal, sehingga tetap jalan tanpa internet. Reset menandai sesi lama `abandoned` bila belum selesai dan membersihkan state client.
- Setiap sesi punya `id` (UUID dibuat lokal) dan `public_code` (nanoid 12 karakter, tidak berurutan) untuk URL download. Karena dibuat lokal, QR sudah bisa ditampilkan sebelum sesi tersinkron ke cloud.
- Saat dibuat, sesi menyimpan snapshot konfigurasi (versi config, timer, harga). Perubahan admin di tengah sesi tidak mengubah sesi yang sedang berjalan dan baru berlaku mulai sesi berikutnya.
- Foto dan klip ditulis ke disk lokal segera setelah diambil, tidak menunggu akhir sesi, agar tidak hilang saat crash.
- Job pembersih lokal menandai sesi yang kedaluwarsa atau ditinggal (browser mati di tengah alur) sebagai `abandoned` dan mereset kiosk ke Home.

## 5.2 Pilih frame

- Menampilkan frame aktif dari config lokal (hasil sinkron dari dashboard), dengan thumbnail, nama, jumlah slot foto, dan harga tambahan jika ada.
- Orientasi dan jumlah slot mengikuti desain green screen tiap frame (lihat `06-FRAME-AND-OUTPUT.md`).
- Pemilihan dicatat untuk statistik frame favorit beserta penanda `selected_by` (`user` atau `timeout`). Statistik frame diminati hanya menghitung `user`; pilihan `timeout` dilaporkan terpisah.
- Jika timer habis, frame yang terakhir dipilih (disorot) otomatis dikunci dan alur lanjut ke Action; bila pengguna belum memilih apa pun, dipakai frame di urutan teratas.

## 5.3 Action (pengambilan foto)

Layout satu layar mengikuti susunan frame yang dipilih: kamera live dan foto hasil jepretan tampil di dalam slot frame, dengan gambar frame sebagai layer paling atas (konsep green screen), ditambah input custom text.

- Countdown sebelum tiap jepretan default 5 detik (diatur admin, 3 sampai 8 detik) dengan angka besar di layar.
- Selama countdown, kamera merekam klip pendek untuk slot itu (MediaRecorder). Durasi klip sama dengan countdown (default sekitar 5 detik) dan berhenti tepat saat foto diambil dari frame terakhir stream.
- Preview foto tiap slot dan tombol Ulangi per slot. Ulangi merekam ulang klip dan foto slot itu, menggantikan yang lama.
- Custom text: input teks pendek (maks 30 karakter, daftar font dan warna terbatas dari admin, bukan bebas) yang dirender di area teks frame.
- Resolusi capture minimal 1920x1080, dijepret dari video stream ke canvas. Mirror hanya untuk tampilan, bukan untuk file hasil (opsi admin). Pilihan kamera dan resolusi mengikuti pengaturan Kamera di dashboard.
- Foto dan klip langsung disimpan ke Booth API lokal begitu tiap slot selesai.

## 5.4 Preview

- Preview menampilkan tiga output (strip, GIF, live photo) sesuai mode output admin. Detail render dan format: `06-FRAME-AND-OUTPUT.md`.
- Hasil cepat ditampilkan di sisi client tanpa menunggu render final.
- Pengguna dapat memilih tampilan template output yang tersedia (misalnya kecepatan GIF) hanya sebatas opsi yang diaktifkan admin.

## 5.5 Processing

- Saat menekan Print atau saat timer Preview habis, Booth API menjalankan job render (worker lokal), lalu job print (jika mode fisik), lalu menghasilkan QR. Render dan print tidak butuh internet.
- QR berisi `https://domain.com/download/<public_code>` dan bisa dibuat sebelum sesi tersinkron ke cloud.
- Kegagalan print tidak boleh menghalangi QR. Pengguna melihat pesan jelas dan QR tetap muncul.
- Print memakai idempotency key per sesi, sehingga klik ganda atau retry tidak mencetak dua kali. Cetak ulang hanya lewat dashboard atau panel operator.
- Bila sinkron belum selesai saat QR tampil, tamu melihat pesan "File akan tersedia beberapa menit lagi".

## 5.6 Result (QR) dan Closing

- Halaman Result menampilkan QR besar, kode pendek untuk diketik manual, thumbnail hasil, status print, dan hitung mundur 15 detik.
- Closing 5 detik, lalu reset penuh: hentikan stream kamera lalu mulai ulang, hapus state, dan kembali ke Home.
