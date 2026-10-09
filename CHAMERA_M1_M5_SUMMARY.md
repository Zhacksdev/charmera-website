# Chamera Photobooth - M1-M5 Complete ✅

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    KIOSK (Next.js)                              │
│  Home → Frame → Action → Preview → Processing → Result → Closing│
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│              BOOTH API (Express + SQLite)                        │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Session Manager        Timer          Config Cache       │  │
│  │ • State machine        • stage_expires • Settings        │  │
│  │ • Cleanup job          • Server truth • Frames           │  │
│  │ • Snapshot config      • Auto-advance                    │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Render Workers         Print Worker    Sync Worker       │  │
│  │ • Strip (Sharp)        • 4x6 format    • Outbox queue   │  │
│  │ • GIF (ffmpeg)         • lp/pdf-print • Exponential BO  │  │
│  │ • Live (H.265/264)     • Rotate land  • Max 5 retries   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Config Puller          Cleanup Worker  Operator Routes   │  │
│  │ • 60s interval         • 7-day local   • Test print     │  │
│  │ • Device key auth      • Min 5GB disk  • Preflight      │  │
│  │ • Frame cache          • Emergency     • Retry sync     │  │
│  └──────────────────────────────────────────────────────────┘  │
└──────────────────────────┬──────────────────────────────────────┘
                           │ (Device API)
┌──────────────────────────▼──────────────────────────────────────┐
│              CLOUD APIS (Express)                                │
│                                                                   │
│  ┌─────────────────┬──────────────────┬──────────────────────┐ │
│  │ Device API      │ Public API       │ Admin API (M6)       │ │
│  │ • Config        │ • Download/:code │ • CRUD frames       │ │
│  │ • Sessions      │ • Rate limit     │ • Settings          │ │
│  │ • Presign       │ • Status         │ • Statistics        │ │
│  │ • Heartbeat     │ • 30-day expiry  │ • Commands          │ │
│  └─────────────────┴──────────────────┴──────────────────────┘ │
│                           │                                      │
│                      [Supabase]                                 │
│                      [S3 Storage]                               │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│         DOWNLOAD PAGE (Next.js) + ADMIN DASHBOARD (M6)          │
└──────────────────────────────────────────────────────────────────┘
```

## M1: Fondasi ✅
- Monorepo setup (pnpm + Turborepo)
- Packages: config, shared, frame-engine, device-auth
- Postgres migrations with RLS
- SQLite schema for booth
- Admin auth (Supabase + MFA)
- Device key authentication
- Frame engine (green screen detection, keying, despill)

## M2: Kiosk Inti ✅
- Session state machine (HOME → FRAME → ACTION → PREVIEW → PROCESSING → RESULT → CLOSING)
- `stage_expires_at` timer with server-side enforcement
- Session cleanup job (auto-abandon expired sessions)
- Config snapshot at session creation
- Home page with attract mode
- Frame selection with auto-timeout & `selected_by` tracking
- Action page with camera hooks, capture, retake, custom text
- Pre-flight checks (camera, disk)
- Font self-host (Nunito, Fraunces)
- UI polish per DESIGN.md

## M3: Output ✅
- Strip photo render (Sharp, 1200x1800, 300 DPI, JPEG 95%)
- GIF animation (ffmpeg, palette-based, 800ms frames)
- Live photo (H.265 + H.264 preview, slot overlays, 30fps)
- Render worker (polls every 2s, background jobs)
- Preview page (3 outputs with timer)
- Processing page (progress bar, status indicators)
- Result page (QR code generation client-side, print status, 15s timer)
- Closing page (thank you, auto-reset, 5s)

## M4: Sync & Download ✅
- Outbox table with priority queue
- Sync worker with exponential backoff (max 5 retries, 1s→60s)
- Priority-based sync (metadata → strip → GIF → video → logs)
- Config puller (60s interval, device key auth)
- Cleanup worker (7-day local retention, min 5GB disk)
- Public API (rate limit 100/min per IP, status tracking)
- Download page (Next.js, strip/GIF/live options, auto-refresh)
- 30-day cloud expiry with 410 response

## M5: Print Module ✅
- Print worker (platform-aware: pdf-to-printer/lp)
- 4x6 format, no scaling, auto-rotate landscape
- Retry up to 3x with exponential backoff
- Print job routes (check status, queue print)
- Operator panel (PIN-protected):
  - Test print (generates test image)
  - Preflight checks
  - Retry sync
  - Reprint queued jobs
- Media capacity tracking

## M6 & M7: Next Steps
- M6: Dashboard Admin (frame CRUD, settings, statistics, health)
- M7: Hardening (rate limits, auth review, load testing, UAT)

## Key Statistics
- **Milestones**: 5/7 complete (71%)
- **Files Created**: ~150 files across 5 packages + 5 apps
- **Lines of Code**: ~5000+ implementation
- **Workers**: 5 background services
- **APIs**: 3 cloud routers + 1 kiosk + 1 download
- **Pages**: 8 kiosk pages + 1 download page + TBD admin pages

## Deployment Readiness
- ✅ Local-first architecture tested
- ✅ Render pipeline (strip, GIF, live video) working
- ✅ Async sync with retry working
- ✅ Print integration working
- ✅ Download page working
- ⏳ Admin dashboard (next)
- ⏳ Security & performance hardening (next)

## End-to-End Flow Summary
1. **Kiosk** captures session locally
2. **Booth API** renders outputs in background
3. **Sync worker** uploads to cloud with retry
4. **Cloud** stores in S3, tracks in Postgres
5. **Download page** serves files via Public API
6. **Cleanup** removes old local files automatically

All core functionality is now implemented!
