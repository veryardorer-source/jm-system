// 자료 목록에는 있는데 저장소에 파일이 없는(404) 항목 찾기 — 전체 페이지네이션
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
const env = {}
for (const l of fs.readFileSync('.env.local','utf8').split(/\r?\n/)) {
  const m = l.replace(/^\uFEFF/,'').match(/^([A-Z0-9_]+)="?([^"]*)"?$/); if (m) env[m[1]] = m[2].trim()
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const { data: projs } = await sb.from('projects').select('id, name')
const pname = id => (projs||[]).find(p => p.id === id)?.name || '?'

// 전체 행 가져오기 (1000건씩)
const all = []
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb.from('project_files')
    .select('id, project_id, file_name, file_url, category, uploaded_by, created_at')
    .order('created_at', { ascending: false }).range(from, from + 999)
  if (error) { console.log('조회 오류:', error.message); break }
  all.push(...(data || []))
  if (!data || data.length < 1000) break
}
console.log('전체 자료 행:', all.length)

const targets = all.filter(f => (f.file_url||'').includes('/uploads/')) // 저장소 파일만(외부 링크 제외)
console.log('저장소 파일 행:', targets.length, '\n확인 중...')
const missing = []
const CONC = 12
for (let i = 0; i < targets.length; i += CONC) {
  await Promise.all(targets.slice(i, i + CONC).map(async f => {
    try {
      const res = await fetch(f.file_url, { method: 'HEAD' })
      if (!res.ok) missing.push({ ...f, status: res.status })
    } catch { missing.push({ ...f, status: 'ERR' }) }
  }))
}
console.log('\n파일 없음:', missing.length, '건\n')
for (const m of missing.slice(0, 30)) {
  console.log(`[${m.status}] ${m.category} | ${pname(m.project_id)} | ${m.file_name} | ${m.uploaded_by||'?'} | ${m.created_at.slice(0,16)}`)
}
const byCat = {}
for (const m of missing) byCat[m.category] = (byCat[m.category]||0) + 1
console.log('\n카테고리별 집계:', JSON.stringify(byCat))
