# Port Bentrok di Laptop Booth

Booth memakai empat port di laptop. Bila salah satunya sudah dipakai aplikasi lain (XAMPP, VMware, proyek Node lain, antivirus, dan sebagainya), layanan booth gagal jalan atau tablet membuka aplikasi yang salah.

| Layanan | Port default | Diakses dari | Parameter skrip |
|---|---|---|---|
| Booth API | 4000 | laptop saja (127.0.0.1) | `-ApiPort` |
| Kiosk | 3000 | laptop saja (127.0.0.1) | `-KioskPort` |
| HTTPS booth (Caddy) | 8443 | tablet: `https://<ip>:8443` | `-HttpsPort` |
| Unduh sertifikat (Caddy) | 8080 | tablet: `http://<ip>:8080/ca.crt` | `-CertPort` |

## 1. Kenali gejalanya

- Skrip `start-booth.ps1` berhenti dengan pesan **"Port berikut sudah dipakai program lain"** beserta tabel port, nama program, dan PID. Skrip sengaja berhenti sebelum membuka jendela apa pun.
- Jendela *Chamera Booth API* / *Chamera Kiosk* menampilkan `EADDRINUSE` atau `address already in use`.
- Jendela *Chamera Caddy* menampilkan `bind: Only one usage of each socket address` atau `address already in use`.
- Error `An attempt was made to access a socket in a way forbidden by its access permissions`: port dicadangkan Windows (lihat bagian 4).
- Tablet membuka halaman yang bukan booth: aplikasi lain sedang memakai port 8443.

## 2. Cari program yang memakai port

Jalankan di PowerShell (ganti `3000` dengan port yang bentrok):

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen | ForEach-Object { Get-Process -Id $_.OwningProcess }
```

Alternatif dari Command Prompt:

```bat
netstat -ano | findstr :3000
tasklist /FI "PID eq 12345"
```

Program yang sering bentrok:

| Port | Biasanya dipakai |
|---|---|
| 3000 | proyek Node/React/Next lain yang sedang jalan |
| 4000 | proyek Node lain, Jekyll |
| 8080 | XAMPP/Apache, Tomcat, Jenkins, proxy |
| 8443 | VMware Workstation (Shared VMs), Tomcat HTTPS, aplikasi antivirus |

`node` atau `caddy` dengan PID yang belum ditutup biasanya adalah **jendela Chamera dari sesi sebelumnya**.

## 3. Pilih salah satu solusi

### A. Tutup program yang bentrok (paling mudah)

1. Bila itu jendela Chamera lama (*Chamera Booth API*, *Chamera Kiosk*, *Chamera Caddy*), tutup jendelanya.
2. Bila program lain dan memang tidak dipakai selama event, tutup dari aplikasinya, atau hentikan lewat PowerShell:

   ```powershell
   Stop-Process -Id 12345
   ```

   Jangan menghentikan proses yang tidak dikenal; cari dulu namanya (langkah 2).
3. Jalankan ulang skrip:

   ```powershell
   powershell -ExecutionPolicy Bypass -File deploy\windows\start-booth.ps1
   ```

### B. Pindahkan booth ke port lain

**Port lokal (Booth API, Kiosk)** hanya dipakai di dalam laptop. Mengganti keduanya tidak mengubah apa pun di tablet:

```powershell
powershell -ExecutionPolicy Bypass -File deploy\windows\start-booth.ps1 -KioskPort 3100 -ApiPort 4100
```

**Port tablet (HTTPS, sertifikat)** mengubah alamat yang dibuka tablet:

```powershell
powershell -ExecutionPolicy Bypass -File deploy\windows\start-booth.ps1 -HttpsPort 9443 -CertPort 9080
```

Setelah mengganti port tablet:

1. **Firewall**: buka port baru. Skrip menampilkan perintahnya bila aturan lama belum mencakup port baru. Jalankan di PowerShell *Run as Administrator*:

   ```powershell
   Remove-NetFirewallRule -DisplayName 'Chamera Booth'
   New-NetFirewallRule -DisplayName 'Chamera Booth' -Direction Inbound -Protocol TCP -LocalPort 9443,9080 -Action Allow -Profile Private
   ```
2. **Tablet**: buka alamat baru yang ditampilkan skrip (mis. `https://<ip>:9443`). Ikon booth di Home Screen masih menunjuk ke port lama, jadi hapus lalu *Add to Home screen* lagi dari alamat baru.
3. **Sertifikat tidak perlu dipasang ulang**: sertifikat terikat ke laptop, bukan ke port.

Pilih port di atas 1024 yang tidak dipakai, mis. 3100–3199, 4100–4199, 9443, 9080. Semua port harus berbeda satu sama lain; skrip menolak bila ada yang sama.

### Supaya tidak mengetik parameter tiap event

Buat file `start-booth-custom.cmd` di folder repo, lalu jalankan dengan klik dua kali:

```bat
@echo off
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File deploy\windows\start-booth.ps1 -KioskPort 3100 -ApiPort 4100
```

## 4. Port dicadangkan Windows (Hyper-V, WSL, Docker)

Bila error berbunyi *"access a socket in a way forbidden"* tetapi langkah 2 tidak menemukan program apa pun, port itu masuk rentang yang dicadangkan Windows. Cek rentangnya:

```powershell
netsh interface ipv4 show excludedportrange protocol=tcp
```

Pilih port di luar semua rentang yang tampil, lalu jalankan skrip dengan parameter port (solusi B).

## 5. Cek setelah booth jalan

Dari laptop:

```powershell
curl.exe -s http://127.0.0.1:4000/health                   # Booth API (ganti 4000 bila -ApiPort)
curl.exe -s -o NUL -w "%{http_code}`n" http://127.0.0.1:3000  # Kiosk, harus 200 (ganti 3000 bila -KioskPort)
```

Dari tablet: alamat sertifikat dan alamat booth yang ditampilkan skrip harus terbuka. Bila tablet tidak bisa membuka keduanya padahal laptop sehat, periksa firewall dan profil Wi-Fi **Private** (lihat `RUNNING-TABLET.md`).

## Catatan

- Caddy tidak lagi membuka port admin 2019 (`admin off` di `deploy/tablet/Caddyfile`), jadi tidak bentrok dengan Caddy lain di laptop.
- Panel operator ikut pindah bersama port HTTPS: `https://<ip>:<HttpsPort>/operator`.
