// 알림/푸시는 서버(/api/push/send)가 수신자를 직접 계산·검증한다.
// 클라이언트는 "무엇을(event/내용)"만 보내고, "누구에게"는 서버가 정한다.

type NotifyPayload = {
  event: 'dm' | 'room' | 'mention' | 'broadcast'
  recipientId?: string
  recipientIds?: string[]
  roomId?: string
  notifType?: string
  title: string
  body?: string
  link?: string
}

function postNotify(p: NotifyPayload) {
  fetch('/api/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(p),
  }).catch(() => {})
}

// 본인을 제외한 전체 직원에게 알림 (서버가 대상 계산 → 임의 대상 지정 불가)
// currentUserId 는 호출부 호환용(서버가 auth.uid()로 본인 제외하므로 실제로는 미사용).
export function notifyOthers(
  _currentUserId: string | undefined,
  n: { type: string; title: string; body?: string; link?: string }
) {
  postNotify({ event: 'broadcast', notifType: n.type, title: n.title, body: n.body ?? '', link: n.link ?? '/' })
}

// 1:1 채팅 알림
export function notifyDM(recipientId: string, title: string, body: string, link: string) {
  postNotify({ event: 'dm', recipientId, notifType: 'chat', title, body, link })
}

// 채팅방 알림 (서버가 방 멤버십 검증 후 멤버에게만)
export function notifyRoom(roomId: string, title: string, body: string, link: string) {
  postNotify({ event: 'room', roomId, notifType: 'chat', title, body, link })
}

// @멘션 알림 (서버가 실재 사용자만 필터)
export function notifyMention(recipientIds: string[], title: string, body: string, link: string) {
  if (!recipientIds.length) return
  postNotify({ event: 'mention', recipientIds, notifType: 'chat', title, body, link })
}
