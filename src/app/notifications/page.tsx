'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'

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
            <p className="text-sm text-gray-500 mt-0.5">총 {items.length}개</p>
          </div>
          {items.length > 0 && (
            <button onClick={clearAll} className="text-xs text-gray-400 hover:text-red-500">모두 지우기</button>
          )}
        </header>

        <div className="flex-1 overflow-auto px-4 md:px-8 py-4 md:py-6 pb-20 md:pb-6">
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
                  onClick={() => { if (n.link) router.push(n.link) }}
                  className={`text-left bg-white rounded-xl border px-4 py-3 transition-colors ${
                    n.link ? 'hover:border-green-400 cursor-pointer' : 'cursor-default'
                  } ${n.is_read ? 'border-gray-200' : 'border-green-300 bg-green-50/40'}`}>
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
