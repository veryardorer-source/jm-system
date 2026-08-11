import { createServerClient } from '@supabase/ssr'
import { createAdminClient } from '@/lib/supabase-admin'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

// 직원 초대 (관리자 전용) — 초대 메일을 보내고, 직원이 메일 링크에서 비밀번호를 직접 정한다.
// (관리자가 비밀번호를 아는 임시 비밀번호 방식의 대안 — 2026-08-11 초대제 전환)
export async function POST(req: NextRequest) {
  // 요청자가 admin인지 확인
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() {},
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: '관리자 권한 필요' }, { status: 403 })
  }

  const { name, email, role } = await req.json()
  const ALLOWED_ROLES = ['admin', 'designer', 'field', 'partner']
  if (!name || !email || !role) return NextResponse.json({ error: '모든 항목을 입력해주세요' }, { status: 400 })
  if (typeof role !== 'string' || !ALLOWED_ROLES.includes(role)) {
    return NextResponse.json({ error: '허용되지 않은 역할입니다' }, { status: 400 })
  }
  if (typeof name !== 'string' || !name.trim() || name.length > 50) {
    return NextResponse.json({ error: '이름이 올바르지 않습니다' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  // 초대 "링크" 생성 — 메일 서버 없이도 동작. 관리자가 링크를 카톡 등으로 직접 전달하고,
  // 직원이 링크를 열면 우리 앱의 비밀번호 설정 화면(/set-password)으로 이동한다.
  const redirectTo = `${req.nextUrl.origin}/set-password`
  const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { redirectTo },
  })
  if (linkError || !linkData?.user) {
    const msg = /already.*(registered|exists)/i.test(linkError?.message || '')
      ? '이미 가입된 이메일입니다' : '초대 링크 생성 실패: ' + (linkError?.message || '알 수 없는 오류')
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  const { error: profileError } = await adminClient.from('profiles').insert([{
    id: linkData.user.id,
    name: name.trim(),
    role,
    team: null,
  }])
  if (profileError) {
    await adminClient.auth.admin.deleteUser(linkData.user.id)
    return NextResponse.json({ error: '프로필 생성 실패: ' + profileError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, userId: linkData.user.id, link: linkData.properties?.action_link || '' })
}
