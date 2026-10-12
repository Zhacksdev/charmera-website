// Harus di-import paling awal di server.ts. Lokal: baca .env di folder kerja.
// Di Vercel tidak ada file .env — env dari dashboard dipakai; variabel yang sudah ada tidak ditimpa.
try {
  process.loadEnvFile()
} catch {
  // .env tidak ada
}
