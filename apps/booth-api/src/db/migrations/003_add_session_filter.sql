-- Filter foto pilihan tamu di Preview (none | bw | vintage | sepia | smooth)
ALTER TABLE sessions ADD COLUMN filter TEXT NOT NULL DEFAULT 'none';

-- Naik tiap kali filter diganti; render yang dimulai dengan revisi lama dibuang
ALTER TABLE sessions ADD COLUMN render_rev INTEGER NOT NULL DEFAULT 0;
