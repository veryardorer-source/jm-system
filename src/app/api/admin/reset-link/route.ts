import { createServerClient } from '@supabase/ssr'
import { createAdminClient } from '@/lib/supabase-admin'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

// 비밀번호 재설정 링크 발급 (관리자 전용) — 링크를 카톡 등으로 직원에게 전달하면
// 직원이 새 비밀번호를 직접 정한다. 3일 유효·1회용.
export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!me || me.role !== 'admin') return NextResponse.json({ error: '관리자 권한 필요' }, { status: 403 })

  const { userId } = await req.json()
  if (!userId || typeof userId !== 'string') return NextResponse.json({ error: '대상이 없습니다' }, { status: 400 })

  const admin = createAdminClient()
  const { data: target } = await admin.from('profiles').select('name').eq('id', userId).single()
  const { data: authUser, error: authErr } = await admin.auth.admin.getUserById(userId)
  if (authErr || !authUser?.user?.email) return NextResponse.json({ error: '대상 계정을 찾을 수 없어요' }, { status: 404 })

  const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
  const { error: insErr } = await admin.from('invite_tokens').insert([{
    token,
    email: authUser.user.email,
    name: target?.name || '',
    role: 'field', // reset에서는 사용 안 함 (스키마 not null 충족용)
    kind: 'reset',
    target_user: userId,
    expires_at: new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString(),
    created_by: user.id,
  }])
  if (insErr) {
    const hint = /kind|target_user|column/i.test(insErr.message) ? ' (관리자에게: db/reset_tokens.sql 실행 필요)' : ''
    return NextResponse.json({ error: '재설정 링크 생성 실패: ' + insErr.message + hint }, { status: 500 })
  }

  return NextResponse.json({ success: true, link: `${req.nextUrl.origin}/reset?t=${token}` })
}
