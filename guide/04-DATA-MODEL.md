# 04. Model Data

Cloud memakai Supabase Postgres. Booth memakai SQLite lokal dengan struktur sesi yang sama, ditambah tabel antrean sinkron.

```sql
-- CLOUD (Supabase Postgres)
booths(id, name, device_key_hash, last_heartbeat timestamptz, app_version, health jsonb, created_at)

settings(booth_id PK, config_version int, output_mode text,   -- 'photo_only' | 'full'
  print_mode text,                                            -- 'digital_only' | 'local' | 'custom_api'
  printer_name text, copies int default 1, media_capacity int, media_warn_at int default 10,
  custom_print_config jsonb, base_price int, retention_days int default 30,
  timers jsonb,    -- {frame:30, action:120, preview:45, qr:15, closing:5, reminder_sec:15, max_retake:3, countdown:5}
  camera jsonb,    -- {device_id, width, height, mirror_preview}
  gif_config jsonb, live_config jsonb,   -- live: {clip_sec:5, codec:'h265', preview_h264:true}
  preflight jsonb, -- ambang disk, umur outbox, fallback digital
  updated_at)

frames(id, booth_id, name, source_key text, keyed_key text,   -- green screen asli + PNG transparan
  orientation text, canvas_w int, canvas_h int,
  layout jsonb,    -- {slots:[{n,x,y,w,h}], text_area:{x,y,w,h}}
  text_style jsonb, extra_price int default 0, is_active bool, sort_order int, created_at)

sessions(id uuid, public_code text unique, booth_id, frame_id, config_version int,
  status text, sync_status text,    -- sync: pending | syncing | synced | failed
  frame_selected_by text,           -- 'user' | 'timeout'
  custom_text text, price int,
  started_at, completed_at, expires_at, synced_at)

photos(id, session_id, slot_index int, retake_count int, s3_key text, width int, height int, created_at)
clips(id, session_id, slot_index int, s3_key text, duration_ms int)
outputs(id, session_id, type text,   -- 'strip' | 'gif' | 'live_h265' | 'live_h264' | 'zip'
  s3_key text, status text, created_at)
print_jobs(id, session_id, status text, attempts int, error_message text,
  printer_name text, copies int, created_at, finished_at)
device_commands(id, booth_id, type text,   -- 'test_print' | 'retry_sync' | 'reprint'
  payload jsonb, status text, created_at, done_at)
downloads(id, session_id, output_type, ip_hash, created_at)
admin_users(user_id uuid PK -> auth.users, role text)
system_logs(id, booth_id, level, source, event, message, meta jsonb, session_id, created_at)
audit_logs(id, admin_id, action, entity, entity_id, diff jsonb, created_at)

-- BOOTH LOKAL (SQLite)
sessions, photos, clips, outputs, print_jobs, render_jobs   -- struktur sama + kolom path file lokal
outbox(id, entity, entity_id, op, payload json, priority int, attempts int,
  next_try_at, status, created_at)
config_cache(key, value json, version int, fetched_at)     -- settings + frame aktif
preflight_results(id, checked_at, result json)
```

## Catatan

- Aktifkan RLS di Postgres. Tabel admin hanya bisa diakses role `admin`.
- Booth dan halaman download tidak mengakses Supabase langsung, semuanya lewat Device API dan Public API.
- Service role hanya ada di server cloud, tidak pernah di browser atau laptop booth. Laptop booth hanya memegang device key yang bisa dicabut dari dashboard.
- `sessions.config_version` mengikat sesi ke snapshot config saat sesi dibuat.
- `frame_selected_by` memisahkan pilihan `user` dari `timeout` agar statistik frame favorit tidak bias.
- `status` (alur sesi) dan `sync_status` (sinkron) adalah dua kolom terpisah.
- Semua laporan per hari memakai Asia/Jakarta (WIB). Timestamp disimpan UTC.

## Struktur S3

```
sessions/{session_id}/raw/{slot}.jpg
sessions/{session_id}/raw/clip_{slot}.webm
sessions/{session_id}/out/strip.jpg
sessions/{session_id}/out/anim.gif
sessions/{session_id}/out/live_h265.mp4
sessions/{session_id}/out/live_h264.mp4
sessions/{session_id}/out/all.zip
frames/{frame_id}/source.png
frames/{frame_id}/keyed.png
```

Bucket privat, akses lewat presigned URL. Kunci S3 deterministik agar retry sinkron idempotent.
