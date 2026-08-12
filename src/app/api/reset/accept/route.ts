import { createAdminClient } from '@/lib/supabase-admin'
import { NextRequest, NextResponse } from 'next/server'

// 비밀번호 재설정 수락 — 직원이 링크에서 새 비밀번호를 정하는 순간 적용.
// 로그인 전 공개 API지만 64자 무작위 토큰이 있어야만 동작.
export async function POST(req: NextRequest) {
  const { token, password } = await req.json()
  if (typeof token !== 'string' || token.length < 32) {
    return NextResponse.json({ error: '유효하지 않은 링크예요' }, { status: 400 })
  }
  if (typeof password !== 'string' || password.length < 8) {
    return NextResponse.json({ error: '비밀번호는 8자 이상이어야 합니다' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: t } = await admin.from('invite_tokens').select('*').eq('token', token).eq('kind', 'reset').maybeSingle()
  if (!t || !t.target_user) return NextResponse.json({ error: '유효하지 않은 링크예요' }, { status: 400 })
  if (t.used_at) return NextResponse.json({ error: '이미 사용된 링크예요. 관리자에게 다시 요청하세요.' }, { status: 400 })
  if (new Date(t.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: '링크가 만료됐어요. 관리자에게 다시 요청하세요.' }, { status: 400 })
  }

  const { error: upErr } = await admin.auth.admin.updateUserById(t.target_user, { password })
  if (upErr) return NextResponse.json({ error: '변경 실패: ' + upErr.message }, { status: 500 })

  await admin.from('invite_tokens').update({ used_at: new Date().toISOString() }).eq('token', token)
  return NextResponse.json({ success: true, email: t.email, name: t.name })
}
