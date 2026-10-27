// 관리시스템 자동 백업 — DB 표 전체(JSON) + 저장소 파일을 회사 NAS로 (2026-10-27)
// 실행: node scripts/backup.mjs [백업 폴더]   (.env.local의 서비스 키 사용, 이 PC에서만)
// 예약: Windows 작업 스케줄러 'JM 관리시스템 백업' — 매일 12:30, 꺼져 있었으면 켜진 뒤 바로
// 쌓이는 모양:
//   db/2026-10-27/<표 이름>.json  — 그날 표 전체. 최근 60일치만 남김(오래된 날짜 폴더부터 지움)
//   files/<버킷>/<경로>           — 저장소 파일 사본. 새 파일·바뀐 파일만 받고, 시스템에서 지워져도 여기선 안 지움
//   backup-log.txt               — 실행 기록
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const DEST = process.argv[2] || '\\\\jm\\004_JM 이소연\\AI\\관리시스템_백업'
const KEEP_DAYS = 60

const env = {}
for (const line of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.replace(/^﻿/, '').match(/^([A-Z0-9_]+)="?([^"]*)"?$/)
  if (m) env[m[1]] = m[2].trim()
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY
const sb = createClient(URL_, KEY, { auth: { persistSession: false } })

const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10) // 한국 날짜
const logLines = []
const log = (s) => { const line = `[${new Date().toLocaleString('ko-KR')}] ${s}`; console.log(line); logLines.push(line) }

// ── 1. DB 표 전체 ──
async function tableNames() {
  // PostgREST 안내서(OpenAPI)에 공개된 표·뷰 이름 — 새 표가 생겨도 자동으로 포함
  const res = await fetch(`${URL_}/rest/v1/`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } })
  if (!res.ok) throw new Error(`표 목록 조회 실패 ${res.status}`)
  return Object.keys((await res.json()).definitions || {}).sort()
}

async function dumpTable(name) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(name).select('*').range(from, from + 999)
    if (error) throw new Error(error.message)
    rows.push(...data)
    if (data.length < 1000) break
  }
  return rows
}

async function backupDb() {
  const dir = path.join(DEST, 'db', today)
  fs.mkdirSync(dir, { recursive: true })
  const summary = {}
  let fail = 0
  for (const name of await tableNames()) {
    try {
      const rows = await dumpTable(name)
      fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(rows, null, 1))
      summary[name] = rows.length
    } catch (e) { summary[name] = '실패: ' + e.message; fail++ }
  }
  fs.writeFileSync(path.join(dir, '_목록.json'), JSON.stringify({ 날짜: today, 표: summary }, null, 1))
  const total = Object.values(summary).filter(v => typeof v === 'number').reduce((a, b) => a + b, 0)
  log(`DB: 표 ${Object.keys(summary).length}개 · ${total.toLocaleString()}줄 저장${fail ? ` · 실패 ${fail}개` : ''} → db\\${today}`)

  // 오래된 날짜 폴더 정리(이 백업 폴더 안의 db\YYYY-MM-DD 만)
  const days = fs.readdirSync(path.join(DEST, 'db')).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort()
  for (const d of days.slice(0, Math.max(0, days.length - KEEP_DAYS))) fs.rmSync(path.join(DEST, 'db', d), { recursive: true, force: true })
}

// ── 2. 저장소 파일(새 것·바뀐 것만) ──
async function listAll(bucket, prefix = '') {
  const out = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await sb.storage.from(bucket).list(prefix, { limit: 1000, offset })
    if (error) throw new Error(error.message)
    for (const e of data) {
      const p = prefix ? `${prefix}/${e.name}` : e.name
      if (e.id === null) out.push(...await listAll(bucket, p)) // 폴더
      else out.push({ path: p, size: e.metadata?.size ?? -1 })
    }
    if (data.length < 1000) break
  }
  return out
}

async function backupFiles() {
  const { data: buckets, error } = await sb.storage.listBuckets()
  if (error) throw new Error('버킷 목록 실패: ' + error.message)
  for (const b of buckets) {
    let got = 0, same = 0, fail = 0
    const files = await listAll(b.name)
    for (const f of files) {
      const local = path.join(DEST, 'files', b.name, ...f.path.split('/'))
      if (fs.existsSync(local) && fs.statSync(local).size === f.size) { same++; continue }
      try {
        const { data, error: dlErr } = await sb.storage.from(b.name).download(f.path)
        if (dlErr || !data) throw new Error(dlErr?.message || '빈 응답')
        fs.mkdirSync(path.dirname(local), { recursive: true })
        fs.writeFileSync(local, Buffer.from(await data.arrayBuffer()))
        got++
      } catch { fail++ }
    }
    log(`파일 ${b.name}: 전체 ${files.length}개 · 새로 받음 ${got} · 그대로 ${same}${fail ? ` · 실패 ${fail}` : ''}`)
  }
}

try {
  fs.mkdirSync(DEST, { recursive: true })
  log(`백업 시작 → ${DEST}`)
  await backupDb()
  await backupFiles()
  log('백업 끝')
} catch (e) {
  log('백업 실패: ' + e.message)
  process.exitCode = 1
} finally {
  try { fs.appendFileSync(path.join(DEST, 'backup-log.txt'), logLines.join('\r\n') + '\r\n') } catch { /* NAS 연결 끊김 */ }
}
