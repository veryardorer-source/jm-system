'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { useAuth, Profile, UserRole } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase-browser'

const ROLE_OPTIONS: { value: UserRole; label: string; color: string }[] = [
  { value: 'admin', label: '관리자', color: 'bg-red-100 text-red-700' },
  { value: 'designer', label: '디자인팀', color: 'bg-purple-100 text-purple-700' },
  { value: 'field', label: '현장팀', color: 'bg-green-100 text-green-700' },
  { value: 'partner', label: '외부협력업체', color: 'bg-gray-100 text-gray-600' },
]

const INITIAL_FORM = { name: '', email: '', password: '', role: 'designer' as UserRole }

export default function AdminUsersPage() {
  const router = useRouter()
  const { profile: myProfile, loading: authLoading } = useAuth()
  const [users, setUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [addForm, setAddForm] = useState(INITIAL_FORM)
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')
  const [storageBytes, setStorageBytes] = useState<number | null>(null) // 전체 Storage 사용량
  const [inviteMode, setInviteMode] = useState(true) // true=초대 링크(권장) / false=임시 비밀번호 직접 설정
  const [inviteLink, setInviteLink] = useState<{ name: string; link: string } | null>(null) // 생성된 초대 링크 표시
  const [linkCopied, setLinkCopied] = useState(false)

  useEffect(() => {
    if (!authLoading) {
      if (!myProfile || myProfile.role !== 'admin') {
        router.push('/')
        return
      }
      fetchUsers()
    }
  }, [authLoading, myProfile, router])

  async function fetchUsers() {
    const supabase = createClient()
    const { data } = await supabase.from('profiles').select('*').order('name')
    setUsers(data || [])
    setLoading(false)
    // 전체 Storage 사용량 (photo_optimize.sql의 storage_total_bytes 함수 — 관리자만 값이 나옴)
    const { data: bytes } = await supabase.rpc('storage_total_bytes')
    if (typeof bytes === 'number') setStorageBytes(bytes)
  }

  // 회원 내보내기 — 계정 삭제(로그인 불가). 올린 자료·메시지는 기록으로 남음.
  async function removeUser(u: Profile) {
    if (u.id === myProfile?.id) return
    if (!confirm(`"${u.name}" 님을 내보낼까요?\n\n· 계정이 삭제되어 더 이상 로그인할 수 없어요\n· 지금까지 올린 자료·메시지·작업일지는 그대로 남아요\n· 이 작업은 되돌릴 수 없어요`)) return
    setSaving(u.id)
    const res = await fetch('/api/admin/delete-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: u.id }),
    })
    const data = await res.json()
    setSaving(null)
    if (!res.ok) { alert('내보내기 실패: ' + (data.error || '오류')); return }
    setUsers(us => us.filter(x => x.id !== u.id))
  }

  async function addUser(e: React.FormEvent) {
    e.preventDefault()
    setAdding(true)
    setAddError('')
    // 기본은 초대 메일(직원이 비밀번호를 직접 정함) — 메일이 안 갈 때만 임시 비밀번호 방식
    const url = inviteMode ? '/api/admin/invite-user' : '/api/admin/create-user'
    const body = inviteMode
      ? { name: addForm.name, email: addForm.email, role: addForm.role }
      : addForm
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok) {
      setAddError(data.error || '오류가 발생했습니다')
      setAdding(false)
      return
    }
    if (inviteMode && data.link) {
      // 초대 링크를 바로 복사해 두고, 카톡으로 붙여넣어 보내면 됨
      try { await navigator.clipboard.writeText(data.link); setLinkCopied(true) } catch { setLinkCopied(false) }
      setInviteLink({ name: addForm.name, link: data.link })
    }
    setAddForm(INITIAL_FORM)
    setShowAddForm(false)
    setAdding(false)
    fetchUsers()
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
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">회원 관리</h1>
              <p className="text-sm text-gray-500 mt-0.5">직원 계정 생성 및 권한 설정</p>
            </div>
            <button onClick={() => setShowAddForm(true)}
              className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700">
              + 직원 추가
            </button>
          </div>
        </header>

        <div className="flex-1 px-4 md:px-8 py-6 pb-20 md:pb-24">
          {/* 저장 공간 사용량 — 한도의 80%를 넘으면 경고 */}
          {storageBytes !== null && (() => {
            const LIMIT_GB = 100 // Supabase Pro 플랜 Storage 포함량(100GB). 플랜이 바뀌면 이 숫자만 바꾸면 됨
            const usedGB = storageBytes / 1024 / 1024 / 1024
            const pct = Math.min(100, Math.round((usedGB / LIMIT_GB) * 100))
            const warn = pct >= 80
            return (
              <div className={`rounded-xl border px-4 py-3 mb-4 ${warn ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`text-sm font-semibold ${warn ? 'text-red-700' : 'text-gray-700'}`}>
                    {warn ? '⚠️ ' : '💾 '}저장 공간 {usedGB.toFixed(2)}GB / {LIMIT_GB}GB 사용 중 ({pct}%)
                  </span>
                  {warn && <span className="text-xs text-red-500">공간이 얼마 안 남았어요 — 오래된 자료 정리 또는 플랜 업그레이드 필요</span>}
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${pct >= 95 ? 'bg-red-500' : warn ? 'bg-amber-400' : 'bg-green-500'}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })()}
          {users.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 text-center py-16 text-gray-400">
              <p className="text-3xl mb-2">👥</p>
              <p>등록된 직원이 없습니다</p>
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
                          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${roleInfo?.color || 'bg-amber-100 text-amber-700'}`}>
                            {roleInfo?.label || '승인대기'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1.5 items-center">
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
                            {u.id !== myProfile?.id && (
                              <button disabled={saving === u.id} onClick={() => removeUser(u)}
                                className="text-xs px-2.5 py-1 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 disabled:opacity-40 ml-2">
                                내보내기
                              </button>
                            )}
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
                          {u.id === myProfile?.id && <p className="text-xs text-green-500">나</p>}
                        </div>
                        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${roleInfo?.color || 'bg-amber-100 text-amber-700'}`}>
                          {roleInfo?.label || '승인대기'}
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
                          <button disabled={saving === u.id} onClick={() => removeUser(u)}
                            className="text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 disabled:opacity-40">
                            내보내기
                          </button>
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

      {/* 직원 추가 모달 */}
      {/* 초대 링크 완성 — 복사해서 카톡으로 전달 */}
      {inviteLink && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setInviteLink(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-1">🔗 {inviteLink.name} 님 초대 링크</h2>
            <p className="text-sm text-gray-500 mb-3">
              {linkCopied ? '링크가 복사됐어요! 카톡 등으로 붙여넣어 보내세요.' : '아래 링크를 복사해서 카톡 등으로 보내세요.'}<br />
              직원이 링크를 열면 비밀번호를 직접 정하고 바로 로그인해요.
            </p>
            <div className="flex gap-2 mb-3">
              <input readOnly value={inviteLink.link} onFocus={e => e.currentTarget.select()}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2.5 text-xs text-gray-600 bg-gray-50 focus:outline-none" />
              <button onClick={async () => { try { await navigator.clipboard.writeText(inviteLink.link); setLinkCopied(true) } catch {} }}
                className="bg-green-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-green-700 whitespace-nowrap">
                {linkCopied ? '✓ 복사됨' : '복사'}
              </button>
            </div>
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
              ⏰ 이 링크는 <b>7일간</b> 유효하고 한 번만 쓸 수 있어요. 만료되면 직원 추가에서 다시 초대하면 됩니다.
            </p>
            <button onClick={() => setInviteLink(null)}
              className="w-full py-2.5 rounded-lg bg-gray-100 text-gray-600 text-sm hover:bg-gray-200">닫기</button>
          </div>
        </div>
      )}

      {showAddForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 sticky top-0 bg-white">
              <h2 className="text-lg font-bold">직원 추가</h2>
              <button onClick={() => { setShowAddForm(false); setAddError(''); setAddForm(INITIAL_FORM) }}
                className="text-gray-400 text-2xl">&times;</button>
            </div>
            <form onSubmit={addUser} className="px-6 py-5 flex flex-col gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">이름 *</label>
                <input required value={addForm.name} onChange={e => setAddForm({ ...addForm, name: e.target.value })}
                  placeholder="홍길동"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">
                  이메일 * <span className="text-gray-400 font-normal">(로그인 아이디용 — 메일이 가진 않아요)</span>
                </label>
                <input required type="email" value={addForm.email} onChange={e => setAddForm({ ...addForm, email: e.target.value })}
                  placeholder="직원이 로그인할 때 쓸 이메일 주소"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              {inviteMode ? (
                <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                  🔗 <b>초대 링크</b>가 만들어져요. 링크를 카톡 등으로 직원에게 보내면, 직원이 <b>비밀번호를 직접 정하고</b> 바로 로그인해요. (관리자는 비밀번호를 모름 — 권장)
                </p>
              ) : (
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1.5">임시 비밀번호 *</label>
                  <input required type="text" value={addForm.password} onChange={e => setAddForm({ ...addForm, password: e.target.value })}
                    placeholder="직원에게 알려줄 임시 비밀번호"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
              )}
              <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
                <input type="checkbox" checked={!inviteMode} onChange={e => setInviteMode(!e.target.checked)} className="rounded" />
                초대 링크 대신 임시 비밀번호로 바로 만들기
              </label>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">권한 *</label>
                <div className="grid grid-cols-2 gap-2">
                  {ROLE_OPTIONS.map(r => (
                    <button key={r.value} type="button"
                      onClick={() => setAddForm({ ...addForm, role: r.value })}
                      className={`py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                        addForm.role === r.value
                          ? r.color + ' border-transparent'
                          : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}>
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
              {addError && <p className="text-sm text-red-500 text-center">{addError}</p>}
              <div className="flex gap-3 mt-2">
                <button type="button" onClick={() => { setShowAddForm(false); setAddError(''); setAddForm(INITIAL_FORM) }}
                  className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm font-medium">취소</button>
                <button type="submit" disabled={adding}
                  className="flex-1 bg-green-600 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
                  {adding ? (inviteMode ? '링크 만드는 중...' : '생성 중...') : (inviteMode ? '🔗 초대 링크 만들기' : '계정 생성')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
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
          className="border border-gray-300 rounded px-2 py-1 text-sm w-28 focus:outline-none focus:ring-1 focus:ring-green-500"
          onKeyDown={e => { if (e.key === 'Enter') { onSave(value); setEditing(false) } if (e.key === 'Escape') setEditing(false) }}
          autoFocus />
        <button onClick={() => { onSave(value); setEditing(false) }} className="text-xs text-green-600 hover:underline">저장</button>
        <button onClick={() => setEditing(false)} className="text-xs text-gray-400">취소</button>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium text-gray-800">{user.name}</span>
      {isMe && <span className="text-xs text-green-500 bg-green-50 px-1.5 py-0.5 rounded">나</span>}
      <button onClick={() => setEditing(true)} className="text-xs text-gray-300 hover:text-gray-500">수정</button>
    </div>
  )
}

