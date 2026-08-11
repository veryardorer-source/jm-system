'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { User } from '@supabase/supabase-js'
import { createClient } from './supabase-browser'

const supabase = createClient()

// 실제 운영 역할 4가지 + 승인 대기(pending). ('staff'는 어디에도 안 쓰여 제거 — 2026-08-11)
export type UserRole = 'admin' | 'designer' | 'field' | 'partner'

export type Profile = {
  id: string
  name: string
  role: UserRole | 'pending'
  team: string | null
}

type AuthContextType = {
  user: User | null
  profile: Profile | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  async function fetchProfile(userId: string) {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
    setProfile(data)
    setLoading(false)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else { setProfile(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}

export function isAdmin(profile: Profile | null) {
  return profile?.role === 'admin'
}

// 수정 가능 = 승인된 내부 직원(admin/designer/field)만.
// 프로필 없음·pending·partner·알 수 없는 역할은 전부 보기 전용/차단.
// (구버전은 "partner가 아니면 가능"이라 profile=null 도 true 가 되는 버그 — 2026-08-11 수정)
export function canEdit(profile: Profile | null) {
  return profile?.role === 'admin' || profile?.role === 'designer' || profile?.role === 'field'
}

// 관리자가 부여하는 정식 역할. 이 중 하나가 아니면 '승인 대기'(가입만 한 상태)로 보고 접근 차단.
export const APPROVED_ROLES = ['admin', 'designer', 'field', 'partner'] as const
export function isApproved(profile: Profile | null) {
  return !!profile && (APPROVED_ROLES as readonly string[]).includes(profile.role)
}
