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

  // 자체 초대장 방식 (2026-08-11): 무작위 토큰을 DB에 저장하고 7일간 유효한 링크를 만든다.
  // 계정은 직원이 링크를 열어 비밀번호를 정하는 순간(/api/invite/accept) 생성된다.
  // → 만료시간을 우리가 정하고, 메일 서버·Supabase 링크 만료 제한과 무관하게 동작.
  const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
  const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()

  const { error: tokenError } = await adminClient.from('invite_tokens').insert([{
    token, email, name: name.trim(), role, expires_at: expiresAt, created_by: user.id,
  }])
  if (tokenError) {
    const hint = /relation|exist|schema/i.test(tokenError.message) ? ' (관리자에게: db/invite_tokens.sql 실행 필요)' : ''
    return NextResponse.json({ error: '초대장 생성 실패: ' + tokenError.message + hint }, { status: 500 })
  }

  return NextResponse.json({ success: true, link: `${req.nextUrl.origin}/invite?t=${token}` })
}
