-- Backward-compatible fixes for databases created from earlier schema versions.
-- This migration does not drop tables or delete application data.

ALTER TABLE public.sessions
  ALTER COLUMN frame_id DROP NOT NULL;

ALTER TABLE public.frames
  ALTER COLUMN source_key DROP NOT NULL,
  ALTER COLUMN keyed_key DROP NOT NULL;

ALTER TABLE public.audit_logs
  ALTER COLUMN admin_id DROP NOT NULL;

ALTER TABLE public.device_commands
  ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES public.sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS error_message TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.outputs'::regclass
      AND conname = 'outputs_session_type_unique'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM public.outputs
      GROUP BY session_id, type
      HAVING COUNT(*) > 1
    ) THEN
      RAISE EXCEPTION 'Cannot add outputs_session_type_unique: duplicate (session_id, type) rows exist in public.outputs';
    END IF;

    ALTER TABLE public.outputs
      ADD CONSTRAINT outputs_session_type_unique UNIQUE (session_id, type);
  END IF;
END;
$$;