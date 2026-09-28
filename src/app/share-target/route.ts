import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAdminClient, cleanEnv } from '@/lib/supabase-admin'

export const runtime = 'nodejs'

// 폰 '공유하기' 서버 대비책 — 원래는 서비스워커(sw.js)가 이 POST를 가로채 처리한다.
// 그런데 서비스워커가 아직 설치 전·재설치 중·꺼진 상태면 요청이 서버로 곧장 와서
// 404/로그인 화면이 떠 '현장·카테고리 선택' 화면이 안 나오던 문제(2026-09-28) 대응.
// 받은 파일을 잠금 보관함(secure) share-inbox/<사용자>/<묶음>/ 에 임시 보관하고
// /share?inbox=<묶음> 으로 넘겨, 공유 화면이 거기서 꺼내 쓴다(꺼낸 뒤 즉시 삭제).
// ※ Vercel 요청 한도(약 4.5MB)를 넘는 큰 묶음은 여기까지 오지 못함 — 문자 사진(수백KB)은 충분.

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const authClient = createServerClient(
    cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL),
    cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', req.url), 303)

  const batch = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const dir = `share-inbox/${user.id}/${batch}`
  const files: { path: string; name: string; type: string; size: number }[] = []
  let text = ''
  let error = ''
  let received = 0

  try {
    const form = await req.formData()
    text = ['title', 'text', 'url']
      .map(k => form.get(k))
      .filter((v): v is string => typeof v === 'string' && !!v.trim())
      .join('\n')
      .trim()

    const admin = createAdminClient()
    // 파일 필드명은 'files'가 표준이지만 기기·앱마다 달라 전부 훑는다 (sw.js와 동일)
    const entries = [...form.values()].filter((v): v is File => typeof v === 'object' && v !== null && 'arrayBuffer' in v)
    received = entries.length
    for (let i = 0; i < entries.length; i++) {
      const f = entries[i]
      const buf = Buffer.from(await f.arrayBuffer())
      if (!buf.byteLength) continue
      const path = `${dir}/${i}`
      const { error: upErr } = await admin.storage.from('secure').upload(path, buf, {
        contentType: f.type || 'application/octet-stream',
        upsert: true,
      })
      if (upErr) { error = upErr.message; continue }
      files.push({ path, name: f.name || `file${i}`, type: f.type || '', size: buf.byteLength })
    }
    const manifest = JSON.stringify({ text, received, files, error })
    await admin.storage.from('secure').upload(`${dir}/manifest.json`, Buffer.from(manifest), {
      contentType: 'application/json',
      upsert: true,
    })
  } catch (e) {
    // 보관 실패해도 공유 화면은 띄운다 (사진 직접 선택으로 이어갈 수 있게)
    const msg = encodeURIComponent(String((e as Error)?.message || e).slice(0, 200))
    return NextResponse.redirect(new URL(`/share?inboxError=${msg}`, req.url), 303)
  }

  return NextResponse.redirect(new URL(`/share?inbox=${batch}`, req.url), 303)
}

// 주소창 등으로 GET 접근 시 공유 화면으로
export function GET(req: NextRequest) {
  return NextResponse.redirect(new URL('/share', req.url), 303)
}
