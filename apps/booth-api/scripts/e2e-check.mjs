import sharp from 'sharp'
import { existsSync, statSync, mkdirSync, writeFileSync } from 'fs'

const API = 'http://127.0.0.1:4000'
const CWD = process.cwd()
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function seedConfig() {
  const frame = await sharp({
    create: { width: 1200, height: 1800, channels: 3, background: '#FF00FF' }
  }).composite([
    { input: Buffer.from('<svg width="1020" height="380"><rect width="1020" height="380" fill="#00FF00"/></svg>'), left: 90, top: 120 },
    { input: Buffer.from('<svg width="1020" height="380"><rect width="1020" height="380" fill="#00FF00"/></svg>'), left: 90, top: 540 }
  ]).png().toBuffer()

  mkdirSync(`${CWD}/data/frames`, { recursive: true })
  writeFileSync(`${CWD}/data/frames/test_keyed.png`, frame)

  const settings = {
    booth_id: '00000000-0000-0000-0000-000000000001',
    config_version: 1,
    output_mode: 'photo_only',
    print_mode: 'digital_only',
    base_price: 25000,
    timers: { frame: 30, action: 120, preview: 45, qr: 15, closing: 5, countdown: 5, max_retake: 3, reminder_sec: 15 },
    camera: { width: 1920, height: 1080, mirror_preview: true },
    preflight: { min_disk_gb: 5, max_outbox_age_hours: 24, fallback_digital_on_printer_fail: true }
  }

  const { default: Database } = await import('better-sqlite3')
  const db = new Database(`${CWD}/data/booth.db`)

  const frameId = '11111111-1111-1111-1111-111111111111'
  db.prepare(`INSERT OR REPLACE INTO config_cache (key, value, version, fetched_at) VALUES ('settings', ?, 1, datetime('now'))`)
    .run(JSON.stringify(settings))
  db.prepare(`INSERT OR REPLACE INTO config_cache (key, value, version, fetched_at) VALUES ('frames', ?, 0, datetime('now'))`)
    .run(JSON.stringify([{
      id: frameId,
      name: 'Test Frame',
      orientation: 'portrait',
      canvas_w: 1200,
      canvas_h: 1800,
      layout: { canvas: { w: 1200, h: 1800 }, slots: [ { n: 1, x: 90, y: 120, w: 1020, h: 380 }, { n: 2, x: 90, y: 540, w: 1020, h: 380 } ] },
      extra_price: 0,
      keyed_path: `${CWD}/data/frames/test_keyed.png`
    }]))
  db.close()
  console.log('OK config seeded (settings + 1 frame)')
  return frameId
}

async function main() {
  const frameId = await seedConfig()

  let res = await fetch(`${API}/api/sessions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  let session = await res.json()
  console.log('OK session created:', session.public_code, 'status:', session.status)
  if (!session.id) throw new Error('session create failed: ' + JSON.stringify(session))

  res = await fetch(`${API}/api/sessions/${session.id}/frame`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ frame_id: frameId, selected_by: 'user' }) })
  console.log('OK frame selected:', (await res.json()).status)

  for (let i = 0; i < 2; i++) {
    const photo = await sharp({ create: { width: 640, height: 360, channels: 3, background: ['#D62839', '#F2B8C0'][i] } }).jpeg().toBuffer()
    res = await fetch(`${API}/api/sessions/${session.id}/photos`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slot_index: i, photo_data: photo.toString('base64') }) })
    const j = await res.json()
    console.log(`OK photo slot ${i} saved:`, j.status)
  }

  res = await fetch(`${API}/api/sessions/${session.id}/text`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ custom_text: 'Halo Chamera!' }) })
  console.log('OK custom text:', (await res.json()).status)

  res = await fetch(`${API}/api/sessions/${session.id}/finalize`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ print: false }) })
  const fin = await res.json()
  console.log('OK finalized:', fin.status, '| render jobs:', JSON.stringify(fin.render_jobs))

  let result
  for (let t = 0; t < 20; t++) {
    await sleep(1000)
    result = await (await fetch(`${API}/api/sessions/${session.id}/result`)).json()
    if (result.all_done) break
  }
  console.log('OK result:', JSON.stringify({ status: result.status, outputs: result.outputs.map(o => ({ type: o.type, status: o.status })), qr: result.qr_url }))
  console.log('OK all_done:', result.all_done)

  const strip = result.outputs.find(o => o.type === 'strip')
  if (strip?.path && existsSync(strip.path)) {
    const meta = await sharp(strip.path).metadata()
    console.log(`OK strip file: ${meta.width}x${meta.height}, ${Math.round(statSync(strip.path).size/1024)} KB -> ${strip.path}`)
  } else {
    throw new Error('strip file missing!')
  }
}

main().then(() => { console.log('\n=== E2E PASS ==='); process.exit(0) }).catch(err => { console.error('\n=== E2E FAIL ===\n', err); process.exit(1) })
