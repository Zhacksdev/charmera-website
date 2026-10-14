<#
.SYNOPSIS
  Menjalankan booth Chamera di laptop Windows agar bisa dipakai dari tablet (Chrome iPad / Android).

.DESCRIPTION
  Membuka tiga jendela: Booth API (127.0.0.1:4000), Kiosk (127.0.0.1:3000), dan Caddy
  (https://<ip-laptop>:8443 untuk tablet, http://<ip-laptop>:8080/ca.crt untuk sertifikat).
  Semua port bisa diganti bila bentrok dengan aplikasi lain (lihat guide/PORT-BENTROK.md).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File deploy\windows\start-booth.ps1
  powershell -ExecutionPolicy Bypass -File deploy\windows\start-booth.ps1 -BoothHost 192.168.1.50
  powershell -ExecutionPolicy Bypass -File deploy\windows\start-booth.ps1 -Dev   # kiosk mode development
  powershell -ExecutionPolicy Bypass -File deploy\windows\start-booth.ps1 -KioskPort 3100 -ApiPort 4100
#>
param(
  # IP LAN laptop. Kosong = deteksi otomatis dari adapter yang punya gateway.
  [string]$BoothHost = '',
  # Lokasi caddy.exe. Kosong = deploy\windows\caddy.exe, lalu PATH.
  [string]$CaddyPath = '',
  # Kiosk mode development (hot reload, untuk ngoding). Default: build produksi, halaman berpindah
  # tanpa jeda compile dan jauh lebih ringan di tablet.
  [switch]$Dev,
  # Port lokal (hanya di laptop) untuk Booth API dan Kiosk
  [int]$ApiPort = 4000,
  [int]$KioskPort = 3000,
  # Port yang dibuka tablet: HTTPS booth dan unduh sertifikat. Bila diganti, aturan firewall ikut diganti.
  [int]$HttpsPort = 8443,
  [int]$CertPort = 8080
)

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path

function Write-Step($text) { Write-Host "==> $text" -ForegroundColor Cyan }
function Write-Warn($text) { Write-Host "[!] $text" -ForegroundColor Yellow }

# 0. Port: berhenti di awal bila ada yang sudah dipakai, sebelum membuka jendela apa pun
$ports = [ordered]@{
  'Booth API' = @{ Port = $ApiPort; Param = '-ApiPort' }
  'Kiosk' = @{ Port = $KioskPort; Param = '-KioskPort' }
  'HTTPS tablet' = @{ Port = $HttpsPort; Param = '-HttpsPort' }
  'Sertifikat' = @{ Port = $CertPort; Param = '-CertPort' }
}
$uniquePorts = @($ports.Values | ForEach-Object { $_.Port } | Select-Object -Unique)
if ($uniquePorts.Count -ne $ports.Count) {
  throw "Port tidak boleh sama: Booth API $ApiPort, Kiosk $KioskPort, HTTPS $HttpsPort, Sertifikat $CertPort"
}
$conflicts = @()
foreach ($name in $ports.Keys) {
  $port = $ports[$name].Port
  $listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($listener) {
    $proc = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
    $conflicts += [pscustomobject]@{
      Layanan = $name
      Port = $port
      Dipakai = if ($proc) { "$($proc.ProcessName) (PID $($proc.Id))" } else { "PID $($listener.OwningProcess)" }
      Ganti = $ports[$name].Param
    }
  }
}
if ($conflicts.Count -gt 0) {
  Write-Warn 'Port berikut sudah dipakai program lain:'
  $conflicts | Format-Table -AutoSize | Out-String | Write-Host
  Write-Host '    Pilihan:'
  Write-Host '    a) Tutup program itu (bila itu jendela Chamera lama, tutup jendelanya), lalu jalankan ulang skrip.'
  Write-Host '    b) Pakai port lain, mis.:  ... start-booth.ps1 -KioskPort 3100 -ApiPort 4100'
  Write-Host '    Panduan: guide/PORT-BENTROK.md'
  exit 1
}

# 1. IP LAN laptop
if (-not $BoothHost) {
  # Adapter fisik saja: VMware/VirtualBox/Hyper-V/Tailscale bisa punya "gateway" tapi tidak terjangkau tablet
  $config = Get-NetIPConfiguration |
    Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' -and $_.NetAdapter.HardwareInterface } |
    Select-Object -First 1
  if ($config) { $BoothHost = @($config.IPv4Address)[0].IPAddress }
}
if (-not $BoothHost) {
  throw 'IP LAN tidak terdeteksi. Sambungkan laptop ke Wi-Fi booth, atau jalankan dengan -BoothHost <ip>.'
}
Write-Step "IP laptop booth: $BoothHost"

# 2. Caddy
if (-not $CaddyPath) {
  $localCaddy = Join-Path $PSScriptRoot 'caddy.exe'
  if (Test-Path $localCaddy) {
    $CaddyPath = $localCaddy
  } else {
    $cmd = Get-Command caddy -ErrorAction SilentlyContinue
    if ($cmd) { $CaddyPath = $cmd.Source }
  }
}
if (-not $CaddyPath -or -not (Test-Path $CaddyPath)) {
  throw "caddy.exe tidak ditemukan. Unduh dari https://caddyserver.com/download (Windows amd64), simpan sebagai $PSScriptRoot\caddy.exe"
}

# 3. Firewall: tablet harus bisa masuk ke port HTTPS dan sertifikat
$firewallCommand = "New-NetFirewallRule -DisplayName 'Chamera Booth' -Direction Inbound -Protocol TCP -LocalPort $HttpsPort,$CertPort -Action Allow -Profile Private"
$rule = Get-NetFirewallRule -DisplayName 'Chamera Booth' -ErrorAction SilentlyContinue
if (-not $rule) {
  Write-Warn 'Aturan firewall belum ada. Jalankan SEKALI di PowerShell "Run as Administrator":'
  Write-Host "    $firewallCommand"
  Write-Warn 'Pastikan juga jaringan Wi-Fi booth di-set "Private" (Settings > Network & internet > Wi-Fi > properti jaringan).'
} else {
  $allowed = @($rule | Get-NetFirewallPortFilter | ForEach-Object { $_.LocalPort }) | ForEach-Object { "$_" }
  $missing = @("$HttpsPort", "$CertPort") | Where-Object { $allowed -notcontains $_ }
  if ($missing) {
    Write-Warn "Aturan firewall 'Chamera Booth' belum membuka port $($missing -join ', '). Jalankan di PowerShell ""Run as Administrator"":"
    Write-Host "    Remove-NetFirewallRule -DisplayName 'Chamera Booth'; $firewallCommand"
  }
}

# 4. PIN operator
$envFile = Join-Path $Root 'apps\booth-api\.env'
$hasPin = (Test-Path $envFile) -and (Select-String -Path $envFile -Pattern '^\s*OPERATOR_PIN(_HASH)?\s*=\s*\S' -Quiet)
if (-not $hasPin -and -not $env:OPERATOR_PIN -and -not $env:OPERATOR_PIN_HASH) {
  Write-Warn 'OPERATOR_PIN belum diset — panel operator (pengaturan printer) tidak bisa dibuka.'
  Write-Host "    Tambahkan baris  OPERATOR_PIN=123456  ke apps\booth-api\.env"
}

$caDir = Join-Path $env:APPDATA 'Caddy\pki\authorities\local'

# 5. Jalankan layanan, masing-masing di jendela sendiri (tutup jendela = hentikan layanan)
# Kiosk: build produksi lalu start (±1 menit saat pertama), atau dev server bila -Dev
if ($Dev) {
  $kioskCommand = "pnpm --filter @chamera/kiosk exec next dev -H 127.0.0.1 -p $KioskPort"
} else {
  $kioskCommand = "Write-Host 'Build kiosk (produksi)...'; pnpm --filter @chamera/kiosk... run build; if (`$LASTEXITCODE -eq 0) { pnpm --filter @chamera/kiosk exec next start -H 127.0.0.1 -p $KioskPort } else { Write-Host 'Build kiosk gagal, jalankan ulang skrip dengan -Dev' -ForegroundColor Red }"
}

Write-Step 'Menjalankan Booth API, Kiosk, dan Caddy...'
Start-Process powershell -WorkingDirectory $Root -ArgumentList @(
  '-NoExit', '-Command',
  "`$Host.UI.RawUI.WindowTitle = 'Chamera Booth API'; `$env:BOOTH_API_PORT = '$ApiPort'; `$env:KIOSK_ORIGINS = 'http://127.0.0.1:$KioskPort,http://localhost:$KioskPort'; pnpm --filter @chamera/booth-api dev"
)
Start-Process powershell -WorkingDirectory $Root -ArgumentList @(
  '-NoExit', '-Command',
  "`$Host.UI.RawUI.WindowTitle = 'Chamera Kiosk'; `$env:BOOTH_HOST = '$BoothHost'; `$env:BOOTH_API_INTERNAL_URL = 'http://127.0.0.1:$ApiPort'; $kioskCommand"
)
Start-Process powershell -WorkingDirectory $Root -ArgumentList @(
  '-NoExit', '-Command',
  "`$Host.UI.RawUI.WindowTitle = 'Chamera Caddy'; `$env:BOOTH_HOST = '$BoothHost'; `$env:CADDY_CA_DIR = '$caDir'; `$env:BOOTH_HTTPS_PORT = '$HttpsPort'; `$env:BOOTH_CERT_PORT = '$CertPort'; `$env:BOOTH_API_PORT = '$ApiPort'; `$env:KIOSK_PORT = '$KioskPort'; & '$CaddyPath' run --config deploy\tablet\Caddyfile --adapter caddyfile"
)

Write-Host ''
Write-Step 'Siap. Dari tablet (Wi-Fi yang sama):'
Write-Host "    1. Pasang sertifikat (sekali per tablet): http://${BoothHost}:${CertPort}/ca.crt"
Write-Host "    2. Buka kiosk di Chrome:                https://${BoothHost}:${HttpsPort}"
Write-Host "    3. Panel operator / printer:            https://${BoothHost}:${HttpsPort}/operator"
Write-Host ''
Write-Host 'Panduan lengkap: guide/RUNNING-TABLET.md'
