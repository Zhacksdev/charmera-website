// E2E Booth API: jalankan terhadap booth-api yang sedang berjalan.
//
//   DATA_DIR=<folder data booth-api> BOOTH_API_URL=http://127.0.0.1:4000 OPERATOR_PIN=<pin> node scripts/e2e-check.mjs
//
// DATA_DIR wajib sama dengan booth-api yang diuji: skrip memundurkan stage_expires_at di SQLite
// untuk menguji timeout tanpa menunggu timer asli, dan memeriksa antrean outbox/print.
// Pakai DATA_DIR terpisah — skrip mengubah output_mode & mode printer sementara (dikembalikan di akhir).
import sharp from 'sharp'
import Database from 'better-sqlite3'
import { join } from 'path'
import { existsSync } from 'fs'

const API = process.env.BOOTH_API_URL || 'http://127.0.0.1:4000'
const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data')
const PIN = process.env.OPERATOR_PIN || ''
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const db = new Database(join(DATA_DIR, 'booth.db'))
let passed = 0
const failures = []

function check(name, cond, detail = '') {
  if (cond) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

async function call(method, path, body, headers = {}) {
  const isForm = body instanceof FormData
  const res = await fetch(`${API}${path}`, {
    method,
    headers: isForm || body === undefined ? headers : { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body)
  })
  let data = null
  try { data = await res.json() } catch {}
  return { status: res.status, data }
}

const op = (method, path, body) => call(method, `/api/operator${path}`, body, { 'X-Operator-Pin': PIN })

const settings = () => JSON.parse(db.prepare(`SELECT value FROM config_cache WHERE key = 'settings'`).get().value)
function patchSettings(patch) {
  db.prepare(`UPDATE config_cache SET value = ? WHERE key = 'settings'`).run(JSON.stringify({ ...settings(), ...patch }))
}
const expireNow = (id) => db.prepare(`UPDATE sessions SET stage_expires_at = ? WHERE id = ?`).run(new Date(Date.now() - 1000).toISOString(), id)
const session = (id) => call('GET', `/api/sessions/${id}`).then((r) => r.data)

async function photo(color = '#D62839') {
  return sharp({ create: { width: 640, height: 360, channels: 3, background: color } }).jpeg().toBuffer()
}

async function newSession({ withFrame = true, photos = 0 } = {}) {
  const created = await call('POST', '/api/sessions', {})
  const id = created.data.id
  const frames = (await call('GET', '/api/frames')).data
  if (withFrame) await call('PATCH', `/api/sessions/${id}/frame`, { frame_id: frames[0].id, selected_by: 'user' })
  for (let i = 0; i < photos; i++) {
    const fd = new FormData()
    fd.append('slot_index', String(i))
    fd.append('photo', new Blob([await photo()], { type: 'image/jpeg' }), `slot_${i}.jpg`)
    await call('POST', `/api/sessions/${id}/photos`, fd)
  }
  return { id, created, frames }
}

async function waitStatus(id, statuses, timeoutMs = 30000) {
  const start = Date.now()
  let s
  while (Date.now() - start < timeoutMs) {
    s = await session(id)
    if (statuses.includes(s.status)) return s
    await sleep(1000)
  }
  return s
}

async function main() {
  const health = await call('GET', '/health')
  if (health.status !== 200) throw new Error(`Booth API tidak jalan di ${API}`)
  const original = settings()
  const timers = original.timers || {}
  const near = (a, b) => Math.abs(a - b) <= 2

  try {
    console.log('\n[1] Alur normal: pilih frame → foto → Lanjut → finalize → selesai')
    const frames = (await call('GET', '/api/frames')).data
    check('GET /api/frames berisi frame', Array.isArray(frames) && frames.length > 0)
    const slots = frames[0].layout.slots.length

    const created = await call('POST', '/api/sessions', {})
    const id = created.data.id
    check('POST /api/sessions → 201 created', created.status === 201 && created.data.status === 'created')
    check('timer tahap frame sesuai pengaturan', near(created.data.timer, timers.frame || 30), `timer=${created.data.timer}`)

    const sel = await call('PATCH', `/api/sessions/${id}/frame`, { frame_id: frames[0].id, selected_by: 'user' })
    check('PATCH frame → frame_selected dgn timer action', sel.data.status === 'frame_selected' && sel.data.timer === (timers.action || 120))

    const noPhoto = await call('POST', `/api/sessions/${id}/photos`, (() => { const f = new FormData(); f.append('slot_index', '0'); return f })())
    check('upload tanpa file foto → 400', noPhoto.status === 400)

    for (let i = 0; i < slots; i++) {
      const fd = new FormData()
      fd.append('slot_index', String(i))
      fd.append('photo', new Blob([await photo(i ? '#F2B8C0' : '#D62839')], { type: 'image/jpeg' }), `slot_${i}.jpg`)
      const up = await call('POST', `/api/sessions/${id}/photos`, fd)
      check(`upload foto slot ${i} (multipart) → 200`, up.status === 200, `status=${up.status}`)
    }

    check('custom text > 30 karakter ditolak', (await call('POST', `/api/sessions/${id}/text`, { custom_text: 'x'.repeat(31) })).status === 400)
    check('custom text valid tersimpan', (await call('POST', `/api/sessions/${id}/text`, { custom_text: 'Halo Chamera!' })).status === 200)

    const adv = await call('POST', `/api/sessions/${id}/advance`, { from: 'frame_selected' })
    check('Lanjut → previewing dengan timer preview', adv.data.status === 'previewing' && near(adv.data.remaining_sec, timers.preview || 45), JSON.stringify(adv.data))
    const adv2 = await call('POST', `/api/sessions/${id}/advance`, { from: 'frame_selected' })
    check('advance ganda (from basi) tidak melompati tahap', adv2.data.status === 'previewing')
    check('frame tidak bisa diganti setelah Action', (await call('PATCH', `/api/sessions/${id}/frame`, { frame_id: frames[0].id, selected_by: 'user' })).status === 409)

    const fin1 = await call('POST', `/api/sessions/${id}/finalize`, { print: false })
    const fin2 = await call('POST', `/api/sessions/${id}/finalize`, { print: false })
    const jobCount = db.prepare(`SELECT COUNT(*) n FROM render_jobs WHERE session_id = ?`).get(id).n
    check('finalize → processing', fin1.data.status === 'processing' && !fin1.data.already_finalized)
    check('finalize ganda idempotent (1 set render job)', fin2.data.already_finalized === true && jobCount === 1, `jobs=${jobCount}`)

    const done = await waitStatus(id, ['completed', 'failed'])
    check('sesi ditutup completed oleh render worker', done.status === 'completed', `status=${done.status}`)
    const result = (await call('GET', `/api/sessions/${id}/result`)).data
    check('result: strip done, total_jobs=1, all_done', result.outputs.some((o) => o.type === 'strip' && o.status === 'done') && result.total_jobs === 1 && result.all_done)
    check('result: qr_url berisi public_code', result.qr_url.endsWith(`/download/${result.public_code}`))
    const strip = result.outputs.find((o) => o.type === 'strip')
    const meta = strip && existsSync(strip.path) ? await sharp(strip.path).metadata() : null
    check('file strip 1200x1800', meta?.width === 1200 && meta?.height === 1800, meta ? `${meta.width}x${meta.height}` : 'file hilang')

    const outbox = db.prepare(`SELECT entity, entity_id, payload FROM outbox WHERE entity_id = ? OR json_extract(payload, '$.session_id') = ?`).all(id, id)
    check('outbox: sesi + output strip diantre untuk sync', outbox.some((o) => o.entity === 'session') && outbox.some((o) => o.entity === 'output' && JSON.parse(o.payload).type === 'strip'), JSON.stringify(outbox.map((o) => o.entity)))
    const sessionPayload = JSON.parse(outbox.find((o) => o.entity === 'session')?.payload || '{}')
    check('payload sesi status completed + public_code', sessionPayload.status === 'completed' && sessionPayload.public_code === result.public_code)

    console.log('\n[2] Timeout tiap tahap (stage_expires_at dimundurkan)')
    const a = (await newSession({ withFrame: false })).id
    expireNow(a)
    const aS = await session(a)
    check('created habis → frame dipilih otomatis (timeout)', aS.status === 'frame_selected' && aS.frame_selected_by === 'timeout')
    check('…dengan timer action, bukan timer frame', near(aS.remaining_sec, timers.action || 120), `remaining=${aS.remaining_sec}`)

    const b = (await newSession()).id
    expireNow(b)
    check('Action habis tanpa foto → abandoned', (await session(b)).status === 'abandoned')

    const c = (await newSession({ photos: 1 })).id
    expireNow(c)
    const cS = await session(c)
    check('Action habis dengan foto → previewing (timer preview)', cS.status === 'previewing' && near(cS.remaining_sec, timers.preview || 45), JSON.stringify({ s: cS.status, r: cS.remaining_sec }))
    expireNow(c)
    const cS2 = await session(c)
    check('Preview habis → finalize otomatis (processing)', ['processing', 'completed'].includes(cS2.status))
    check('…lalu selesai completed', (await waitStatus(c, ['completed', 'failed'])).status === 'completed')

    console.log('\n[3] Job cleanup memajukan sesi tanpa polling kiosk (≤35 dtk)')
    const d = (await newSession({ withFrame: false })).id
    expireNow(d)
    let dRow
    for (let t = 0; t < 36; t++) {
      dRow = db.prepare(`SELECT status, frame_selected_by FROM sessions WHERE id = ?`).get(d)
      if (dRow.status !== 'created') break
      await sleep(1000)
    }
    check('cleanup: created → frame_selected (timeout)', dRow.status === 'frame_selected' && dRow.frame_selected_by === 'timeout', JSON.stringify(dRow))

    console.log('\n[4] Cetak: printer tidak ada → gagal aman, QR tetap jadi')
    if (PIN) {
      check('PIN salah → 401', (await call('GET', '/api/operator/printer', undefined, { 'X-Operator-Pin': 'salah' })).status === 401)
      const saved = await op('PUT', '/printer', { print_mode: 'local', printer_name: 'Printer E2E Tidak Ada', copies: 1, print_scale: 'noscale', paper_size: '' })
      check('simpan pengaturan printer', saved.status === 200 && saved.data.health.status === 'error')
      check('pengaturan tidak valid → 400', (await op('PUT', '/printer', { print_mode: 'local', printer_name: '', copies: 0, print_scale: 'x', paper_size: '' })).status === 400)
      const status = (await call('GET', '/api/status')).data
      check('/api/status: print_mode & kesehatan printer', status.print_mode === 'local' && status.printer?.status === 'error')

      const p = (await newSession({ photos: slots })).id
      await call('POST', `/api/sessions/${p}/advance`, { from: 'frame_selected' })
      const pf = await call('POST', `/api/sessions/${p}/finalize`, { print: true })
      check('finalize print=true membuat job cetak', pf.data.print_requested === true)
      let pj
      for (let t = 0; t < 30; t++) {
        pj = (await call('GET', `/api/sessions/${p}/print`)).data
        if (pj.status === 'failed' || pj.status === 'done') break
        await sleep(1000)
      }
      check('job cetak gagal dgn pesan jelas setelah 3x', pj.status === 'failed' && pj.attempts === 3 && /tidak ditemukan/.test(pj.error_message || ''), JSON.stringify(pj))
      check('sesi tetap completed (QR tidak terhalang cetak)', (await waitStatus(p, ['completed', 'failed'])).status === 'completed')

      const rp = await op('POST', `/reprint/${p}`)
      check('cetak ulang mengantre ulang job', rp.status === 200 && db.prepare(`SELECT status FROM print_jobs WHERE session_id = ?`).get(p).status !== 'failed')

      const tp = await op('POST', '/test-print')
      check('test print ke printer hilang → 500 + pesan', tp.status === 500 && /tidak ditemukan/.test(tp.data.error))

      db.prepare(`UPDATE outbox SET status = 'failed' WHERE id = (SELECT id FROM outbox LIMIT 1)`).run()
      const rs = await op('POST', '/retry-sync')
      check('retry-sync mengembalikan item gagal ke antrean', rs.status === 200 && rs.data.requeued >= 1)
    } else {
      console.log('  (dilewati: set OPERATOR_PIN untuk menguji panel operator & cetak)')
    }

    console.log('\n[5] Mode full tanpa ffmpeg: booth-api tidak boleh crash')
    patchSettings({ output_mode: 'full' })
    const st = (await call('GET', '/api/status')).data
    console.log(`  (ffmpeg_ok=${st.ffmpeg_ok})`)
    check('/api/status melaporkan ffmpeg_ok untuk mode full', typeof st.ffmpeg_ok === 'boolean')
    const f = (await newSession({ photos: slots })).id
    await call('POST', `/api/sessions/${f}/advance`, { from: 'frame_selected' })
    const ff = await call('POST', `/api/sessions/${f}/finalize`, { print: false })
    check('finalize full → 4 render job', ff.data.render_jobs.length === 4)
    const fDone = await waitStatus(f, ['completed', 'failed'], 90000)
    check('booth-api tetap hidup setelah render GIF/Live', (await call('GET', '/health')).status === 200)
    check('sesi completed walau GIF/Live gagal (strip ada)', fDone.status === 'completed', `status=${fDone.status}`)
    const fRes = (await call('GET', `/api/sessions/${f}/result`)).data
    if (!st.ffmpeg_ok) {
      check('job gagal tercatat dengan alasan', fRes.failed_jobs.length > 0, JSON.stringify(fRes.failed_jobs))
    }

    console.log('\n[6] Reset sesi')
    const r = (await newSession({ photos: 1 })).id
    const rr = await call('POST', `/api/sessions/${r}/reset`)
    check('reset → abandoned + foto dihapus', rr.data.status === 'abandoned' && db.prepare(`SELECT COUNT(*) n FROM photos WHERE session_id = ?`).get(r).n === 0)
    check('sesi tidak dikenal → 404', (await call('GET', '/api/sessions/00000000-0000-0000-0000-000000000000')).status === 404)
  } finally {
    // kembalikan pengaturan
    patchSettings({ output_mode: original.output_mode })
    if (PIN) await op('PUT', '/printer', { print_mode: 'digital_only', printer_name: '', copies: 1, print_scale: 'noscale', paper_size: '' })
    db.close()
  }

  console.log(`\n${passed} lulus, ${failures.length} gagal`)
  if (failures.length) {
    console.log('\nGagal:\n' + failures.map((f) => ` - ${f}`).join('\n'))
    process.exit(1)
  }
  console.log('\n=== E2E PASS ===')
}

main().catch((err) => {
  console.error('\n=== E2E ERROR ===\n', err)
  process.exit(1)
})
