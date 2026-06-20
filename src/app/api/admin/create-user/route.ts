import { createServerClient } from '@supabase/ssr'
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

  // service role key로 사용자 생성
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

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
    name,
    role,
    team: null,
  }])

  if (profileError) {
    await adminClient.auth.admin.deleteUser(newUser.user.id)
    return NextResponse.json({ error: '프로필 생성 실패: ' + profileError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, userId: newUser.user.id })
}
