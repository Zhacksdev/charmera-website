-- Sessions table (local booth)
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  public_code TEXT UNIQUE NOT NULL,
  frame_id TEXT,
  config_version INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'created',
  sync_status TEXT NOT NULL DEFAULT 'pending',
  frame_selected_by TEXT,
  custom_text TEXT,
  price INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  expires_at TEXT,
  synced_at TEXT,
  stage_expires_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_sync_status ON sessions(sync_status);
CREATE INDEX IF NOT EXISTS idx_sessions_public_code ON sessions(public_code);

-- Photos table (local)
CREATE TABLE IF NOT EXISTS photos (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  slot_index INTEGER NOT NULL,
  retake_count INTEGER DEFAULT 0,
  path TEXT NOT NULL,
  s3_key TEXT,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_photos_session_id ON photos(session_id);

-- Clips table (local)
CREATE TABLE IF NOT EXISTS clips (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  slot_index INTEGER NOT NULL,
  path TEXT NOT NULL,
  s3_key TEXT,
  duration_ms INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_clips_session_id ON clips(session_id);

-- Outputs table (local)
CREATE TABLE IF NOT EXISTS outputs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  type TEXT NOT NULL,
  path TEXT NOT NULL,
  s3_key TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_outputs_session_id ON outputs(session_id);

-- Print jobs table (local)
CREATE TABLE IF NOT EXISTS print_jobs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  attempts INTEGER DEFAULT 0,
  error_message TEXT,
  printer_name TEXT,
  copies INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_print_jobs_session_id ON print_jobs(session_id);

-- Render jobs table (local)
CREATE TABLE IF NOT EXISTS render_jobs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_render_jobs_session_id ON render_jobs(session_id);

-- Outbox table (sync queue)
CREATE TABLE IF NOT EXISTS outbox (
  id TEXT PRIMARY KEY,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  op TEXT NOT NULL,
  payload TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 5,
  attempts INTEGER DEFAULT 0,
  next_try_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_outbox_status ON outbox(status);
CREATE INDEX IF NOT EXISTS idx_outbox_priority ON outbox(priority);

-- Config cache table
CREATE TABLE IF NOT EXISTS config_cache (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Preflight results table
CREATE TABLE IF NOT EXISTS preflight_results (
  id TEXT PRIMARY KEY,
  checked_at TEXT NOT NULL DEFAULT (datetime('now')),
  result TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_preflight_checked_at ON preflight_results(checked_at);
