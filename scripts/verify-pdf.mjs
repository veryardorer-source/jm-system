// 검증: 교정된 PDF의 실제 구조 — Info 제목 값 + 카탈로그의 XMP(Metadata) 참조 여부
import { createClient } from '@supabase/supabase-js'
import { PDFDocument, PDFName } from 'pdf-lib'
import fs from 'fs'

const env = {}
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.replace(/^﻿/, '').match(/^([A-Z0-9_]+)="?([^"]*)"?$/)
  if (m) env[m[1]] = m[2].trim()
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const { data } = await sb.from('project_files').select('file_name, file_url')
  .ilike('file_name', '%제안%').ilike('file_name', '%.pdf').order('created_at', { ascending: false }).limit(1)
const t = data[0]
console.log('대상:', t.file_name)

const res = await fetch(t.file_url)
const doc = await PDFDocument.load(await res.arrayBuffer(), { ignoreEncryption: true, updateMetadata: false })
console.log('Info 제목(뷰어가 쓰게 될 제목):', JSON.stringify(doc.getTitle()))
const meta = doc.catalog.get(PDFName.of('Metadata'))
console.log('카탈로그 XMP 참조(없어야 정상):', meta ? '⚠ 아직 있음' : '제거됨 ✓')
