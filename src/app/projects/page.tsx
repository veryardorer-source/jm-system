'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Sidebar from '@/components/Sidebar'
import { supabase, Project, STATUS_LIST, STATUS_COLOR, HIDDEN_STATUSES } from '@/lib/supabase'
import { useAuth, canEdit } from '@/lib/auth-context'
import { notifyOthers } from '@/lib/notify'

const EMPTY_FORM = {
  name: '', client_name: '', address: '', manager: '',
  status: '상담중' as Project['status'],
  start_date: '', end_date: '', memo: ''
}

export default function ProjectsPage() {
  const { profile } = useAuth()
  const readOnly = !canEdit(profile)
  const [projects, setProjects] = useState<Project[]>([])
  const [filter, setFilter] = useState('전체')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [editingStatusId, setEditingStatusId] = useState<string | null>(null)
  const [showClosed, setShowClosed] = useState(false)

  useEffect(() => { fetchProjects() }, [])

  async function fetchProjects() {
    setLoading(true)
    const { data, error } = await supabase.from('projects').select('*').order('created_at', { ascending: false })
    if (error) console.error(error)
    setProjects(data || [])
    setLoading(false)
  }

  async function updateStatus(id: string, status: Project['status']) {
    await supabase.from('projects').update({ status }).eq('id', id)
    setEditingStatusId(null)
    fetchProjects()
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const payload = {
      ...form,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
    }
    const { error } = await supabase.from('projects').insert([payload])
    if (error) { setError(error.message); setSaving(false); return }
    notifyOthers(profile?.id, { type: 'project', title: `새 현장 등록 · ${form.name}`, body: [form.client_name, form.address].filter(Boolean).join(' · '), link: '/projects' })
    setForm(EMPTY_FORM)
    setShowForm(false)
    setSaving(false)
    fetchProjects()
  }

  const visibleProjects = showClosed
    ? projects
    : projects.filter(p => !HIDDEN_STATUSES.includes(p.status as typeof HIDDEN_STATUSES[number]))

  const filtered = visibleProjects
    .filter(p => filter === '전체' || p.status === filter)
    .filter(p => !search || p.name.includes(search) || p.client_name?.includes(search) || p.manager?.includes(search))

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <header className="bg-white border-b border-gray-200 px-4 md:px-8 py-4 md:py-5 flex items-center justify-between flex-shrink-0">
          <div>
            <h1 className="text-xl font-bold text-gray-900">현장 관리</h1>
            <p className="text-sm text-gray-500 mt-0.5">총 {projects.length}개 현장 · 진행중 {projects.filter(p => !HIDDEN_STATUSES.includes(p.status as typeof HIDDEN_STATUSES[number])).length}개</p>
          </div>
          {!readOnly && (
            <button onClick={() => setShowForm(true)}
              className="bg-green-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-green-700">
              + 현장 등록
            </button>
          )}
        </header>

        <div className="flex-1 overflow-auto">
          {/* 필터 바 */}
          <div className="bg-white border-b border-gray-200 px-4 md:px-8 py-3 flex items-center gap-4 flex-shrink-0 overflow-x-auto">
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="현장명, 고객명, 담당자 검색..."
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-green-500" />
            <div className="flex gap-1 overflow-x-auto">
              <button onClick={() => setFilter('전체')}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${filter === '전체' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                전체 ({visibleProjects.length})
              </button>
              {STATUS_LIST.filter(s => showClosed || !HIDDEN_STATUSES.includes(s as typeof HIDDEN_STATUSES[number])).map(s => {
                const count = visibleProjects.filter(p => p.status === s).length
                if (count === 0) return null
                return (
                  <button key={s} onClick={() => setFilter(s)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-colors ${
                      filter === s ? STATUS_COLOR[s] : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                    }`}>
                    {s} ({count})
                  </button>
                )
              })}
            </div>
            <button onClick={() => { setShowClosed(v => !v); setFilter('전체') }}
              className={`ml-auto flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-colors ${
                showClosed ? 'bg-gray-700 text-white border-gray-700' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
              }`}>
              {showClosed ? '☑' : '☐'} 완료·중단 현장 보기
            </button>
          </div>

          <div className="px-4 md:px-8 py-4 md:py-6 pb-20 md:pb-6">
            {loading ? (
              <div className="text-center py-16 text-gray-400">불러오는 중...</div>
            ) : filtered.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 text-center py-16 text-gray-400">
                <p className="text-4xl mb-3">🏗️</p>
                <p className="font-medium">현장이 없어요</p>
              </div>
            ) : (
              <>
                {/* 모바일: 카드형 */}
                <div className="md:hidden flex flex-col gap-3">
                  {filtered.map(p => (
                    <div key={p.id} className="bg-white rounded-xl border border-gray-200 p-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <Link href={`/projects/${p.id}`} className="font-semibold text-gray-900 flex-1">{p.name}</Link>
                        {readOnly ? (
                          <span className={`flex-shrink-0 text-xs px-2 py-1 rounded-full font-medium border ${STATUS_COLOR[p.status]}`}>{p.status}</span>
                        ) : (
                          <button onClick={e => { e.stopPropagation(); e.preventDefault(); setEditingStatusId(p.id) }}
                            className={`flex-shrink-0 text-xs px-2 py-1 rounded-full font-medium border ${STATUS_COLOR[p.status]}`}>
                            {p.status} ▾
                          </button>
                        )}
                      </div>
                      <Link href={`/projects/${p.id}`} className="block">
                        <div className="flex items-center gap-3 text-xs text-gray-500">
                          {p.client_name && <span>{p.client_name}</span>}
                          {p.manager && <span>· {p.manager}</span>}
                          {p.end_date && <span>· ~{p.end_date}</span>}
                        </div>
                      </Link>
                    </div>
                  ))}
                </div>
                {/* 데스크탑: 테이블형 */}
                <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="text-left text-xs font-semibold text-gray-400 px-6 py-3">현장명</th>
                        <th className="text-left text-xs font-semibold text-gray-400 px-4 py-3">고객명</th>
                        <th className="text-left text-xs font-semibold text-gray-400 px-4 py-3">담당자</th>
                        <th className="text-left text-xs font-semibold text-gray-400 px-4 py-3">진행단계</th>
                        <th className="text-left text-xs font-semibold text-gray-400 px-4 py-3">시공일정</th>
                        <th className="text-left text-xs font-semibold text-gray-400 px-4 py-3">등록일</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((p, i) => (
                        <tr key={p.id} className={`border-b border-gray-50 hover:bg-green-50 cursor-pointer transition-colors ${i % 2 === 1 ? 'bg-gray-50/30' : ''}`}>
                          <td className="px-6 py-3.5">
                            <Link href={`/projects/${p.id}`} className="block">
                              <p className="font-semibold text-gray-900 hover:text-green-600">{p.name}</p>
                              {p.address && <p className="text-xs text-gray-400 mt-0.5 truncate max-w-48">{p.address}</p>}
                            </Link>
                          </td>
                          <td className="px-4 py-3.5 text-sm text-gray-600">{p.client_name || '-'}</td>
                          <td className="px-4 py-3.5 text-sm text-gray-600">{p.manager || '-'}</td>
                          <td className="px-4 py-3.5">
                            {readOnly ? (
                              <span className={`text-xs px-2.5 py-1 rounded-full font-medium border ${STATUS_COLOR[p.status]}`}>{p.status}</span>
                            ) : (
                              <button onClick={e => { e.stopPropagation(); e.preventDefault(); setEditingStatusId(p.id) }}
                                className={`text-xs px-2.5 py-1 rounded-full font-medium border hover:opacity-80 transition-opacity ${STATUS_COLOR[p.status]}`}>
                                {p.status} ▾
                              </button>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-sm text-gray-500">
                            {p.start_date && p.end_date ? `${p.start_date} ~ ${p.end_date}` : p.start_date ? `${p.start_date} ~` : '-'}
                          </td>
                          <td className="px-4 py-3.5 text-sm text-gray-400">
                            {new Date(p.created_at).toLocaleDateString('ko-KR')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 진행단계 변경 팝업 */}
      {editingStatusId && (() => {
        const ep = projects.find(p => p.id === editingStatusId)
        return (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setEditingStatusId(null)}>
            <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl" onClick={e => e.stopPropagation()}>
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-gray-900">진행단계 변경</h2>
                  {ep && <p className="text-xs text-gray-500 mt-0.5">{ep.name}</p>}
                </div>
                <button onClick={() => setEditingStatusId(null)} className="text-gray-400 text-2xl leading-none">&times;</button>
              </div>
              <div className="p-3 grid grid-cols-2 gap-2 max-h-[70vh] overflow-y-auto">
                {STATUS_LIST.map(s => (
                  <button key={s} onClick={() => updateStatus(editingStatusId, s as Project['status'])}
                    className={`px-3 py-2.5 rounded-lg text-sm border text-center transition-colors ${
                      ep?.status === s ? 'border-green-500 bg-green-50 text-green-700 font-bold' : 'border-gray-200 text-gray-700 hover:border-green-400 hover:bg-green-50'
                    }`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )
      })()}

      {/* 현장 등록 모달 */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 sticky top-0 bg-white">
              <h2 className="text-lg font-bold text-gray-900">새 현장 등록</h2>
              <button onClick={() => { setShowForm(false); setError('') }} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleCreate} className="px-6 py-5 flex flex-col gap-4">
              {error && <p className="text-red-500 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">현장명 <span className="text-red-500">*</span></label>
                <input required value={form.name} onChange={e => setForm({...form, name: e.target.value})}
                  placeholder="예) 강남구 OO아파트 101호"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1.5">고객명</label>
                  <input value={form.client_name} onChange={e => setForm({...form, client_name: e.target.value})}
                    placeholder="홍길동"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1.5">담당자</label>
                  <input value={form.manager} onChange={e => setForm({...form, manager: e.target.value})}
                    placeholder="김팀장"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">주소</label>
                <input value={form.address} onChange={e => setForm({...form, address: e.target.value})}
                  placeholder="서울시 강남구 ..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">현재 단계</label>
                <select value={form.status} onChange={e => setForm({...form, status: e.target.value as Project['status']})}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                  {STATUS_LIST.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1.5">시작일</label>
                  <input type="date" value={form.start_date} onChange={e => setForm({...form, start_date: e.target.value})}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1.5">완료 예정일</label>
                  <input type="date" value={form.end_date} onChange={e => setForm({...form, end_date: e.target.value})}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">메모</label>
                <textarea value={form.memo} onChange={e => setForm({...form, memo: e.target.value})}
                  placeholder="특이사항 등"
                  rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none" />
              </div>
              <div className="flex gap-3 mt-2">
                <button type="button" onClick={() => { setShowForm(false); setError('') }}
                  className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50">취소</button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-green-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                  {saving ? '저장 중...' : '등록'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

