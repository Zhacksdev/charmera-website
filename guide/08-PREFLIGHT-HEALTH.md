# 08. Pengecekan Sistem (Pre-flight) dan Kesehatan Booth

Pengecekan berjalan otomatis saat booth dinyalakan, tiap 60 detik di Home (versi ringan), dan sebelum tiap sesi dimulai. Hasilnya tampil sebagai lencana status kecil untuk operator dan dikirim ke dashboard lewat heartbeat.

| Pengecekan | Cara cek | Jika gagal |
|---|---|---|
| Kamera | Izin aktif, perangkat terpilih terdeteksi, resolusi minimal 1920x1080, frame rate stabil, stream tidak hitam | Start dinonaktifkan, layar "Booth sedang disiapkan", alert ke dashboard |
| Penyimpanan lokal | Ruang disk bebas di atas batas (default 5 GB), folder data bisa ditulis | Peringatan; di bawah batas kritis Start dinonaktifkan |
| Printer (mode fisik) | Printer terdaftar di OS dan siap, sisa media di atas batas | Tidak memblokir: peringatan ke operator, dan sesi turun ke digital saja bila diaktifkan admin |
| Konfigurasi | Config dan minimal satu frame aktif ada di cache lokal | Start dinonaktifkan bila tidak ada frame valid |
| Render | Sharp dan ffmpeg bisa dijalankan (uji singkat) | Start dinonaktifkan |
| Sinkronisasi | Koneksi ke Device API, umur item outbox tertua, jumlah item pending | Tidak memblokir; peringatan bila antrean lebih tua dari batas (default 24 jam) |
| Waktu sistem | Jam laptop mendekati waktu server (toleransi 2 menit) saat online | Peringatan, karena jam salah merusak laporan dan masa berlaku file |

## Panel operator

Operator membuka panel status dengan PIN (terpisah dari jalur tamu; halaman `operator/page.tsx` di kiosk). Panel menampilkan hasil pengecekan terakhir, tombol Test Camera, Test Print, dan Retry Sync.

Hasil pre-flight disimpan di tabel lokal `preflight_results` dan ringkasannya dikirim ke cloud (`booths.health`).

## Heartbeat

Dikirim ke `POST /api/device/heartbeat`. Berisi: hasil pre-flight terakhir, status printer, sisa media, umur dan jumlah antrean sync, ruang disk, versi aplikasi.

## Alert di dashboard

Dashboard memberi alert untuk: booth offline melewati batas, antrean sync tua, media hampir habis, kamera gagal, disk menipis. Detail modul: `09-ADMIN-DASHBOARD.md` (Kesehatan booth).

## Perintah dari dashboard

Test Print, Retry Sync, dan cetak ulang dikirim sebagai `device_commands`, diambil booth lewat `GET /api/device/commands` saat online, dan hasilnya dilapor lewat `POST /api/device/commands/:id/result`.
