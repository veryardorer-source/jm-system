// 경영관리 파일 이사 — 공개(uploads) → 잠금(secure) 버킷 (2026-08-25)
// 실행: node scripts/migrate-finance-secure.mjs  (.env.local의 서비스 키 사용, 로컬에서만)
// 대상: finance_quotes / finance_sales / finance_project_profit 의 첨부 파일
// 하는 일: 내려받아 secure에 올리고 → DB 주소를 secure:// 로 바꾸고 → 공개 원본 삭제
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const env = {}
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.replace(/^﻿/, '').match(/^([A-Z0-9_]+)="?([^"]*)"?$/)
  if (m) env[m[1]] = m[2].trim()
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const TABLES = ['finance_quotes', 'finance_sales', 'finance_project_profit']
let moved = 0, skipped = 0, failed = 0

for (const table of TABLES) {
  const { data: rows, error } = await sb.from(table).select('id, file_url, file_name')
  if (error) { console.log(`${table}: 조회 실패 - ${error.message}`); continue }
  for (const row of rows || []) {
    const url = row.file_url || ''
    if (!url || url.startsWith('secure://')) { skipped++; continue }
    const path = url.split('/uploads/')[1]
    if (!path) { skipped++; continue }
    try {
      const { data: blob, error: dlErr } = await sb.storage.from('uploads').download(path)
      if (dlErr || !blob) throw new Error('다운로드 실패: ' + (dlErr?.message || ''))
      const { error: upErr } = await sb.storage.from('secure').upload(path, blob, { upsert: true })
      if (upErr) throw new Error('업로드 실패: ' + upErr.message)
      const { error: dbErr } = await sb.from(table).update({ file_url: 'secure://' + path }).eq('id', row.id)
      if (dbErr) throw new Error('DB 갱신 실패: ' + dbErr.message)
      await sb.storage.from('uploads').remove([path]) // 공개 원본 제거
      moved++
      console.log(`이동: ${table} · ${row.file_name || path}`)
    } catch (e) {
      failed++
      console.log(`실패: ${table} · ${row.file_name || path} — ${e.message}`)
    }
  }
}
console.log(`\n완료 — 이동 ${moved}건, 건너뜀(파일없음/이미이동) ${skipped}건, 실패 ${failed}건`)
