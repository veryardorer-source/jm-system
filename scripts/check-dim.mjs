import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
const env = {}
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.replace(/^\uFEFF/, '').match(/^([A-Z0-9_]+)="?([^"]*)"?$/)
  if (m) env[m[1]] = m[2].trim()
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const { data } = await sb.from('project_files').select('file_name, file_url, thumb_url, file_size, created_at')
  .order('created_at', { ascending: false }).limit(4)
// WebP 헤더에서 가로x세로 읽기 (VP8L/VP8X/VP8 간단 파서)
function webpSize(buf) {
  if (buf.slice(0, 4).toString() !== 'RIFF') return null
  const fmt = buf.slice(12, 16).toString()
  if (fmt === 'VP8X') return [(buf.readUIntLE(24, 3) & 0xFFFFFF) + 1, (buf.readUIntLE(27, 3) & 0xFFFFFF) + 1]
  if (fmt === 'VP8 ') return [buf.readUInt16LE(26) & 0x3FFF, buf.readUInt16LE(28) & 0x3FFF]
  if (fmt === 'VP8L') { const b = buf.readUInt32LE(21); return [(b & 0x3FFF) + 1, ((b >> 14) & 0x3FFF) + 1] }
  return null
}
for (const f of data || []) {
  if (!/\.(webp|jpg|jpeg)$/i.test(f.file_name || '')) continue
  const res = await fetch(f.file_url)
  const buf = Buffer.from(await res.arrayBuffer())
  const dim = webpSize(buf)
  console.log(f.file_name)
  console.log('  본 이미지:', dim ? dim[0] + 'x' + dim[1] + 'px' : '(크기 판독 불가)', '|', Math.round(buf.length/1024) + 'KB')
  console.log('  썸네일 주소:', f.thumb_url ? '있음' : '없음')
}
