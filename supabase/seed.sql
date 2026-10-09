-- Insert default settings
INSERT INTO settings (key, value, updated_at) VALUES
('price', '50000', NOW()),
('output_mode', 'full', NOW()),
('print_mode', 'auto', NOW()),
('timer_frame_select_sec', '30', NOW()),
('timer_action_countdown_sec', '3', NOW()),
('timer_result_sec', '15', NOW()),
('camera_width', '1920', NOW()),
('camera_height', '1080', NOW()),
('printer_name', 'default', NOW()),
('printer_media_capacity', '100', NOW())
ON CONFLICT (key) DO NOTHING;

-- Update booth with correct device key hash
-- Generate your DEVICE_KEY locally with: openssl rand -hex 32
-- Then hash it: echo -n "YOUR_DEVICE_KEY" | sha256sum
-- Replace the hash below with your actual hash
UPDATE booths 
SET device_key_hash = 'REPLACE_WITH_YOUR_DEVICE_KEY_HASH'
WHERE name = 'Main Booth';

-- Verify frames exist
SELECT id, name, active FROM frames;

-- Verify settings
SELECT * FROM settings;
