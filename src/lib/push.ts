import { supabase } from './supabase'

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

// 환경변수에 딸려온 BOM·공백 제거 (서비스키 BOM 사고와 동일 예방)
const cleanEnv = (v?: string) => (v || '').replace(/^﻿+/, '').trim()

export function pushSupported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export type PushResult = { ok: boolean; reason?: string }

/** 이 기기가 실제로 구독돼 있는지 (권한만이 아니라 브라우저 구독 객체 기준) */
export async function isPushSubscribed(): Promise<boolean> {
  try {
    if (!pushSupported() || Notification.permission !== 'granted') return false
    const reg = await navigator.serviceWorker.ready
    return !!(await reg.pushManager.getSubscription())
  } catch { return false }
}

// 알림 권한 요청 + 푸시 구독 → 서버(DB)에 저장. 실패 시 이유 반환.
export async function subscribeToPush(userId: string): Promise<PushResult> {
  try {
    if (!pushSupported()) return { ok: false, reason: '이 브라우저는 푸시를 지원하지 않아요' }
    if (!userId) return { ok: false, reason: '로그인 정보가 없어요' }
    const vapid = cleanEnv(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY)
    if (!vapid) return { ok: false, reason: '푸시 서버 키가 설정되지 않았어요' }
    if (Notification.permission === 'denied') return { ok: false, reason: '브라우저에서 알림이 차단돼 있어요 (주소창 자물쇠 → 알림 → 허용)' }
    if (Notification.permission === 'default') {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') return { ok: false, reason: '알림 허용을 선택하지 않았어요' }
    }
    const reg = await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid),
      })
    }
    const json = sub.toJSON()
    const { error } = await supabase.from('push_subscriptions').upsert({
      endpoint: sub.endpoint,
      user_id: userId,
      p256dh: json.keys?.p256dh || '',
      auth: json.keys?.auth || '',
    }, { onConflict: 'endpoint' })
    if (error) return { ok: false, reason: '서버 저장 실패: ' + error.message }
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) }
  }
}

/** 이 기기의 푸시 알림 끄기 — 브라우저 구독 해제 + 서버 구독정보 삭제 */
export async function unsubscribeFromPush(): Promise<PushResult> {
  try {
    if (!pushSupported()) return { ok: true }
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (!sub) return { ok: true }
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
    await sub.unsubscribe()
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) }
  }
}
