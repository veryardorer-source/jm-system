import { createServerClient } from '@supabase/ssr'
import { createAdminClient } from '@/lib/supabase-admin'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

// 회원 내보내기(계정 삭제) — 관리자 전용.
// 계정과 개인 설정(알림 구독·방 멤버십·현장 접근권한)만 지우고,
// 그 사람이 올린 자료·메시지·작업일지는 기록으로 남긴다.
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

  const { userId } = await req.json()
  if (!userId) return NextResponse.json({ error: '대상이 없습니다' }, { status: 400 })
  if (userId === user.id) return NextResponse.json({ error: '본인 계정은 내보낼 수 없어요' }, { status: 400 })

  const adminClient = createAdminClient()

  // 개인 설정·멤버십 정리 (없는 테이블이어도 계속 진행)
  const cleanupTables: { table: string; col: string }[] = [
    { table: 'push_subscriptions', col: 'user_id' },
    { table: 'chat_room_members', col: 'user_id' },
    { table: 'chat_reads', col: 'user_id' },
    { table: 'notifications', col: 'user_id' },
    { table: 'project_access', col: 'user_id' },
  ]
  for (const { table, col } of cleanupTables) {
    await adminClient.from(table).delete().eq(col, userId)
  }
  await adminClient.from('profiles').delete().eq('id', userId)

  const { error: delError } = await adminClient.auth.admin.deleteUser(userId)
  if (delError) {
    return NextResponse.json({ error: '계정 삭제 실패: ' + delError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
