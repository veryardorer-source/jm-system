'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { subscribeToPush, unsubscribeFromPush, isPushSubscribed, pushSupported } from '@/lib/push'

type AppNotification = {
  id: string
  type: string | null
  title: string
  body: string | null
  link: string | null
  is_read: boolean
  created_at: string
}

export default function NotificationsPage() {
  const { profile } = useAuth()
  const router = useRouter()
  const [items, setItems] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(true)
  // 푸시 상태: 권한만이 아니라 "실제 구독 여부" 기준
  const [pushState, setPushState] = useState<'checking' | 'on' | 'off' | 'denied' | 'unsupported'>('checking')
  const [enabling, setEnabling] = useState(false)

  async function refreshPushState() {
    if (!pushSupported()) { setPushState('unsupported'); return }
    if (Notification.permission === 'denied') { setPushState('denied'); return }
    setPushState((await isPushSubscribed()) ? 'on' : 'off')
  }
  useEffect(() => { refreshPushState() }, [])

  async function enablePush() {
    setEnabling(true)
    const res = await subscribeToPush(profile?.id || '')
    if (!res.ok) alert('알림 켜기 실패: ' + (res.reason || '알 수 없는 오류'))
    await refreshPushState()
    setEnabling(false)
  }

  async function disablePush() {
    setEnabling(true)
    const res = await unsubscribeFromPush()
    if (!res.ok) alert('알림 끄기 실패: ' + (res.reason || '알 수 없는 오류'))
    await refreshPushState()
    setEnabling(false)
  }

  useEffect(() => {
    if (!profile?.id) return
    let active = true
    async function load() {
      const { data } = await supabase.from('notifications').select('*')
        .eq('user_id', profile!.id).order('created_at', { ascending: false }).limit(100)
      if (!active) return
      setItems(data || [])
      setLoading(false)
      // 본 알림은 읽음 처리
      const unreadIds = (data || []).filter(n => !n.is_read).map(n => n.id)
      if (unreadIds.length) await supabase.from('notifications').update({ is_read: true }).in('id', unreadIds)
    }
    load()
    return () => { active = false }
  }, [profile?.id])

  function fmt(iso: string) {
    return new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  // 알림 클릭 = 해당 내용으로 이동 + 확인한 알림은 목록에서 제거
  function openNotif(n: AppNotification) {
    supabase.from('notifications').delete().eq('id', n.id).then(() => {})
    setItems(prev => prev.filter(x => x.id !== n.id))
    if (n.link) router.push(n.link)
  }

  async function clearAll() {
    if (!profile?.id || items.length === 0) return
    if (!confirm('알림을 모두 지울까요?')) return
    await supabase.from('notifications').delete().eq('user_id', profile.id)
    setItems([])
  }

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <header className="bg-white border-b border-gray-200 px-4 md:px-8 py-4 md:py-5 flex items-center justify-between flex-shrink-0">
          <div>
            <h1 className="text-xl font-bold text-gray-900">알림</h1>
            <p className="text-sm text-gray-500 mt-0.5">총 {items.length}개 · 클릭하면 해당 내용으로 이동하고 목록에서 사라져요</p>
          </div>
          {items.length > 0 && (
            <button onClick={clearAll} className="text-xs text-gray-400 hover:text-red-500">모두 지우기</button>
          )}
        </header>

        <div className="flex-1 overflow-auto px-4 md:px-8 py-4 md:py-6 pb-20 md:pb-6">
          {/* 이 기기에서 OS 알림 받기 — 실제 구독 여부 기준, 켜기/끄기 토글 */}
          <div className="max-w-2xl mb-4">
            {pushState === 'checking' ? (
              <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-400">알림 상태 확인 중...</div>
            ) : pushState === 'on' ? (
              <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-center gap-3">
                <span className="text-lg">✅</span>
                <div className="flex-1 text-sm text-green-800">이 기기에서 알림을 받고 있어요. (앱을 꺼도 PC·휴대폰에 팝업)</div>
                <button onClick={disablePush} disabled={enabling}
                  className="text-xs border border-gray-300 text-gray-500 px-3 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-50 flex-shrink-0">
                  {enabling ? '처리 중...' : '알림 끄기'}
                </button>
              </div>
            ) : pushState === 'denied' ? (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
                🔕 이 브라우저에서 알림이 <b>차단</b>돼 있어요. 주소창 왼쪽 <b>자물쇠(🔒) 아이콘 → 알림 → 허용</b>으로 바꾼 뒤 새로고침해 주세요.
              </div>
            ) : pushState === 'unsupported' ? (
              <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-500">
                이 브라우저는 OS 알림을 지원하지 않아요. (아이폰·아이패드는 <b>홈 화면에 앱 설치</b> 후 이용 가능)
              </div>
            ) : (
              <div className="bg-green-600 text-white rounded-xl px-4 py-3 flex items-center gap-3 shadow-sm">
                <span className="text-lg">🔔</span>
                <div className="flex-1 text-sm">알림을 켜면 앱을 꺼도 새 소식이 이 기기에 팝업으로 떠요.</div>
                <button onClick={enablePush} disabled={enabling}
                  className="bg-white text-green-700 text-sm font-bold px-4 py-1.5 rounded-lg flex-shrink-0 disabled:opacity-50">
                  {enabling ? '켜는 중...' : '알림 켜기'}
                </button>
              </div>
            )}
          </div>
          {loading ? (
            <div className="text-center text-gray-400 py-16">불러오는 중...</div>
          ) : items.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 text-center py-16 text-gray-400">
              <p className="text-3xl mb-2">🔔</p><p>알림이 없어요</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2 max-w-2xl">
              {items.map(n => (
                <button key={n.id}
                  onClick={() => openNotif(n)}
                  className={`text-left bg-white rounded-xl border px-4 py-3 transition-colors hover:border-green-400 cursor-pointer ${
                    n.is_read ? 'border-gray-200' : 'border-green-300 bg-green-50/40'
                  }`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-gray-900">{n.title}</p>
                    <span className="text-xs text-gray-400 flex-shrink-0">{fmt(n.created_at)}</span>
                  </div>
                  {n.body && <p className="text-sm text-gray-500 mt-0.5">{n.body}</p>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
