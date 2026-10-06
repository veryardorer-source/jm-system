// 추가근무 테이블(employee_overtime) 적용 확인 — node scripts/verify-overtime.mjs
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
const env = {}
for (const l of fs.readFileSync('.env.local','utf8').split(/\r?\n/)) {
  const m = l.replace(/^\uFEFF/,'').match(/^([A-Z0-9_]+)="?([^"]*)"?$/); if (m) env[m[1]] = m[2].trim()
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const { error } = await sb.from('employee_overtime')
  .select('id, employee_id, work_date, ot_type, start_time, end_time, hours, project_name, memo').limit(1)
console.log('employee_overtime 테이블:', error ? '❌ 없음 — ' + error.message : '✅ 있음')

// 로그인 안 한(anon) 요청은 막혀야 함 (RLS)
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
const { data: leak } = await anon.from('employee_overtime').select('id').limit(1)
console.log('비로그인 차단(RLS):', (leak || []).length === 0 ? '✅ 차단됨' : '❌ 보임!')
