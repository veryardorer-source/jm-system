import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import webpush from 'web-push'

export const runtime = 'nodejs'

const APPROVED = ['admin', 'designer', 'field', 'partner']

// VAPID 키가 있을 때만 설정(빌드/키 미설정 환경에서 안전).
function ensureVapid(): boolean {
  const pub = process.env.VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  if (!pub || !priv) return false
  try {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@example.com', pub, priv)
    return true
  } catch { return false }
}

type Body = {
  event?: 'dm' | 'room' | 'mention' | 'broadcast'
  recipientId?: string
  recipientIds?: string[]
  roomId?: string
  notifType?: string
  title?: string
  body?: string
  link?: string
}

export async function POST(req: NextRequest) {
  // 1) 로그인 확인
  const cookieStore = await cookies()
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // 2) 발신자 권한 확인 (승인된 사용자만)
  const { data: meProf } = await admin.from('profiles').select('id, role, name').eq('id', user.id).single()
  if (!meProf || !APPROVED.includes(meProf.role)) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const { event, recipientId, recipientIds, roomId, notifType, title, body, link } = (await req.json()) as Body

  // 3) 서버가 수신자를 직접 계산·검증 (클라이언트가 임의 대상 지정 불가)
  let recipients: string[] = []
  if (event === 'dm') {
    if (!recipientId) return NextResponse.json({ error: 'recipientId 필요' }, { status: 400 })
    const { data: r } = await admin.from('profiles').select('id').eq('id', recipientId).maybeSingle()
    if (!r) return NextResponse.json({ error: '대상 없음' }, { status: 400 })
    recipients = [recipientId]
  } else if (event === 'room') {
    if (!roomId) return NextResponse.json({ error: 'roomId 필요' }, { status: 400 })
    const { data: mem } = await admin.from('chat_room_members').select('user_id').eq('room_id', roomId)
    const ids = (mem || []).map(m => m.user_id)
    if (!ids.includes(user.id)) return NextResponse.json({ error: '방 멤버 아님' }, { status: 403 })
    recipients = ids.filter(id => id !== user.id)
  } else if (event === 'mention') {
    const want = (Array.isArray(recipientIds) ? recipientIds.slice(0, 50) : []).filter(id => id !== user.id)
    if (want.length === 0) return NextResponse.json({ ok: true, sent: 0, notified: 0 })
    if (roomId) {
      // 방 멘션: 발신자·대상 모두 방 멤버여야 함
      const { data: mem } = await admin.from('chat_room_members').select('user_id').eq('room_id', roomId)
      const memIds = new Set((mem || []).map(m => m.user_id))
      if (!memIds.has(user.id)) return NextResponse.json({ error: '방 멤버 아님' }, { status: 403 })
      recipients = want.filter(id => memIds.has(id))
    } else if (recipientId) {
      // DM 멘션: 대상은 DM 상대 한 명뿐
      const target = want.filter(id => id === recipientId)
      if (target.length) {
        const { data: r } = await admin.from('profiles').select('id').eq('id', recipientId).maybeSingle()
        recipients = r ? target : []
      }
    } else {
      // 전체 채팅 멘션: 승인된 사용자만
      const { data: profs } = await admin.from('profiles').select('id, role').in('id', want)
      recipients = (profs || []).filter(p => APPROVED.includes(p.role)).map(p => p.id)
    }
  } else if (event === 'broadcast') {
    if (meProf.role === 'partner') return NextResponse.json({ error: '권한 없음' }, { status: 403 })
    const { data: profs } = await admin.from('profiles').select('id')
    recipients = (profs || []).map(p => p.id).filter(id => id !== user.id)
  } else {
    return NextResponse.json({ error: 'event 값 필요' }, { status: 400 })
  }

  if (recipients.length === 0) return NextResponse.json({ ok: true, sent: 0, notified: 0 })

  // 4) 인앱 알림 저장 (service role → RLS 우회, 서버가 검증한 대상에게만)
  const safeTitle = (title || 'JM 관리 시스템').slice(0, 120)
  const safeBody = (body || '').slice(0, 300)
  const safeLink = link || '/'
  await admin.from('notifications').insert(
    recipients.map(uid => ({ user_id: uid, type: notifType || 'chat', title: safeTitle, body: safeBody || null, link: safeLink }))
  )

  // 5) 웹푸시 (설정돼 있을 때만)
  let sent = 0
  if (ensureVapid()) {
    const { data: subs } = await admin.from('push_subscriptions').select('*').in('user_id', recipients)
    if (subs && subs.length) {
      const payload = JSON.stringify({ title: safeTitle, body: safeBody, link: safeLink })
      await Promise.all(subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload)
          sent++
        } catch (e: unknown) {
          const code = (e as { statusCode?: number })?.statusCode
          if (code === 404 || code === 410) await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
        }
      }))
    }
  }

  return NextResponse.json({ ok: true, sent, notified: recipients.length })
}
