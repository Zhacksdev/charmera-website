-- Mode debug cetak (admin → Printer): kiosk menampilkan preview halaman cetak sebelum job masuk antrean
ALTER TABLE settings ADD COLUMN IF NOT EXISTS print_debug BOOLEAN NOT NULL DEFAULT false;
