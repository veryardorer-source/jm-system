'use client'

import { usePathname } from 'next/navigation'
import { useAuth, isApproved } from '@/lib/auth-context'

const PUBLIC_PATHS = ['/login', '/signup']

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, signOut } = useAuth()
  const pathname = usePathname()

  // 로그인/가입 페이지는 그대로 통과
  if (PUBLIC_PATHS.some(p => pathname?.startsWith(p))) return <>{children}</>

  // 인증/프로필 확인 중
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">불러오는 중...</div>
  }

  // 로그인했지만 아직 권한(역할)을 못 받은 상태 → 승인 대기 화면
  if (user && !isApproved(profile)) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center">
          <div className="w-14 h-14 bg-amber-400 rounded-2xl flex items-center justify-center text-white text-2xl mx-auto mb-4">⏳</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">관리자 승인 대기 중</h1>
          <p className="text-sm text-gray-500 mb-1">가입이 완료되었습니다{profile?.name ? `, ${profile.name}님` : ''}.</p>
          <p className="text-sm text-gray-500 mb-6">대표(관리자)가 권한을 부여하면 이용할 수 있어요.<br/>승인 후 다시 로그인해 주세요.</p>
          <button onClick={() => signOut()}
            className="inline-block bg-green-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-green-700">
            로그아웃
          </button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
