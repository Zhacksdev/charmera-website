-- M1: Initial schema for Chamera photobooth

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Booths table
CREATE TABLE IF NOT EXISTS booths (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  device_key_hash TEXT NOT NULL,
  last_heartbeat TIMESTAMPTZ,
  app_version TEXT,
  health JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Settings table (one row per booth)
CREATE TABLE IF NOT EXISTS settings (
  booth_id UUID PRIMARY KEY REFERENCES booths(id) ON DELETE CASCADE,
  config_version INT NOT NULL DEFAULT 0,
  output_mode TEXT NOT NULL DEFAULT 'photo_only' CHECK (output_mode IN ('photo_only', 'full')),
  print_mode TEXT NOT NULL DEFAULT 'digital_only' CHECK (print_mode IN ('digital_only', 'local', 'custom_api')),
  printer_name TEXT,
  copies INT DEFAULT 1,
  media_capacity INT,
  media_warn_at INT DEFAULT 10,
  custom_print_config JSONB,
  base_price INT DEFAULT 0,
  retention_days INT DEFAULT 30,
  timers JSONB DEFAULT '{"frame":30,"action":120,"preview":45,"qr":15,"closing":5,"reminder_sec":15,"max_retake":3,"countdown":5}'::jsonb,
  camera JSONB DEFAULT '{"width":1920,"height":1080,"mirror_preview":true}'::jsonb,
  gif_config JSONB,
  live_config JSONB DEFAULT '{"clip_sec":5,"codec":"h265","preview_h264":true}'::jsonb,
  preflight JSONB DEFAULT '{"min_disk_gb":5,"max_outbox_age_hours":24,"fallback_digital_on_printer_fail":true}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Frames table
CREATE TABLE IF NOT EXISTS frames (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booth_id UUID NOT NULL REFERENCES booths(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  source_key TEXT,
  keyed_key TEXT,
  orientation TEXT NOT NULL CHECK (orientation IN ('portrait', 'landscape')),
  canvas_w INT NOT NULL,
  canvas_h INT NOT NULL,
  layout JSONB NOT NULL,
  text_style JSONB,
  extra_price INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_frames_booth_id ON frames(booth_id);
CREATE INDEX IF NOT EXISTS idx_frames_is_active ON frames(is_active);

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  public_code TEXT UNIQUE NOT NULL,
  booth_id UUID NOT NULL REFERENCES booths(id) ON DELETE CASCADE,
  frame_id UUID REFERENCES frames(id) ON DELETE SET NULL,
  config_version INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'frame_selected', 'capturing', 'previewing', 'processing', 'completed', 'abandoned', 'failed')),
  sync_status TEXT NOT NULL DEFAULT 'pending' CHECK (sync_status IN ('pending', 'syncing', 'synced', 'failed')),
  frame_selected_by TEXT CHECK (frame_selected_by IN ('user', 'timeout')),
  custom_text TEXT,
  price INT NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sessions_booth_id ON sessions(booth_id);
CREATE INDEX IF NOT EXISTS idx_sessions_public_code ON sessions(public_code);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_sync_status ON sessions(sync_status);
CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at);

-- Photos table
CREATE TABLE IF NOT EXISTS photos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  slot_index INT NOT NULL,
  retake_count INT DEFAULT 0,
  s3_key TEXT,
  width INT NOT NULL,
  height INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_photos_session_id ON photos(session_id);

-- Clips table
CREATE TABLE IF NOT EXISTS clips (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  slot_index INT NOT NULL,
  s3_key TEXT,
  duration_ms INT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_clips_session_id ON clips(session_id);

-- Outputs table
CREATE TABLE IF NOT EXISTS outputs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('strip', 'gif', 'live_h265', 'live_h264', 'zip')),
  s3_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'rendering', 'done', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT outputs_session_type_unique UNIQUE (session_id, type)
);

CREATE INDEX IF NOT EXISTS idx_outputs_session_id ON outputs(session_id);
CREATE INDEX IF NOT EXISTS idx_outputs_type ON outputs(type);

-- Print jobs table
CREATE TABLE IF NOT EXISTS print_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'printing', 'done', 'failed')),
  attempts INT DEFAULT 0,
  error_message TEXT,
  printer_name TEXT,
  copies INT DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_print_jobs_session_id ON print_jobs(session_id);

-- Device commands table
CREATE TABLE IF NOT EXISTS device_commands (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booth_id UUID NOT NULL REFERENCES booths(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('test_print', 'retry_sync', 'reprint')),
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  payload JSONB,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  done_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_device_commands_booth_id ON device_commands(booth_id);
CREATE INDEX IF NOT EXISTS idx_device_commands_status ON device_commands(status);

-- Downloads table
CREATE TABLE IF NOT EXISTS downloads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  output_type TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_downloads_session_id ON downloads(session_id);

-- Admin users table
CREATE TABLE IF NOT EXISTS admin_users (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- System logs table
CREATE TABLE IF NOT EXISTS system_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booth_id UUID REFERENCES booths(id) ON DELETE SET NULL,
  level TEXT NOT NULL,
  source TEXT NOT NULL,
  event TEXT NOT NULL,
  message TEXT NOT NULL,
  meta JSONB,
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_logs_booth_id ON system_logs(booth_id);
CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON system_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_system_logs_level ON system_logs(level);

-- Audit logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id UUID,
  diff JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_admin_id ON audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

-- Enable RLS
ALTER TABLE booths ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE frames ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE clips ENABLE ROW LEVEL SECURITY;
ALTER TABLE outputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE print_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE downloads ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for admin_users (only admins can access)
DROP POLICY IF EXISTS "Admin users are accessible by admin role only" ON admin_users;
CREATE POLICY "Admin users are accessible by admin role only"
  ON admin_users FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.raw_user_meta_data->>'role' = 'admin'
    )
  );

-- RLS Policies for booths (admin only)
DROP POLICY IF EXISTS "Booths are accessible by admin role only" ON booths;
CREATE POLICY "Booths are accessible by admin role only"
  ON booths FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.user_id = auth.uid()
    )
  );

-- RLS Policies for settings (admin only)
DROP POLICY IF EXISTS "Settings are accessible by admin role only" ON settings;
CREATE POLICY "Settings are accessible by admin role only"
  ON settings FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.user_id = auth.uid()
    )
  );

-- RLS Policies for frames (admin only)
DROP POLICY IF EXISTS "Frames are accessible by admin role only" ON frames;
CREATE POLICY "Frames are accessible by admin role only"
  ON frames FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.user_id = auth.uid()
    )
  );

-- RLS Policies for sessions (admin only)
DROP POLICY IF EXISTS "Sessions are accessible by admin role only" ON sessions;
CREATE POLICY "Sessions are accessible by admin role only"
  ON sessions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.user_id = auth.uid()
    )
  );

-- RLS Policies for system_logs (admin only)
DROP POLICY IF EXISTS "System logs are accessible by admin role only" ON system_logs;
CREATE POLICY "System logs are accessible by admin role only"
  ON system_logs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.user_id = auth.uid()
    )
  );

-- RLS Policies for audit_logs (admin only)
DROP POLICY IF EXISTS "Audit logs are accessible by admin role only" ON audit_logs;
CREATE POLICY "Audit logs are accessible by admin role only"
  ON audit_logs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.user_id = auth.uid()
    )
  );

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_settings_updated_at ON settings;
CREATE TRIGGER update_settings_updated_at
  BEFORE UPDATE ON settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Initial booth (for single booth setup in v1)
INSERT INTO booths (id, name, device_key_hash)
SELECT '00000000-0000-0000-0000-000000000001', 'Main Booth', ''
WHERE NOT EXISTS (SELECT 1 FROM booths WHERE name = 'Main Booth')
ON CONFLICT (id) DO NOTHING;

-- Initial settings for the booth
INSERT INTO settings (booth_id)
SELECT id FROM booths WHERE name = 'Main Booth' ORDER BY created_at LIMIT 1
ON CONFLICT (booth_id) DO NOTHING;
