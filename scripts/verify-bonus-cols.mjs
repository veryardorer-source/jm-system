import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
const env = {}
for (const l of fs.readFileSync('.env.local','utf8').split(/\r?\n/)) {
  const m = l.replace(/^\uFEFF/,'').match(/^([A-Z0-9_]+)="?([^"]*)"?$/); if (m) env[m[1]] = m[2].trim()
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

// ① 컬럼 존재 확인
const { error: colErr } = await sb.from('finance_payroll_ledger').select('month, kind, title').limit(1)
console.log('kind·title 컬럼:', colErr ? '❌ 없음 — ' + colErr.message : '✅ 있음')

// ② 기본키(월+종류) 확인 — 임시 행을 넣었다 지움
const probe = { month: '1900-01', kind: '점검용', headers: [], rows: [], total: null }
const { error: upErr } = await sb.from('finance_payroll_ledger').upsert(probe, { onConflict: 'month,kind' })
console.log('월+종류 기본키:', upErr ? '❌ 미적용 — ' + upErr.message : '✅ 정상')
await sb.from('finance_payroll_ledger').delete().eq('month', '1900-01')

// ③ 현재 보관된 대장 목록
const { data } = await sb.from('finance_payroll_ledger').select('month, kind, title').order('month', { ascending: false })
console.log('\n보관된 대장:', (data||[]).length, '건')
for (const r of data || []) console.log(' ·', r.month, '|', r.kind || '급여', r.title ? '· ' + r.title : '')
