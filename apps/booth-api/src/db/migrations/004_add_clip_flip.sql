-- Klip direkam dari kamera apa adanya; 1 = dibalik horizontal saat render (mode Non-mirror di kiosk).
-- Foto sudah dibalik di kiosk sebelum diunggah.
ALTER TABLE clips ADD COLUMN flipped INTEGER NOT NULL DEFAULT 0;
