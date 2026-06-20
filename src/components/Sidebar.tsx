'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'

const NAV_ITEMS = [
  { href: '/', label: '대시보드', icon: '🏠' },
  { href: '/notices', label: '공지사항', icon: '📢' },
  { href: '/projects', label: '현장 관리', icon: '🏗️' },
  { href: '/receipts', label: '영수증', icon: '🧾' },
  { href: '/withdrawals', label: '출금 요청', icon: '💸' },
]

const ADMIN_ITEMS = [
  { href: '/admin/users', label: '직원 관리', icon: '👥' },
]

const ROLE_LABEL: Record<string, string> = {
  admin: '관리자',
  designer: '디자인팀',
  field: '현장팀',
  staff: '직원',
}

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { profile, signOut } = useAuth()
  const isAdmin = profile?.role === 'admin'

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
          {NAV_ITEMS.map(item => {
            const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
            return (
              <Link key={item.href} href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  active ? 'bg-green-600 text-white' : 'text-green-100 hover:bg-green-700 hover:text-white'
                }`}>
                <span>{item.label}</span>
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
                      active ? 'bg-green-600 text-white' : 'text-gray-400 hover:bg-green-700 hover:text-white'
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

      {/* 모바일 하단 탭바 */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-green-800 border-t border-green-700 z-40 flex">
        {NAV_ITEMS.map(item => {
          const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
          return (
            <Link key={item.href} href={item.href}
              className={`flex-1 flex flex-col items-center justify-center py-2 text-xs transition-colors ${
                active ? 'text-green-400' : 'text-gray-500'
              }`}>
              <span className="text-lg mb-0.5">{item.icon}</span>
              <span className="leading-none">{item.label.replace(' 관리', '').replace('사항', '')}</span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}

