# Chamera Photobooth - Deployment Guide

## Pre-Deployment Checklist

### Infrastructure Setup
- [ ] Supabase project created
- [ ] S3 bucket configured (private, CORS disabled)
- [ ] Cloud servers ready (2-4 instances for cloud-api, admin, download)
- [ ] Booth laptop with Node.js 20 LTS, ffmpeg, printer drivers installed
- [ ] DNS records configured for domain.com, device.domain.com, admin.domain.com, api-admin.domain.com

### Environment Configuration
- [ ] `.env` files created for all apps (see .env.example)
- [ ] DEVICE_KEY generated and stored securely
- [ ] OPERATOR_PIN_HASH set (SHA256 of operator PIN)
- [ ] S3 credentials configured
- [ ] Supabase connection string verified

### Database Setup
- [ ] Run Supabase migrations: `supabase/migrations/*.sql`
- [ ] Create initial admin user in `admin_users` table with MFA enabled
- [ ] Verify RLS policies are enforced

### Deployment Steps

#### 1. Bootstrap Cloud API
```bash
cd apps/cloud-api
npm install
npm run build
# Deploy to production (Vercel, Railway, or self-hosted)
```

#### 2. Deploy Download Page
```bash
cd apps/download
npm install
npm run build
npm start  # or deploy to Vercel
```

#### 3. Deploy Admin Dashboard
```bash
cd apps/admin
npm install
npm run build
npm start  # or deploy to Vercel
```

#### 4. Setup Booth Laptop
```bash
# Install dependencies
pnpm install

# Configure environment
cp .env.example .env
# Edit .env with booth-specific values

# Start services (use pm2 or systemd)
pm2 start apps/booth-api/src/server.ts
pm2 start apps/kiosk/next.config.ts

# Or run locally for testing
pnpm dev
```

#### 5. Configure Kiosk Chrome
```bash
# Linux
google-chrome --kiosk http://127.0.0.1:3000

# macOS
open -a Google\ Chrome --args --kiosk http://127.0.0.1:3000

# Windows
"C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk http://127.0.0.1:3000
```

## UAT Checklist (M7 Hardening)

### Kiosk Flow
- [ ] **Home**: Attract mode plays slideshow correctly
- [ ] **Frame Select**: Timer counts down, auto-selects first frame on timeout
- [ ] **Action**: Camera starts, photos captured, retake works (max 3), custom text saves
- [ ] **Preview**: Shows 3 outputs (strip/GIF/live) or 1 (strip only) based on config
- [ ] **Processing**: Progress bar updates, renders complete < 60s for strip + GIF
- [ ] **Result**: QR displays, print status shows, timer 15s
- [ ] **Closing**: Thank you message, auto-reset to Home after 5s

### Offline Mode
- [ ] **Start session without internet** - Works normally
- [ ] **Capture & render** - Completes locally
- [ ] **Restore internet** - Sync starts automatically
- [ ] **Verify upload** - Files appear in S3, session marked synced

### Print Module
- [ ] **Test print** - Operator panel can send test print
- [ ] **Auto print** - Session prints automatically when print mode enabled
- [ ] **Error handling** - Print failure doesn't block QR
- [ ] **Reprint** - Operator can reprint from panel
- [ ] **Media tracking** - Capacity decreases after print

### Download Page
- [ ] **Valid code** - Shows ready with 3 outputs
- [ ] **Processing code** - Shows "sedang diproses", auto-refreshes
- [ ] **Invalid code** - Shows 404 without revealing timing
- [ ] **Rate limit** - 100+ requests from same IP rejected
- [ ] **Expiry** - Files gone after 30 days, 410 response

### Admin Dashboard (M6)
- [ ] **Frame upload** - Green screen detection works
- [ ] **Frame editor** - Slot editor, visual preview
- [ ] **Settings** - Price, timer, output mode all apply to next session
- [ ] **Statistics** - Revenue, frame popularity, session counts
- [ ] **Health** - Camera/disk/printer status from latest heartbeat
- [ ] **Reprints** - Can reprint any session from history

### Security
- [ ] **Booth API** - Only accessible from 127.0.0.1
- [ ] **Device key** - Verified on all Device API calls
- [ ] **Admin auth** - MFA required, JWT validated
- [ ] **Rate limits** - Public API enforces per-IP limit
- [ ] **Secrets** - No service role keys in booth, no device key in browser

### Performance
- [ ] **First load** - Kiosk loads < 3s on local
- [ ] **Strip render** - < 10s after photos done
- [ ] **GIF render** - < 20s after strip
- [ ] **Live photo** - < 40s after clips recorded
- [ ] **Sync** - Metadata syncs within 5s when online
- [ ] **Download** - Page loads < 2s on 4G

### Reliability
- [ ] **8-hour kiosk run** - No crashes, all sessions complete
- [ ] **Network cutoff mid-session** - Session completes, syncs when back online
- [ ] **Printer offline** - QR still shows, print queued, retry works
- [ ] **Disk full scenario** - Cleanup activates, old files deleted
- [ ] **Config update mid-session** - Old session uses old config, next session uses new

## M6: Admin Dashboard (Quick Start)

If not fully implemented, prioritize:
1. Frame CRUD (upload, detect, edit slots, toggle active)
2. Settings page (price, timer, output, print mode)
3. Session list (date filter, status filter, reprint button)
4. Health dashboard (booth status, outbox count, latest heartbeat)

See `guide/09-ADMIN-DASHBOARD.md` for full spec.

## M7: Hardening (Quick Start)

If not fully implemented, prioritize:
1. **Rate limits**: All endpoints have per-IP or per-device limits
2. **CORS**: Set restrictive CORS per surface (admin.domain.com, etc)
3. **Input validation**: All POST/PATCH use Zod schemas
4. **Secrets**: No .env secrets in git, use secret managers
5. **Logging**: Key events logged (auth, config changes, errors)

## Monitoring & Alerts

### Local (Booth API)
- Monitor `/health` endpoint (heartbeat every 60s from cloud)
- Check outbox count (should be 0 if synced)
- Monitor disk usage (cleanup activates at < 5GB free)

### Cloud
- Monitor S3 uploads (should see session outputs)
- Check Postgres for sync_status = 'synced' (indicates successful upload)
- Monitor rate limit counters
- Check admin login attempts (security audit)

## Troubleshooting

### Kiosk frozen on HOME
- Check Booth API is running: `curl http://127.0.0.1:4000/health`
- Check config loaded: `curl http://127.0.0.1:4000/api/status`
- Restart booth-api service

### Session won't sync
- Check internet connection
- Verify DEVICE_KEY matches cloud
- Check outbox count: `sqlite3 data/booth.db "SELECT COUNT(*) FROM outbox"`
- Manually retry: Operator panel → Retry Sync

### Print not working
- Run test print from operator panel
- Check printer is online and registered with OS
- Verify PRINTER_NAME matches system name
- Check media isn't empty

### QR code not displaying
- Verify session completed (RESULT page should show)
- Check PUBLIC_BASE_URL env var is set correctly
- Verify public code is 12 characters (check database)

## Rollback Plan

If critical issue found:
1. Stop booth-api & kiosk
2. Revert last config version: `UPDATE config_cache SET version = version - 1`
3. Restart services
4. Manually delete bad sessions if needed

## Next Steps Post-Launch

1. Monitor kiosk for 48 hours continuously
2. Collect user feedback
3. Optimize render times if needed
4. Add multi-booth support (v2)
5. Add template themes (v2)
