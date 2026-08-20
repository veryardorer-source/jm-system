// 진단: 최근 제안서 PDF의 제목 메타데이터(Info vs XMP) 확인
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const env = {}
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.replace(/^﻿/, '').match(/^([A-Z0-9_]+)="?([^"]*)"?$/)
  if (m) env[m[1]] = m[2].trim()
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const { data } = await sb.from('project_files').select('file_name, file_url, created_at')
  .ilike('file_name', '%.pdf').order('created_at', { ascending: false }).limit(30)
const target = (data || []).find(r => r.file_name.includes('제안')) || (data || [])[0]
console.log('대상:', target.file_name)

const res = await fetch(target.file_url)
const buf = Buffer.from(await res.arrayBuffer())
console.log('크기:', Math.round(buf.length / 1024), 'KB')
const s = buf.toString('latin1')

const infoIdx = s.indexOf('/Title')
console.log('Info /Title 존재:', infoIdx >= 0)
const xmpIdx = s.indexOf('<dc:title>')
console.log('XMP dc:title 존재:', xmpIdx >= 0)
if (xmpIdx >= 0) {
  const chunk = buf.slice(xmpIdx, xmpIdx + 400).toString('utf8')
  console.log('XMP 제목 내용:', chunk.replace(/\s+/g, ' ').slice(0, 250))
}
