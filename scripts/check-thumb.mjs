import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
const env = {}
for (const l of fs.readFileSync('.env.local','utf8').split(/\r?\n/)) { const m = l.replace(/^\uFEFF/,'').match(/^([A-Z0-9_]+)="?([^"]*)"?$/); if (m) env[m[1]] = m[2].trim() }
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
function webpSize(buf){ if(buf.slice(0,4).toString()!=='RIFF')return null; const f=buf.slice(12,16).toString()
  if(f==='VP8X')return[(buf.readUIntLE(24,3)&0xFFFFFF)+1,(buf.readUIntLE(27,3)&0xFFFFFF)+1]
  if(f==='VP8 ')return[buf.readUInt16LE(26)&0x3FFF,buf.readUInt16LE(28)&0x3FFF]
  if(f==='VP8L'){const b=buf.readUInt32LE(21);return[(b&0x3FFF)+1,((b>>14)&0x3FFF)+1]} return null }
const { data } = await sb.from('project_files').select('file_name, file_url, thumb_url').not('thumb_url','is',null).order('created_at',{ascending:false}).limit(1)
const f = data[0]
for (const [label, url] of [['본 이미지(file_url)', f.file_url], ['썸네일(thumb_url)', f.thumb_url]]) {
  const b = Buffer.from(await (await fetch(url)).arrayBuffer())
  const d = webpSize(b)
  console.log(label, '→', d ? d[0]+'x'+d[1]+'px' : '?', Math.round(b.length/1024)+'KB')
}
