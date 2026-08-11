import { createAdminClient } from '@/lib/supabase-admin'
import { NextRequest, NextResponse } from 'next/server'

// 초대 수락 — 직원이 초대 링크에서 비밀번호를 정하면 그 순간 계정을 만든다.
// 로그인 전 상태에서 호출되는 공개 API지만, 64자 무작위 토큰이 있어야만 동작한다.
export async function POST(req: NextRequest) {
  const { token, password } = await req.json()
  if (typeof token !== 'string' || token.length < 32) {
    return NextResponse.json({ error: '유효하지 않은 초대 링크예요' }, { status: 400 })
  }
  if (typeof password !== 'string' || password.length < 8) {
    return NextResponse.json({ error: '비밀번호는 8자 이상이어야 합니다' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: invite } = await admin.from('invite_tokens').select('*').eq('token', token).maybeSingle()
  if (!invite) return NextResponse.json({ error: '유효하지 않은 초대 링크예요' }, { status: 400 })
  if (invite.used_at) return NextResponse.json({ error: '이미 사용된 초대예요. 관리자에게 다시 초대를 요청하세요.' }, { status: 400 })
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: '초대가 만료됐어요. 관리자에게 다시 초대를 요청하세요.' }, { status: 400 })
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: invite.email,
    password,
    email_confirm: true,
  })
  if (createError || !created?.user) {
    const msg = /already.*(registered|exists)/i.test(createError?.message || '')
      ? '이미 가입된 이메일이에요. 관리자에게 문의하세요.'
      : '계정 생성 실패: ' + (createError?.message || '알 수 없는 오류')
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  const { error: profileError } = await admin.from('profiles').insert([{
    id: created.user.id,
    name: invite.name,
    role: invite.role,
    team: null,
  }])
  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id)
    return NextResponse.json({ error: '프로필 생성 실패: ' + profileError.message }, { status: 500 })
  }

  await admin.from('invite_tokens').update({ used_at: new Date().toISOString() }).eq('token', token)

  return NextResponse.json({ success: true, email: invite.email, name: invite.name })
}
