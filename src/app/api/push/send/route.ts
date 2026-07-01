import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import webpush from 'web-push'

export const runtime = 'nodejs'

// VAPID 키가 있을 때만 설정(빌드/키 미설정 환경에서 안전). 설정 성공 여부 반환.
function ensureVapid(): boolean {
  const pub = process.env.VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  if (!pub || !priv) return false
  try {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@example.com', pub, priv)
    return true
  } catch {
    return false
  }
}

export async function POST(req: NextRequest) {
  // 로그인한 사용자만 호출 가능
  const cookieStore = await cookies()
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  if (!ensureVapid()) return NextResponse.json({ ok: true, sent: 0, note: 'push not configured' })

  const { userIds, title, body, link } = await req.json()
  if (!Array.isArray(userIds) || userIds.length === 0) return NextResponse.json({ ok: true, sent: 0 })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data: subs } = await admin.from('push_subscriptions').select('*').in('user_id', userIds)
  if (!subs || subs.length === 0) return NextResponse.json({ ok: true, sent: 0 })

  const payload = JSON.stringify({ title: title || 'JM 관리 시스템', body: body || '', link: link || '/' })
  let sent = 0
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload
      )
      sent++
    } catch (e: unknown) {
      const code = (e as { statusCode?: number })?.statusCode
      if (code === 404 || code === 410) {
        // 만료된 구독 정리
        await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
      }
    }
  }))
  return NextResponse.json({ ok: true, sent })
}
