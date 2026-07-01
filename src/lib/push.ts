import { supabase } from './supabase'

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

export function pushSupported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

// 알림 권한 요청 + 푸시 구독 → 서버(DB)에 저장. 앱이 꺼져 있어도 OS 알림이 오게 함.
export async function subscribeToPush(userId: string): Promise<boolean> {
  try {
    if (!pushSupported() || !userId) return false
    const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (!vapid) return false
    if (Notification.permission === 'denied') return false
    if (Notification.permission === 'default') {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') return false
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
    await supabase.from('push_subscriptions').upsert({
      endpoint: sub.endpoint,
      user_id: userId,
      p256dh: json.keys?.p256dh || '',
      auth: json.keys?.auth || '',
    }, { onConflict: 'endpoint' })
    return true
  } catch {
    return false
  }
}
