'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { useAuth, Profile, UserRole } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase-browser'

const ROLE_OPTIONS: { value: UserRole; label: string; color: string }[] = [
  { value: 'admin', label: '관리자', color: 'bg-red-100 text-red-700' },
  { value: 'designer', label: '디자인팀', color: 'bg-purple-100 text-purple-700' },
  { value: 'field', label: '현장팀', color: 'bg-blue-100 text-blue-700' },
  { value: 'staff', label: '직원', color: 'bg-gray-100 text-gray-700' },
]

export default function AdminUsersPage() {
  const router = useRouter()
  const { profile: myProfile, loading: authLoading } = useAuth()
  const [users, setUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    if (!authLoading) {
      if (!myProfile || myProfile.role !== 'admin') {
        router.push('/')
        return
      }
      fetchUsers()
    }
  }, [authLoading, myProfile])

  async function fetchUsers() {
    const supabase = createClient()
    const { data } = await supabase.from('profiles').select('*').order('name')
    setUsers(data || [])
    setLoading(false)
  }

  async function updateRole(userId: string, role: UserRole) {
    setSaving(userId)
    const supabase = createClient()
    await supabase.from('profiles').update({ role }).eq('id', userId)
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, role } : u))
    setSaving(null)
  }

  async function updateName(userId: string, name: string) {
    const supabase = createClient()
    await supabase.from('profiles').update({ name }).eq('id', userId)
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, name } : u))
  }

  if (authLoading || loading) return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex items-center justify-center text-gray-400">불러오는 중...</div>
    </div>
  )

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <header className="bg-white border-b border-gray-200 px-4 md:px-8 py-4 md:py-5">
          <h1 className="text-xl font-bold text-gray-900">직원 관리</h1>
          <p className="text-sm text-gray-500 mt-0.5">가입한 직원의 권한을 설정합니다</p>
        </header>

        <div className="flex-1 px-4 md:px-8 py-6 pb-20 md:pb-6">
          {users.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 text-center py-16 text-gray-400">
              <p className="text-3xl mb-2">👥</p>
              <p>가입한 직원이 없습니다</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {/* 데스크탑 테이블 */}
              <table className="w-full hidden md:table">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left text-xs font-semibold text-gray-400 px-6 py-3">이름</th>
                    <th className="text-left text-xs font-semibold text-gray-400 px-4 py-3">권한</th>
                    <th className="text-left text-xs font-semibold text-gray-400 px-4 py-3">권한 변경</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => {
                    const roleInfo = ROLE_OPTIONS.find(r => r.value === u.role)
                    return (
                      <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-6 py-3">
                          <NameCell user={u} onSave={name => updateName(u.id, name)} isMe={u.id === myProfile?.id} />
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${roleInfo?.color}`}>
                            {roleInfo?.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1.5">
                            {ROLE_OPTIONS.map(r => (
                              <button key={r.value}
                                disabled={saving === u.id || u.role === r.value || u.id === myProfile?.id}
                                onClick={() => updateRole(u.id, r.value)}
                                className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                                  u.role === r.value
                                    ? r.color + ' border-transparent font-semibold'
                                    : 'border-gray-200 text-gray-500 hover:border-gray-400 disabled:opacity-40 disabled:cursor-not-allowed'
                                }`}>
                                {r.label}
                              </button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              {/* 모바일 카드 */}
              <div className="md:hidden flex flex-col divide-y divide-gray-100">
                {users.map(u => {
                  const roleInfo = ROLE_OPTIONS.find(r => r.value === u.role)
                  return (
                    <div key={u.id} className="px-4 py-4">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="text-sm font-semibold text-gray-800">{u.name}</p>
                          {u.id === myProfile?.id && <p className="text-xs text-blue-500">나</p>}
                        </div>
                        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${roleInfo?.color}`}>
                          {roleInfo?.label}
                        </span>
                      </div>
                      {u.id !== myProfile?.id && (
                        <div className="flex gap-1.5 flex-wrap">
                          {ROLE_OPTIONS.map(r => (
                            <button key={r.value}
                              disabled={saving === u.id || u.role === r.value}
                              onClick={() => updateRole(u.id, r.value)}
                              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                                u.role === r.value
                                  ? r.color + ' border-transparent font-semibold'
                                  : 'border-gray-200 text-gray-500 hover:border-gray-400 disabled:opacity-40'
                              }`}>
                              {r.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function NameCell({ user, onSave, isMe }: { user: Profile; onSave: (name: string) => void; isMe: boolean }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(user.name)

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <input value={value} onChange={e => setValue(e.target.value)}
          className="border border-gray-300 rounded px-2 py-1 text-sm w-28 focus:outline-none focus:ring-1 focus:ring-blue-500"
          onKeyDown={e => { if (e.key === 'Enter') { onSave(value); setEditing(false) } if (e.key === 'Escape') setEditing(false) }}
          autoFocus />
        <button onClick={() => { onSave(value); setEditing(false) }} className="text-xs text-blue-600 hover:underline">저장</button>
        <button onClick={() => setEditing(false)} className="text-xs text-gray-400">취소</button>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium text-gray-800">{user.name}</span>
      {isMe && <span className="text-xs text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">나</span>}
      <button onClick={() => setEditing(true)} className="text-xs text-gray-300 hover:text-gray-500">수정</button>
    </div>
  )
}
