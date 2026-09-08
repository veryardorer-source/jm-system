import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
const env = {}
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.replace(/^\uFEFF/, '').match(/^([A-Z0-9_]+)="?([^"]*)"?$/)
  if (m) env[m[1]] = m[2].trim()
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
for (const col of ['images', 'tasks', 'status']) {
  const { error } = await sb.from('work_logs').select(col).limit(1)
  console.log('work_logs.' + col + ':', error ? '❌ 없음' : '✅ 있음')
}
// 최근 현장 사진의 실제 크기 확인 (작게 나온다는 제보 진단)
const { data } = await sb.from('project_files').select('file_name, file_url, file_size, created_at')
  .ilike('file_name', '%.webp').order('created_at', { ascending: false }).limit(3)
console.log('\n=== 최근 업로드 사진 ===')
for (const f of data || []) {
  console.log(f.file_name, '|', Math.round((f.file_size || 0) / 1024) + 'KB', '|', f.created_at.slice(0, 16))
}
