// 기존 PDF 문서 속성 제목 일괄 교정 (2026-08-27)
// 실행: node scripts/fix-pdf-titles.mjs  (.env.local 서비스 키, 로컬 전용)
// 대상: 현장 자료·회사 서류(공개 uploads) + 견적서(잠금 secure)의 모든 PDF
// 하는 일: XMP 메타데이터 제거 + Info 제목을 파일명/서류제목으로 재기록 → 같은 자리에 다시 업로드
import { createClient } from '@supabase/supabase-js'
import { PDFDocument, PDFName } from 'pdf-lib'
import fs from 'fs'

const env = {}
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.replace(/^﻿/, '').match(/^([A-Z0-9_]+)="?([^"]*)"?$/)
  if (m) env[m[1]] = m[2].trim()
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

let fixed = 0, skipped = 0, failed = 0

async function fixOne(bucket, path, title, label) {
  try {
    const { data: blob, error: dlErr } = await sb.storage.from(bucket).download(path)
    if (dlErr || !blob) throw new Error('다운로드 실패: ' + (dlErr?.message || ''))
    const buf = Buffer.from(await blob.arrayBuffer())
    const doc = await PDFDocument.load(buf, { ignoreEncryption: true })
    doc.catalog.delete(PDFName.of('Metadata')) // XMP 제거 (뷰어가 이 제목을 우선 표시)
    doc.setTitle(title.replace(/\.pdf$/i, ''))
    const out = await doc.save()
    const { error: upErr } = await sb.storage.from(bucket).upload(path, Buffer.from(out), {
      contentType: 'application/pdf', upsert: true,
    })
    if (upErr) throw new Error('재업로드 실패: ' + upErr.message)
    fixed++
    console.log(`교정: ${label}`)
  } catch (e) {
    failed++
    console.log(`실패: ${label} — ${e.message}`)
  }
}

// ① 현장 자료 PDF (공개 uploads)
{
  const { data } = await sb.from('project_files').select('file_name, file_url').ilike('file_name', '%.pdf')
  for (const r of data || []) {
    const path = (r.file_url || '').split('/uploads/')[1]
    if (!path) { skipped++; continue }
    await fixOne('uploads', decodeURIComponent(path), r.file_name, '자료 · ' + r.file_name)
  }
}
// ② 회사 서류 PDF (제목 = 서류 제목)
{
  const { data } = await sb.from('company_documents').select('title, file_name, file_url').ilike('file_name', '%.pdf')
  for (const r of data || []) {
    const path = (r.file_url || '').split('/uploads/')[1]
    if (!path) { skipped++; continue }
    await fixOne('uploads', decodeURIComponent(path), r.title || r.file_name, '서류 · ' + r.title)
  }
}
// ③ 견적서 PDF (잠금 secure, 제목 = 현장명)
{
  const { data } = await sb.from('finance_quotes').select('title, file_name, file_url').ilike('file_name', '%.pdf')
  for (const r of data || []) {
    if (!(r.file_url || '').startsWith('secure://')) { skipped++; continue }
    await fixOne('secure', r.file_url.slice(9), r.title || r.file_name, '견적서 · ' + r.title)
  }
}

console.log(`\n완료 — 교정 ${fixed}건, 건너뜀 ${skipped}건, 실패 ${failed}건`)
