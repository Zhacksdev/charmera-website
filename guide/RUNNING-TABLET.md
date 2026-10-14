# Cara Running Booth di Tablet

Tablet (iPad atau Android, browser **Chrome**) menjadi layar tamu dan kamera. Laptop Windows menjalankan semua prosesnya: menyimpan sesi, merender foto, dan mencetak ke printer yang tercolok di laptop. Tablet dan laptop harus berada di **Wi-Fi yang sama**; internet hanya dibutuhkan untuk sync ke cloud dan link QR.

```
Tablet (Chrome)  ── Wi-Fi ──>  Laptop Windows
  kamera + layar tamu            https://<ip>:8443  → kiosk + Booth API → render → printer
                                 http://<ip>:8080/ca.crt  (sertifikat, dipasang sekali)
```

Ringkasnya:

1. **Persiapan sekali**: laptop, printer, dan tiap tablet (bagian A).
2. **Setiap event**: jalankan satu skrip di laptop, buka URL di tablet (bagian B).

---

## A. Persiapan sekali

### A1. Laptop

- [ ] Install **Node.js 20+** dan **pnpm**, lalu dari folder repo jalankan:

  ```powershell
  pnpm install
  ```
- [ ] Bila output **full** (GIF + Live Photo) dipakai: install **ffmpeg** (mis. `winget install Gyan.FFmpeg`) lalu buka terminal baru. Tanpa ffmpeg, foto strip tetap jadi tetapi GIF/Live gagal; layar depan kiosk menampilkan peringatan.
- [ ] Unduh **Caddy** (Windows amd64) dari https://caddyserver.com/download, simpan sebagai `deploy\windows\caddy.exe`.
- [ ] Buat atau isi `apps\booth-api\.env`:

  ```env
  OPERATOR_PIN=123456          # PIN panel operator, ganti angkanya
  DEVICE_API_URL=              # kosong = offline; isi domain cloud bila sudah siap (lihat DEPLOY-VERCEL.md)
  DEVICE_KEY=
  PUBLIC_BASE_URL=https://<domain-produksi>
  ```
- [ ] Buka firewall untuk tablet. Jalankan **sekali** di PowerShell *Run as Administrator*:

  ```powershell
  New-NetFirewallRule -DisplayName 'Chamera Booth' -Direction Inbound -Protocol TCP -LocalPort 8443,8080 -Action Allow -Profile Private
  ```
- [ ] Pastikan jaringan Wi-Fi booth di Windows bertipe **Private**: Settings → Network & internet → Wi-Fi → (nama Wi-Fi) → Network profile type.
- [ ] Disarankan: pakai router Wi-Fi sendiri untuk booth (bukan Wi-Fi tamu venue, yang sering memblokir antar-perangkat), dan buat DHCP reservation supaya IP laptop tetap sama.
- [ ] Matikan sleep laptop saat dicolok listrik: Settings → System → Power → Screen and sleep → *Never*.

### A2. Printer

Printer apa pun yang sudah bisa mencetak dari Windows bisa dipakai (USB, Wi-Fi, atau jaringan).

- [ ] Install driver resmi printer, lalu coba cetak satu halaman tes dari Windows.
- [ ] Di Windows → Printers → (printer) → **Printing preferences**, atur kertas default (mis. 4x6 / 10x15 cm, borderless bila ada). Booth tidak mengubah setelan driver.
- [ ] Pemilihan printer di booth dilakukan dari panel operator (langkah B3).

### A3. Tablet (sekali per tablet)

Kamera browser hanya mau aktif di HTTPS yang dipercaya. Booth memakai sertifikat lokal, jadi tiap tablet perlu memasang sertifikat CA-nya **satu kali**. Laptop harus sudah menjalankan skrip di langkah B1, karena sertifikat dibuat saat pertama kali Caddy berjalan.

**Android (Chrome)**

1. Buka `http://<ip-laptop>:8080/ca.crt` sehingga file terunduh.
2. Settings → Security & privacy → More security settings → Encryption & credentials → **Install a certificate** → **CA certificate**, lalu pilih `ca.crt`. Nama menu bisa sedikit berbeda per merek.
3. Tutup Chrome sepenuhnya, lalu buka lagi.

**iPad (Chrome)**

1. Buka `http://<ip-laptop>:8080/ca.crt` di **Safari** (profil hanya bisa dipasang lewat Safari), lalu pilih *Allow*.
2. Settings → **Profile Downloaded** → *Install*.
3. Settings → General → About → **Certificate Trust Settings**, lalu aktifkan *Caddy Local Authority*.
4. Chrome di iPad otomatis ikut percaya.

Lalu, di tablet:

- [ ] Matikan auto-lock/sleep layar.
- [ ] Pasang tablet di stand dengan kamera depan menghadap tamu; pastikan cahaya cukup.

> Sertifikat terikat ke laptop, bukan ke IP. Bila IP laptop berubah, tablet **tidak** perlu memasang ulang; cukup buka URL dengan IP baru. Sertifikat perlu dipasang ulang hanya bila folder `%APPDATA%\Caddy` di laptop dihapus atau laptop diganti.

---

## B. Setiap event

### B1. Nyalakan laptop

1. Sambungkan laptop ke Wi-Fi booth, lalu nyalakan printer.
2. Dari folder repo jalankan:

   ```powershell
   powershell -ExecutionPolicy Bypass -File deploy\windows\start-booth.ps1
   ```

3. Tiga jendela akan terbuka: **Chamera Booth API**, **Chamera Kiosk**, dan **Chamera Caddy**. Biarkan ketiganya terbuka selama event; menutup jendela berarti menghentikan layanan itu.
4. Catat URL yang ditampilkan skrip, misalnya `https://192.168.1.50:8443`.

> IP salah terdeteksi (mis. karena VPN atau dua adapter)? Jalankan ulang dengan `-BoothHost 192.168.x.x`.
> Pertama kali kiosk dibuka, halaman butuh beberapa detik untuk compile; tunggu sampai muncul.

### B2. Buka di tablet

1. Di Chrome tablet, buka `https://<ip-laptop>:8443`.
2. Izinkan akses **kamera** saat diminta.
3. Tunggu tombol **"Mulai aja dulu!"** aktif (pemeriksaan sistem ±3 detik). Peringatan kuning di atas tombol, misalnya status printer, tidak menghalangi sesi.

### B3. Atur dan uji printer (panel operator)

1. Buka `https://<ip-laptop>:8443/operator`, lalu masukkan PIN dari `.env`.
2. Isi pengaturan:
   - **Mode**: *Cetak foto*, atau *Digital saja (QR)* bila tanpa printer.
   - **Printer**: pilih dari daftar printer di laptop (status ikut ditampilkan).
   - **Skala cetak**:

     | Pilihan | Kapan dipakai |
     |---|---|
     | Ukuran asli 4x6 | Printer foto 4R. Di kertas A4, foto tercetak 10x15 cm untuk dipotong. |
     | Sesuaikan kertas | Tepi foto terpotong, atau ingin foto memenuhi kertas lain. |
     | Perkecil bila perlu | Ukuran asli, tetapi diperkecil bila area cetak printer lebih kecil. |
   - **Jumlah salinan** dan **ukuran kertas**: kosongkan ukuran kertas agar mengikuti setelan driver.
3. Tekan **Simpan**, lalu **Test Print**. Halaman uji punya garis merah di tepi foto dan garis putus-putus 5 mm dari tepi: pakai untuk mengecek apakah ada yang terpotong.
4. Pengaturan tersimpan di laptop dan berlaku mulai sesi berikutnya.

### B4. Kunci tablet ke mode kiosk

- **Android**: menu Chrome (⋮) → *Add to Home screen*, lalu buka booth dari ikon itu (tampil layar penuh). Aktifkan *App pinning* (Settings → Security → App pinning) dan pin aplikasinya.
- **iPad**: tombol Share → *Add to Home Screen*, lalu buka dari ikon. Aktifkan **Guided Access** (Settings → Accessibility → Guided Access) dan tekan tombol samping 3x untuk mengunci.

Selama booth terbuka, layar dijaga tetap menyala dan masuk layar penuh pada sentuhan pertama.

### B5. Checklist sebelum booth dibuka

- [ ] Satu sesi uji penuh dari tablet: pilih frame → foto → preview → **cetak** → QR muncul.
- [ ] Hasil cetak rapi (tidak terpotong, tidak miring).
- [ ] Scan QR dari HP (memakai data seluler, bukan Wi-Fi booth). Bila cloud belum siap, link baru bisa dibuka setelah sync berjalan.
- [ ] Kertas dan tinta/ribbon cukup; charger tablet dan laptop terpasang.

### B6. Selama event

- **Printer kehabisan kertas, macet, atau dimatikan**: sesi tetap jalan dan tamu tetap mendapat QR. Job yang sudah terkirim ke antrean Windows akan tercetak saat printer siap lagi. Job yang gagal 3 kali ditandai gagal dan pesannya tampil di layar hasil.
- **Cetak ulang**: bila booth online, pakai tombol *Reprint* di dashboard admin → Sesi (booth mengambil perintah dalam ±30 detik). Panel operator lokal belum punya tombolnya; saat offline jalankan di laptop (ganti PIN dan ID sesi):

  ```powershell
  Invoke-RestMethod -Method Post -Uri http://127.0.0.1:4000/api/operator/reprint/<session-id> -Headers @{ 'X-Operator-Pin' = '123456' }
  ```
- **Tablet keluar dari halaman/terkunci**: buka lagi dari ikon Home Screen. Sesi yang tertinggal dibersihkan otomatis oleh timer.
- **Status booth**: panel operator → *Status Sistem* (antrean sync, sisa disk).

### B7. Menutup

1. Tunggu antrean sync habis bila online (panel operator → *Antrean Sync* = 0).
2. Tutup ketiga jendela (Booth API, Kiosk, Caddy).
3. Data sesi dan foto tersimpan di `apps\booth-api\data`; jangan dihapus sebelum tersinkron.

---

## Troubleshooting

| Gejala | Penyebab / solusi |
|---|---|
| "Your connection is not private" | Sertifikat belum dipasang, atau di iPad belum diaktifkan di *Certificate Trust Settings* (A3). |
| Tablet tidak bisa membuka halaman sama sekali | Firewall belum dibuka (A1), profil Wi-Fi bukan *Private*, tablet tersambung ke Wi-Fi lain/Wi-Fi tamu, atau IP laptop berubah (lihat jendela skrip). |
| Skrip berhenti: "Port berikut sudah dipakai program lain", atau jendela menampilkan `EADDRINUSE` / `address already in use` | Port bentrok dengan aplikasi lain atau jendela Chamera lama. Lihat `PORT-BENTROK.md`. |
| `http://<ip>:8080/ca.crt` tidak terbuka | Jendela *Chamera Caddy* tertutup atau error; jalankan ulang skrip. |
| Kamera hitam / izin kamera tidak muncul | Halaman dibuka lewat `http://` atau `localhost`. Pakai `https://<ip>:8443`. Tutup aplikasi lain yang memakai kamera. |
| Tombol Start tidak aktif | Lihat pesan merah di atas tombol. Biasanya jendela *Booth API* tertutup atau error. |
| Panel operator "PIN salah" terus | `OPERATOR_PIN` belum ada di `apps\booth-api\.env`, atau Booth API belum di-restart setelah `.env` diubah. |
| "Printer ... tidak ditemukan" | Printer dilepas/berganti nama. Pilih ulang di panel operator, lalu Simpan. |
| Printer "Offline" | Printer mati, kabel/Wi-Fi printer putus, atau Windows menandai *Use Printer Offline* (Windows → Printers → buka antrean → Printer → hilangkan centang). |
| Tepi foto terpotong | Ganti skala ke **Sesuaikan kertas**, atau aktifkan borderless di driver. |
| Foto tercetak kecil di kertas besar | Normal untuk **Ukuran asli 4x6**. Pakai **Sesuaikan kertas** bila ingin penuh. |
| Upload foto gagal / sesi berhenti di tengah | Wi-Fi lemah. Dekatkan router, pastikan Chrome tetap di depan (jangan pindah aplikasi saat sesi). |
| Log Booth API berisi `ENOTFOUND` / gagal sync | `DEVICE_API_URL` salah atau cloud belum siap. Kosongkan untuk mode offline (lihat `DEPLOY-VERCEL.md`). |

## Uji cepat sebelum event (opsional, untuk teknisi)

Dengan Booth API berjalan memakai folder data **terpisah** (skrip mengubah pengaturan sementara):

```powershell
$env:DATA_DIR = "$env:TEMP\booth-e2e"; $env:BOOTH_API_PORT = 4200; $env:OPERATOR_PIN = '1234'
pnpm --filter @chamera/booth-api dev          # jendela 1
# jendela 2:
$env:DATA_DIR = "$env:TEMP\booth-e2e"; $env:BOOTH_API_URL = 'http://127.0.0.1:4200'; $env:OPERATOR_PIN = '1234'
pnpm --filter @chamera/booth-api test:e2e
```

Hasil `=== E2E PASS ===` berarti alur sesi, timer, render, antrean cetak, dan antrean sync sehat.

## Catatan keamanan

Endpoint sesi Booth API tidak memakai autentikasi: siapa pun di Wi-Fi yang sama bisa mengaksesnya. Pakai Wi-Fi khusus booth, jangan Wi-Fi publik, dan jangan pernah membuka port 8443/8080 ke internet (port forwarding router).
