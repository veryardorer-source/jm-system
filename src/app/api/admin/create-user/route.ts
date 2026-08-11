import { createServerClient } from '@supabase/ssr'
import { createAdminClient } from '@/lib/supabase-admin'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

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

  const { name, email, password, role } = await req.json()
  if (!name || !email || !password || !role) {
    return NextResponse.json({ error: '모든 항목을 입력해주세요' }, { status: 400 })
  }
  // 서버 검증: 허용된 역할만 저장 (클라이언트 값 신뢰 금지 — 'admin' 외 임의 문자열 차단)
  const ALLOWED_ROLES = ['admin', 'designer', 'field', 'partner']
  if (typeof role !== 'string' || !ALLOWED_ROLES.includes(role)) {
    return NextResponse.json({ error: '허용되지 않은 역할입니다' }, { status: 400 })
  }
  if (typeof name !== 'string' || !name.trim() || name.length > 50) {
    return NextResponse.json({ error: '이름이 올바르지 않습니다' }, { status: 400 })
  }
  if (typeof password !== 'string' || password.length < 6) {
    return NextResponse.json({ error: '비밀번호는 6자 이상이어야 합니다' }, { status: 400 })
  }

  // service role key로 사용자 생성
  const adminClient = createAdminClient()

  const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (createError) {
    return NextResponse.json({ error: createError.message }, { status: 400 })
  }

  const { error: profileError } = await adminClient.from('profiles').insert([{
    id: newUser.user.id,
    name: name.trim(),
    role,
    team: null,
  }])

  if (profileError) {
    await adminClient.auth.admin.deleteUser(newUser.user.id)
    return NextResponse.json({ error: '프로필 생성 실패: ' + profileError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, userId: newUser.user.id })
}
