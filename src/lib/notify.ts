import { supabase } from './supabase'

// 본인을 제외한 모든 직원에게 알림을 보낸다.
export async function notifyOthers(
  currentUserId: string | undefined,
  n: { type: string; title: string; body?: string; link?: string }
) {
  const { data: profs } = await supabase.from('profiles').select('id')
  if (!profs) return
  const recipients = profs.filter(p => p.id !== currentUserId).map(p => p.id)
  if (recipients.length === 0) return
  const rows = recipients.map(id => ({
    user_id: id,
    type: n.type,
    title: n.title,
    body: n.body ?? null,
    link: n.link ?? null,
  }))
  await supabase.from('notifications').insert(rows)
  // 웹 푸시(앱이 꺼져 있어도 OS 알림) — 실패해도 무시
  sendPush(recipients, n.title, n.body ?? '', n.link ?? '/')
}

// 대상 사용자들에게 OS 푸시 알림 발송 (서버 API 호출)
export function sendPush(userIds: string[], title: string, body: string, link: string) {
  if (!userIds || userIds.length === 0) return
  fetch('/api/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userIds, title, body, link }),
  }).catch(() => {})
}
