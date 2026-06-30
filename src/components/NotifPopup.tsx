'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'

type Toast = { id: string; title: string; body: string; link?: string }
type NewNotif = { id?: string; title?: string; body?: string | null; link?: string | null }

export default function NotifPopup() {
  const { profile } = useAuth()
  const router = useRouter()
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    if (!profile?.id) return
    // 알림 권한 요청 (이미 결정돼 있으면 무시됨)
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }
    const ch = supabase.channel('notif-popup-' + profile.id)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${profile.id}` },
        (payload) => {
          const n = payload.new as NewNotif
          const title = n.title || '새 알림'
          const body = n.body || ''
          const link = n.link || undefined
          const id = n.id || String(Date.now())
          // 1) OS 알림 팝업 (허용된 경우 — 백그라운드에서도 표시)
          try {
            if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
              const notif = new Notification(title, { body, icon: '/icons/icon-192.png', tag: id })
              notif.onclick = () => { window.focus(); if (link) router.push(link); notif.close() }
            }
          } catch { /* 무시 */ }
          // 2) 앱 내 토스트 팝업 (앱을 보고 있을 때)
          setToasts(t => [...t.filter(x => x.id !== id), { id, title, body, link }])
          setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 6000)
        })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [profile?.id, router])

  if (toasts.length === 0) return null
  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 w-80 max-w-[92vw]">
      {toasts.map(t => (
        <button key={t.id}
          onClick={() => { if (t.link) router.push(t.link); setToasts(x => x.filter(y => y.id !== t.id)) }}
          className="text-left bg-white border border-gray-200 shadow-lg rounded-xl px-4 py-3 hover:bg-gray-50 transition-colors">
          <div className="flex items-start gap-2">
            <span className="text-lg leading-none">🔔</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900 truncate">{t.title}</p>
              {t.body && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{t.body}</p>}
            </div>
          </div>
        </button>
      ))}
    </div>
  )
}
