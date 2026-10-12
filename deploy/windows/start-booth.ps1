<#
.SYNOPSIS
  Menjalankan booth Chamera di laptop Windows agar bisa dipakai dari tablet (Chrome iPad / Android).

.DESCRIPTION
  Membuka tiga jendela: Booth API (127.0.0.1:4000), Kiosk (127.0.0.1:3000), dan Caddy
  (https://<ip-laptop>:8443 untuk tablet, http://<ip-laptop>:8080/ca.crt untuk sertifikat).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File deploy\windows\start-booth.ps1
  powershell -ExecutionPolicy Bypass -File deploy\windows\start-booth.ps1 -BoothHost 192.168.1.50
  powershell -ExecutionPolicy Bypass -File deploy\windows\start-booth.ps1 -Dev   # kiosk mode development
#>
param(
  # IP LAN laptop. Kosong = deteksi otomatis dari adapter yang punya gateway.
  [string]$BoothHost = '',
  # Lokasi caddy.exe. Kosong = deploy\windows\caddy.exe, lalu PATH.
  [string]$CaddyPath = '',
  # Kiosk mode development (hot reload, untuk ngoding). Default: build produksi, halaman berpindah
  # tanpa jeda compile dan jauh lebih ringan di tablet.
  [switch]$Dev
)

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path

function Write-Step($text) { Write-Host "==> $text" -ForegroundColor Cyan }
function Write-Warn($text) { Write-Host "[!] $text" -ForegroundColor Yellow }

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

# 3. Firewall: tablet harus bisa masuk ke port 8443 (HTTPS) dan 8080 (unduh sertifikat)
$rule = Get-NetFirewallRule -DisplayName 'Chamera Booth' -ErrorAction SilentlyContinue
if (-not $rule) {
  Write-Warn 'Aturan firewall belum ada. Jalankan SEKALI di PowerShell "Run as Administrator":'
  Write-Host "    New-NetFirewallRule -DisplayName 'Chamera Booth' -Direction Inbound -Protocol TCP -LocalPort 8443,8080 -Action Allow -Profile Private"
  Write-Warn 'Pastikan juga jaringan Wi-Fi booth di-set "Private" (Settings > Network & internet > Wi-Fi > properti jaringan).'
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
  $kioskCommand = 'pnpm --filter @chamera/kiosk exec next dev -H 127.0.0.1 -p 3000'
} else {
  $kioskCommand = 'Write-Host ''Build kiosk (produksi)...''; pnpm --filter @chamera/kiosk... run build; if ($LASTEXITCODE -eq 0) { pnpm --filter @chamera/kiosk exec next start -H 127.0.0.1 -p 3000 } else { Write-Host ''Build kiosk gagal, jalankan ulang skrip dengan -Dev'' -ForegroundColor Red }'
}

Write-Step 'Menjalankan Booth API, Kiosk, dan Caddy...'
Start-Process powershell -WorkingDirectory $Root -ArgumentList @(
  '-NoExit', '-Command',
  "`$Host.UI.RawUI.WindowTitle = 'Chamera Booth API'; pnpm --filter @chamera/booth-api dev"
)
Start-Process powershell -WorkingDirectory $Root -ArgumentList @(
  '-NoExit', '-Command',
  "`$Host.UI.RawUI.WindowTitle = 'Chamera Kiosk'; `$env:BOOTH_HOST = '$BoothHost'; $kioskCommand"
)
Start-Process powershell -WorkingDirectory $Root -ArgumentList @(
  '-NoExit', '-Command',
  "`$Host.UI.RawUI.WindowTitle = 'Chamera Caddy'; `$env:BOOTH_HOST = '$BoothHost'; `$env:CADDY_CA_DIR = '$caDir'; & '$CaddyPath' run --config deploy\tablet\Caddyfile --adapter caddyfile"
)

Write-Host ''
Write-Step 'Siap. Dari tablet (Wi-Fi yang sama):'
Write-Host "    1. Pasang sertifikat (sekali per tablet): http://${BoothHost}:8080/ca.crt"
Write-Host "    2. Buka kiosk di Chrome:                https://${BoothHost}:8443"
Write-Host "    3. Panel operator / printer:            https://${BoothHost}:8443/operator"
Write-Host ''
Write-Host 'Panduan lengkap: guide/RUNNING-TABLET.md'
