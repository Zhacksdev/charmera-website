-- Add timer_snapshot column to sessions table
ALTER TABLE sessions ADD COLUMN timer_snapshot TEXT;

-- Add index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_sessions_status_expires ON sessions(status, stage_expires_at);
