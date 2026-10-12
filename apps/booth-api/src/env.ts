// Harus di-import paling awal di server.ts: beberapa modul membaca process.env saat load.
// Variabel yang sudah ada di environment shell tidak ditimpa.
try {
  process.loadEnvFile()
} catch {
  // .env tidak ada — pakai environment shell saja
}
