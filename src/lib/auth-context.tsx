'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { User } from '@supabase/supabase-js'
import { createClient } from './supabase-browser'

const supabase = createClient()

export type UserRole = 'admin' | 'designer' | 'field' | 'partner' | 'staff'

export type Profile = {
  id: string
  name: string
  role: UserRole
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

// 외부협력업체(partner)는 보기 전용 — 추가/수정/삭제 불가
export function canEdit(profile: Profile | null) {
  return profile?.role !== 'partner'
}

// 관리자가 부여하는 정식 역할. 이 중 하나가 아니면 '승인 대기'(가입만 한 상태)로 보고 접근 차단.
export const APPROVED_ROLES = ['admin', 'designer', 'field', 'partner'] as const
export function isApproved(profile: Profile | null) {
  return !!profile && (APPROVED_ROLES as readonly string[]).includes(profile.role)
}
