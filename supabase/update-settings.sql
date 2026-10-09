-- Update settings untuk Main Booth agar output full (strip + gif + live)
-- Booth ID untuk Main Booth: 00000000-0000-0000-0000-000000000001

UPDATE settings 
SET 
  output_mode = 'full',
  base_price = 50000,
  timers = '{"frame":30,"action":120,"preview":45,"qr":15,"closing":5,"reminder_sec":15,"max_retake":3,"countdown":5}'::jsonb,
  camera = '{"width":1920,"height":1080,"mirror_preview":true}'::jsonb,
  live_config = '{"clip_sec":5,"codec":"h265","preview_h264":true}'::jsonb
WHERE booth_id = '00000000-0000-0000-0000-000000000001';

-- Verify settings
SELECT * FROM settings WHERE booth_id = '00000000-0000-0000-0000-000000000001';

-- Check if booth exists
SELECT id, name FROM booths WHERE name = 'Main Booth';
