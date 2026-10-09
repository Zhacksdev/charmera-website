import sharp from 'sharp'
import { existsSync, statSync, mkdirSync, writeFileSync } from 'fs'

const API = 'http://127.0.0.1:4000'
const CWD = process.cwd()
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function main() {
  // seed config FULL mode
  const frame = await sharp({ create: { width: 1200, height: 1800, channels: 3, background: '#FF00FF' } }).composite([
    { input: Buffer.from('<svg width="1020" height="380"><rect width="1020" height="380" fill="#00FF00"/></svg>'), left: 90, top: 120 },
    { input: Buffer.from('<svg width="1020" height="380"><rect width="1020" height="380" fill="#00FF00"/></svg>'), left: 90, top: 540 }
  ]).png().toBuffer()
  mkdirSync(`${CWD}/data/frames`, { recursive: true })
  writeFileSync(`${CWD}/data/frames/test_keyed.png`, frame)

  const settings = {
    booth_id: '00000000-0000-0000-0000-000000000001', config_version: 2,
    output_mode: 'full', print_mode: 'digital_only', base_price: 25000,
    timers: { frame: 30, action: 120, preview: 45, qr: 15, closing: 5, countdown: 5, max_retake: 3, reminder_sec: 15 },
    camera: { width: 1920, height: 1080, mirror_preview: true },
    live_config: { clip_sec: 5, codec: 'h265', preview_h264: true },
    gif_config: { frame_duration_ms: 800, max_width: 1080 },
    preflight: { min_disk_gb: 5, max_outbox_age_hours: 24, fallback_digital_on_printer_fail: true }
  }
  const { default: Database } = await import('better-sqlite3')
  const db = new Database(`${CWD}/data/booth.db`)
  const frameId = '11111111-1111-1111-1111-111111111111'
  db.prepare(`INSERT OR REPLACE INTO config_cache (key, value, version, fetched_at) VALUES ('settings', ?, 2, datetime('now'))`).run(JSON.stringify(settings))
  db.prepare(`INSERT OR REPLACE INTO config_cache (key, value, version, fetched_at) VALUES ('frames', ?, 0, datetime('now'))`).run(JSON.stringify([{
    id: frameId, name: 'Test Frame', orientation: 'portrait', canvas_w: 1200, canvas_h: 1800,
    layout: { canvas: { w: 1200, h: 1800 }, slots: [ { n: 1, x: 90, y: 120, w: 1020, h: 380 }, { n: 2, x: 90, y: 540, w: 1020, h: 380 } ] },
    extra_price: 0, keyed_path: `${CWD}/data/frames/test_keyed.png`
  }]))
  db.close()
  console.log('OK config seeded (FULL mode)')

  const res0 = await fetch(`${API}/api/sessions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  const session = await res0.json()
  console.log('OK session:', session.public_code)

  await fetch(`${API}/api/sessions/${session.id}/frame`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ frame_id: frameId, selected_by: 'user' }) })

  for (let i = 0; i < 2; i++) {
    const photo = await sharp({ create: { width: 640, height: 360, channels: 3, background: ['#D62839', '#F2B8C0'][i] } }).jpeg().toBuffer()
    // buat clip webm palsu via ffmpeg nanti; untuk test kita skip clip (live render akan fail) -> test gif saja dulu dengan clip ada
    await fetch(`${API}/api/sessions/${session.id}/photos`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slot_index: i, photo_data: photo.toString('base64') }) })
  }
  console.log('OK photos saved')

  const { spawnSync } = await import('child_process')
  // buat 2 clip mp4 palsu (2 detik, warna solid)
  mkdirSync(`${CWD}/data/clips`, { recursive: true })
  const clipPaths = []
  for (let i = 0; i < 2; i++) {
    const p = `${CWD}/data/clips/test_${i}.mp4`
    spawnSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', `color=c=${i === 0 ? 'red' : 'pink'}:s=320x240:d=2`, '-r', '30', '-pix_fmt', 'yuv420p', p], { stdio: 'ignore' })
    clipPaths.push(p)
  }
  // insert clips langsung via better-sqlite3
  const D = (await import('better-sqlite3')).default
  const sdb = new D(`${CWD}/data/booth.db`)
  clipPaths.forEach((p, i) => {
    sdb.prepare(`INSERT INTO clips (id, session_id, slot_index, path, duration_ms) VALUES (?, ?, ?, ?, 2000)`)
      .run(`clip-${i}`, session.id, i, p)
  })
  sdb.close()
  console.log('OK clips seeded (2 fake mp4)')

  await fetch(`${API}/api/sessions/${session.id}/finalize`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ print: false }) })
  console.log('OK finalized (strip+gif+live_h264+live_h265)')

  let result
  const t0 = Date.now()
  for (let t = 0; t < 60; t++) {
    await sleep(2000)
    result = await (await fetch(`${API}/api/sessions/${session.id}/result`)).json()
    const done = result.outputs.filter(o => o.status === 'done').length
    const failed = result.outputs.filter(o => o.status === 'failed')
    if (failed.length) console.log('   render failed:', JSON.stringify(failed.map(f => ({ type: f.type }))))
    if (result.all_done) break
  }
  const secs = Math.round((Date.now() - t0) / 1000)
  console.log(`OK renders done in ~${secs}s`)
  for (const o of result.outputs) {
    const size = o.path && existsSync(o.path) ? Math.round(statSync(o.path).size / 1024) + ' KB' : 'MISSING'
    console.log(`   ${o.type}: ${o.status} (${size})`)
  }
  const allOk = result.all_done && result.outputs.every(o => o.status === 'done')
  console.log(allOk ? '\n=== E2E FULL PASS ===' : '\n=== E2E FULL FAIL ===')
  process.exit(allOk ? 0 : 1)
}

main().catch(err => { console.error('E2E FULL FAIL:', err); process.exit(1) })
