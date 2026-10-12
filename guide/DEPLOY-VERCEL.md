# Checklist Deploy ke Vercel

Checklist sebelum dan sesudah deploy cloud (cloud-api, halaman download, dashboard admin) ke Vercel. Booth (kiosk + booth-api) **tidak** di-deploy ke Vercel; booth tetap berjalan di laptop dan hanya menghubungi cloud. Lihat `RUNNING-TABLET.md`.

## Gambaran

Satu project Vercel (`charmera-website-prod`, framework **Services**, Node 24) dengan tiga service di satu domain:

| Path | Service | Root | Isi |
|---|---|---|---|
| `/api/*`, `/health` | `cloud-api` | `apps/cloud-api` | Express: Public API, Device API (booth), Admin API |
| `/download/*` | `download` | `apps/download` | Halaman QR download untuk tamu |
| semua path lain | `admin` | `apps/admin` | Dashboard admin |

Build command tiap service menjalankan `pnpm install` untuk **seluruh workspace**, termasuk paket booth (`better-sqlite3`, `sharp`, `pdf-to-printer`), lalu mem-build service tersebut.

> Konfigurasi Services (root, build command, routing) **tidak tersimpan di repo**: tidak ada `vercel.json`. Nilai di atas diambil dari hasil `vercel build` terakhir (`.vercel/output/config.json`). Catat atau screenshot pengaturan di dashboard Vercel sebelum mengubahnya.

---

## 0. Keamanan dulu: kunci yang bocor

Commit di GitHub (`Zhacksdev/charmera-website`) memuat kunci asli di `QUICK-DEPLOY.md` dan `guide/VERCEL-DEPLOYMENT.md`: **Supabase `service_role`**, **anon key**, dan **access key + secret R2**. Menghapus file dari folder kerja tidak menghapusnya dari riwayat git.

- [ ] Rotate **Supabase**: Project Settings → API → JWT secret / API keys. `service_role` memberi akses penuh ke database.
- [ ] Rotate **R2**: buat token baru, lalu hapus token lama di Cloudflare → R2 → Manage API Tokens.
- [ ] Ganti **DEVICE_KEY** booth bila nilai contoh di `SETUP-ONLINE.md` lama pernah dipakai sungguhan (lihat bagian 4).
- [ ] Simpan kunci baru **hanya** di Environment Variables Vercel dan `.env` lokal (sudah di `.gitignore`). Jangan tulis di dokumen.
- [ ] Bila repo publik atau pernah dibagikan, pertimbangkan membersihkan riwayat (`git filter-repo`) setelah rotate. Rotate tetap wajib karena kunci lama harus dianggap sudah bocor.

---

## 1. Sebelum push (di laptop)

- [ ] `pnpm install --frozen-lockfile` lolos. Vercel memakai lockfile; bila `package.json` berubah tanpa `pnpm-lock.yaml` ikut di-commit, build gagal.
- [ ] Commit `pnpm-lock.yaml` bersama setiap perubahan `package.json`.
- [ ] Build ketiga service lokal:

  ```bash
  pnpm --filter @chamera/cloud-api... run build
  pnpm --filter @chamera/admin... run build
  pnpm --filter @chamera/download... run build
  ```
- [ ] Tidak ada `.env`, `data/`, `*.db`, atau `deploy/windows/caddy.exe` yang ikut di-commit (`git status` sebelum commit).
- [ ] `better-sqlite3` tetap di versi **`12.8.0`** (`apps/booth-api/package.json`). Versi ini punya binary siap pakai untuk Linux Node 24 (Vercel) **dan** Windows Node 20 (laptop booth). Versi 11.x tidak punya binary Node 24, sehingga build Vercel mencoba compile dan bisa gagal; versi 12.10+ tidak punya binary Windows Node 20.

---

## 2. Environment variables di Vercel

Atur di Project → Settings → Environment Variables, scope **Production** (tambahkan Preview bila preview juga dipakai).

| Variabel | Dipakai oleh | Isi |
|---|---|---|
| `SUPABASE_URL` | cloud-api | `https://<ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | cloud-api | service role (rahasia, kunci **baru**) |
| `SUPABASE_ANON_KEY` | cloud-api | anon key (verifikasi JWT admin) |
| `S3_REGION` | cloud-api | `auto` untuk R2 |
| `S3_BUCKET` | cloud-api | nama bucket |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | cloud-api | kunci R2 (baru) |
| `S3_ENDPOINT` | cloud-api | `https://<accountid>.r2.cloudflarestorage.com` |
| `ADMIN_ORIGIN` | cloud-api | `https://<domain-produksi>` (CORS Admin API) |
| `NEXT_PUBLIC_SUPABASE_URL` | admin | sama dengan `SUPABASE_URL` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | admin | anon key |
| `NEXT_PUBLIC_ADMIN_API_URL` | admin | `https://<domain-produksi>` |
| `NEXT_PUBLIC_API_URL` | download | `https://<domain-produksi>/api/public` |

Hal yang sering terlewat:

- [ ] **`NEXT_PUBLIC_*` dibakar saat build.** Setelah mengubahnya, lakukan **Redeploy**. Mengubah env saja tidak cukup.
- [ ] Binding Services menyuntikkan `ADMIN_API_URL` dan `PUBLIC_API_URL`, tetapi **kode membaca `NEXT_PUBLIC_ADMIN_API_URL` dan `NEXT_PUBLIC_API_URL`**. Isi keduanya secara manual. Tanpa itu, admin memanggil `http://localhost:4001` dan halaman download memanggil `https://domain.com/api/public`.
- [ ] Jangan pernah memberi awalan `NEXT_PUBLIC_` pada `SERVICE_ROLE_KEY` atau secret R2. Awalan itu membuat nilainya terkirim ke browser.

---

## 3. Supabase dan R2

- [ ] Migrasi dijalankan berurutan: `supabase/migrations/20260101000000_initial_schema.sql`, `…000001_admin_auth.sql`, `…000002_online_fixes.sql`. Pada project yang sudah berjalan, jalankan hanya yang belum.
- [ ] Ada user admin di Authentication dan barisnya di tabel `admin_users`.
- [ ] Bucket R2 **private** (tanpa akses publik). Link download memakai presigned URL yang berlaku 1 jam; tamu cukup memuat ulang halaman bila link kedaluwarsa.

---

## 4. Menghubungkan booth

- [ ] Buat `DEVICE_KEY` baru dan hash-nya di laptop booth (PowerShell):

  ```powershell
  $b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  $key = -join ($b | ForEach-Object { '{0:x2}' -f $_ })
  $hash = (Get-FileHash -InputStream ([IO.MemoryStream]::new([Text.Encoding]::UTF8.GetBytes($key))) -Algorithm SHA256).Hash.ToLower()
  "DEVICE_KEY=$key"; "hash=$hash"
  ```

  (Linux/macOS: `openssl rand -hex 32`, lalu `echo -n <key> | sha256sum`.)
- [ ] Simpan hash itu di Supabase:

  ```sql
  update booths set device_key_hash = '<sha256-hex>' where name = 'Main Booth';
  ```
- [ ] Di `apps/booth-api/.env` laptop booth:

  ```env
  DEVICE_API_URL=https://<domain-produksi>
  DEVICE_KEY=<key-asli>
  PUBLIC_BASE_URL=https://<domain-produksi>
  ```

  QR berisi `{PUBLIC_BASE_URL}/download/{kode}`. Karena halaman download ada di domain yang sama, `PUBLIC_BASE_URL` cukup domainnya.
- [ ] Restart booth-api. Log harus memuat `Config pulled` dan `Device link started`; `Invalid device key` berarti hash tidak cocok.
- [ ] Frame yang PNG keyed-nya gagal diunduh tidak ditampilkan ke tamu (log: `Frame dilewati`). Pastikan R2 terkonfigurasi sebelum mengunggah frame di admin.

---

## 5. Deployment Protection

- [ ] Halaman download dan Device API harus bisa diakses **tanpa login Vercel**. Pakai **domain produksi** (custom domain atau domain produksi project), bukan URL deployment acak (`…-<hash>-<team>.vercel.app`), yang bisa terkunci oleh *Vercel Authentication*.
- [ ] Cek dari jendela incognito atau HP tanpa login Vercel.

---

## 6. Uji setelah deploy

Ganti `D` dengan domain produksi.

| Cek | Perintah / URL | Hasil yang benar |
|---|---|---|
| Cloud API hidup | `curl https://D/api/health` | JSON `{"status":"ok",...}` |
| Routing `/api` ke cloud-api | `curl https://D/api/public/download/ABCDEFGHJKLM` | **JSON** error dari Express (mis. 404 `{"error":...}`), bukan teks `NOT_FOUND` dari Vercel |
| Device API + key | `curl -H "Authorization: Bearer <DEVICE_KEY>" https://D/api/device/config` | 200 JSON config |
| Halaman download | buka `https://D/download/<kode-sesi-asli>` | halaman Chamera, tombol download berfungsi |
| Admin | buka `https://D/login` | form login, bisa masuk dengan admin |
| Config sampai ke booth | ubah Timer di admin | booth log `Config pulled` dalam ±60 detik |
| Heartbeat | admin → Kesehatan | booth *online*, status printer & disk terisi (±60 detik) |
| Perintah dashboard | admin → Printer → Test Print | booth log `Device command executed` dalam ±30 detik |
| Ujung ke ujung | satu sesi di booth, scan QR dari HP (data seluler) | file bisa diunduh |

Gunakan `/api/health`, bukan `/health`, untuk mengecek cloud-api: dashboard admin juga punya halaman `/health`, sehingga hasil `/health` bisa menipu.

---

## 7. Batasan yang perlu diketahui

- **Rate limit disimpan di memori** per instance function. Di Vercel, batasnya tidak akurat (tiap instance punya hitungan sendiri). Server juga tidak menyetel `trust proxy`, jadi perlu dicek apakah `req.ip` berisi IP tamu atau IP proxy Vercel. Kalau IP proxy, semua tamu berbagi kuota 100 request/menit di Public API dan bisa terkena 429 saat event ramai.
- **Body request maksimal 4,5 MB** di Vercel Functions. Upload frame di admin dikirim sebagai base64 (~1,33× ukuran file), jadi PNG frame di atas ±3 MB akan ditolak. File hasil booth tidak kena batas ini karena diunggah langsung ke R2 lewat presigned URL.
- **Services masih fitur eksperimental Vercel** (`experimentalServicesV2`). Simpan cadangan pengaturannya (lihat Gambaran).

---

## Status per 12 Oktober 2026

Hasil cek terhadap URL yang tercatat di `.env` booth:

- `https://charmera-website-md8a-rouge.vercel.app` hanya menyajikan **admin**: `/login` 200, tetapi `/api/health`, `/api/public/...`, `/api/device/...`, dan `/download/...` mengembalikan `NOT_FOUND` dari Vercel. Cloud-api dan halaman download belum aktif di sana, sehingga sync booth dan link QR akan gagal.
- `https://charmera-website-prod.vercel.app` mengembalikan `DEPLOYMENT_NOT_FOUND`.

Sebelum event, deploy ulang sampai semua baris di bagian 6 lolos, lalu perbarui `DEVICE_API_URL` dan `PUBLIC_BASE_URL` di laptop booth. Selama cloud belum siap, kosongkan `DEVICE_API_URL` supaya booth berjalan offline: sesi, render, dan cetak tetap jalan, lalu antrean sync terkirim begitu URL diisi.
