'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'

const NAV_ITEMS = [
  { href: '/', label: '대시보드', icon: '🏠' },
  { href: '/notices', label: '공지사항', icon: '📢' },
  { href: '/projects', label: '현장 관리', icon: '🏗️' },
  { href: '/worklogs', label: '작업일지', icon: '📒' },
  { href: '/receipts', label: '영수증', icon: '🧾' },
  { href: '/withdrawals', label: '출금 요청', icon: '💸' },
  { href: '/payments', label: '수금 관리', icon: '💰' },
  { href: '/documents', label: '회사 서류', icon: '🗂️' },
  { href: '/contacts', label: '거래처', icon: '📇' },
  { href: '/chat', label: '채팅', icon: '💬' },
  { href: '/notifications', label: '알림', icon: '🔔' },
]

const ADMIN_ITEMS = [
  { href: '/admin/users', label: '회원 관리', icon: '👥' },
  { href: '/admin/employees', label: '직원정보내역', icon: '🔒' },
  { href: '/admin/finance', label: '경영관리', icon: '📊' },
]

// 외부협력업체(partner)에게 숨길 메뉴 (금전·내부 자료) — 현장 관련만 보이게
const PARTNER_HIDDEN = ['/receipts', '/withdrawals', '/payments', '/worklogs', '/documents', '/contacts', '/chat', '/search']

// 모바일 하단바에 항상 보일 핵심 메뉴 (나머지는 '더보기'로)
const MOBILE_PRIMARY = ['/', '/projects', '/chat', '/notifications']
const MOBILE_SHORT: Record<string, string> = {
  '/': '홈', '/projects': '현장', '/chat': '채팅', '/notifications': '알림',
}

const ROLE_LABEL: Record<string, string> = {
  admin: '관리자',
  designer: '디자인팀',
  field: '현장팀',
  partner: '외부협력업체',
  staff: '직원',
}

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { profile, signOut } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const isPartner = profile?.role === 'partner'
  const navItems = isPartner ? NAV_ITEMS.filter(i => !PARTNER_HIDDEN.includes(i.href)) : NAV_ITEMS
  const [unread, setUnread] = useState(0)
  const [chatUnread, setChatUnread] = useState(0)
  const [moreOpen, setMoreOpen] = useState(false)

  useEffect(() => {
    if (!profile?.id) return
    let active = true
    const load = async () => {
      const [{ count: total }, { count: chat }] = await Promise.all([
        supabase.from('notifications').select('id', { count: 'exact', head: true })
          .eq('user_id', profile.id).eq('is_read', false),
        supabase.from('notifications').select('id', { count: 'exact', head: true })
          .eq('user_id', profile.id).eq('is_read', false).eq('type', 'chat'),
      ])
      if (active) { setUnread(total || 0); setChatUnread(chat || 0) }
    }
    load()
    const ch = supabase.channel('notif-' + profile.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${profile.id}` }, load)
      .subscribe()
    return () => { active = false; supabase.removeChannel(ch) }
  }, [profile?.id, pathname])

  async function handleSignOut() {
    await signOut()
    router.push('/login')
  }

  return (
    <>
      {/* 데스크탑 사이드바 */}
      <aside className="hidden md:flex w-56 bg-green-800 min-h-screen flex-col flex-shrink-0">
        <div className="px-5 py-5 border-b border-green-700">
          <Image src="/logo.png" alt="JM Architecture Interior" width={140} height={48} className="brightness-0 invert" />
        </div>
        <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
          {navItems.map(item => {
            const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
            return (
              <Link key={item.href} href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  active ? 'bg-green-600 text-white' : 'text-green-100 hover:bg-green-700 hover:text-white'
                }`}>
                <span>{item.label}</span>
                {item.href === '/notifications' && unread > 0 && (
                  <span className="ml-auto bg-red-500 text-white text-xs rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center">
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
                {item.href === '/chat' && chatUnread > 0 && (
                  <span className="ml-auto bg-red-500 text-white text-xs rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center">
                    {chatUnread > 99 ? '99+' : chatUnread}
                  </span>
                )}
              </Link>
            )
          })}
          {isAdmin && (
            <>
              <div className="mt-3 mb-1 px-3 text-xs text-green-400 font-semibold uppercase tracking-wide">관리자</div>
              {ADMIN_ITEMS.map(item => {
                const active = pathname.startsWith(item.href)
                return (
                  <Link key={item.href} href={item.href}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                      active ? 'bg-green-600 text-white' : 'text-green-100 hover:bg-green-700 hover:text-white'
                    }`}>
                    <span>{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                )
              })}
            </>
          )}
        </nav>
        <div className="px-4 py-4 border-t border-gray-700">
          {profile && (
            <div className="mb-3">
              <p className="text-white text-sm font-medium">{profile.name}</p>
              <p className="text-green-200 text-xs mt-0.5">{ROLE_LABEL[profile.role] || profile.role}</p>
            </div>
          )}
          <button onClick={handleSignOut}
            className="w-full text-left text-green-300 hover:text-white text-xs transition-colors">
            로그아웃
          </button>
        </div>
      </aside>

      {/* 모바일 하단 탭바 — 핵심 4개 + 더보기 */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-green-800 border-t border-green-700 z-50 flex h-14">
        {navItems.filter(i => MOBILE_PRIMARY.includes(i.href)).map(item => {
          const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
          return (
            <Link key={item.href} href={item.href} onClick={() => setMoreOpen(false)}
              className={`relative flex-1 flex flex-col items-center justify-center py-1.5 text-xs transition-colors ${
                active && !moreOpen ? 'text-white font-semibold' : 'text-green-100'
              }`}>
              <span className="text-lg mb-0.5">{item.icon}</span>
              <span className="leading-none">{MOBILE_SHORT[item.href] || item.label}</span>
              {item.href === '/notifications' && unread > 0 && (
                <span className="absolute top-1 right-[24%] bg-red-500 text-white text-[10px] rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
              {item.href === '/chat' && chatUnread > 0 && (
                <span className="absolute top-1 right-[24%] bg-red-500 text-white text-[10px] rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
                  {chatUnread > 99 ? '99+' : chatUnread}
                </span>
              )}
            </Link>
          )
        })}
        <button onClick={() => setMoreOpen(v => !v)}
          className={`flex-1 flex flex-col items-center justify-center py-1.5 text-xs transition-colors ${moreOpen ? 'text-white font-semibold' : 'text-green-100'}`}>
          <span className="text-lg mb-0.5">☰</span>
          <span className="leading-none">더보기</span>
        </button>
      </nav>

      {/* 모바일 더보기 시트 */}
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-40" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="absolute bottom-14 left-0 right-0 bg-white rounded-t-2xl px-4 pt-4 pb-5 shadow-2xl" onClick={e => e.stopPropagation()}>
            {profile && (
              <div className="mb-3 px-1">
                <p className="text-sm font-semibold text-gray-900">{profile.name}</p>
                <p className="text-xs text-gray-400">{ROLE_LABEL[profile.role] || profile.role}</p>
              </div>
            )}
            <div className="grid grid-cols-4 gap-2">
              {navItems.filter(i => !MOBILE_PRIMARY.includes(i.href)).map(item => {
                const active = pathname.startsWith(item.href)
                return (
                  <Link key={item.href} href={item.href} onClick={() => setMoreOpen(false)}
                    className={`flex flex-col items-center gap-1 py-3 rounded-xl text-center ${active ? 'bg-green-50' : 'hover:bg-gray-50'}`}>
                    <span className="text-2xl">{item.icon}</span>
                    <span className="text-[11px] text-gray-700 leading-tight">{item.label}</span>
                  </Link>
                )
              })}
              {isAdmin && ADMIN_ITEMS.map(item => {
                const active = pathname.startsWith(item.href)
                return (
                  <Link key={item.href} href={item.href} onClick={() => setMoreOpen(false)}
                    className={`flex flex-col items-center gap-1 py-3 rounded-xl text-center ${active ? 'bg-green-50' : 'hover:bg-gray-50'}`}>
                    <span className="text-2xl">{item.icon}</span>
                    <span className="text-[11px] text-gray-700 leading-tight">{item.label}</span>
                  </Link>
                )
              })}
            </div>
            <button onClick={handleSignOut}
              className="mt-3 w-full text-center text-sm text-red-500 py-2.5 border-t border-gray-100">로그아웃</button>
          </div>
        </div>
      )}

      {/* 통합 검색 — 항상 보이는 고정 버튼 (오른쪽 아래) */}
      {!isPartner && pathname !== '/search' && pathname !== '/chat' && (
        <Link href="/search" title="통합 검색"
          className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-40 w-14 h-14 rounded-full bg-green-600 text-white shadow-xl flex items-center justify-center text-2xl hover:bg-green-700 active:scale-95 transition-transform"
          aria-label="통합 검색">
          🔍
        </Link>
      )}
    </>
  )
}

