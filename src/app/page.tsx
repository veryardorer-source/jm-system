'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Sidebar from '@/components/Sidebar'
import { supabase, Project, ProjectAssignment, Schedule, STATUS_COLOR, STATUS_GROUPS } from '@/lib/supabase'

type ViewMode = 'card' | 'timeline'

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([])
  const [assignments, setAssignments] = useState<ProjectAssignment[]>([])
  const [schedules, setSchedules] = useState<Schedule[]>([])
const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('timeline')

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [p, a, s] = await Promise.all([
      supabase.from('projects').select('*').order('created_at', { ascending: false }),
      supabase.from('project_assignments').select('*'),
      supabase.from('schedules').select('*'),
    ])
    setProjects(p.data || [])
    setAssignments(a.data || [])
    setSchedules(s.data || [])
    setLoading(false)
  }

  const activeProjects = projects.filter(p => p.status !== '완료')
  const completedProjects = projects.filter(p => p.status === '완료')

  // 직원별 업무 정리
  const employeeMap: Record<string, { project: Project; task: string; role: string; phaseStatus?: string }[]> = {}

  // project_assignments 에서
  assignments.forEach(a => {
    const project = projects.find(p => p.id === a.project_id)
    if (!project || project.status === '완료') return
    if (!employeeMap[a.employee_name]) employeeMap[a.employee_name] = []
    employeeMap[a.employee_name].push({ project, task: a.task, role: a.role })
  })

  // 현장 담당자
  activeProjects.forEach(p => {
    if (!p.manager) return
    if (!employeeMap[p.manager]) employeeMap[p.manager] = []
    const already = employeeMap[p.manager].some(e => e.project.id === p.id && e.role === '담당')
    if (!already) employeeMap[p.manager].push({ project: p, task: p.status, role: '담당' })
  })

  // 공정 담당자 (완료 제외)
  schedules.forEach(s => {
    if (!s.manager) return
    if ((s.phase_status || '예정') === '완료') return
    const project = projects.find(p => p.id === s.project_id)
    if (!project || project.status === '완료') return
    if (!employeeMap[s.manager]) employeeMap[s.manager] = []
    const already = employeeMap[s.manager].some(e => e.project.id === project.id && e.task === s.task_name)
    if (!already) employeeMap[s.manager].push({ project, task: s.task_name, role: '공정', phaseStatus: s.phase_status || '예정' })
  })

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b border-gray-200 px-8 py-5 flex-shrink-0">
          <h1 className="text-xl font-bold text-gray-900">대시보드</h1>
          <p className="text-sm text-gray-500 mt-0.5">진행중인 현장과 직원 업무 현황</p>
        </header>

        <div className="flex-1 overflow-auto px-8 py-6">
          {loading ? (
            <div className="text-center py-20 text-gray-400">불러오는 중...</div>
          ) : (
            <>
              {/* 요약 */}
              <div className="grid grid-cols-3 gap-4 mb-8">
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <p className="text-sm text-gray-500">전체 현장</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">{projects.length}</p>
                </div>
                <div className="bg-white rounded-xl border border-blue-200 p-5">
                  <p className="text-sm text-blue-500">진행중</p>
                  <p className="text-3xl font-bold text-blue-600 mt-1">{activeProjects.length}</p>
                </div>
                <div className="bg-white rounded-xl border border-green-200 p-5">
                  <p className="text-sm text-green-500">완료</p>
                  <p className="text-3xl font-bold text-green-600 mt-1">{completedProjects.length}</p>
                </div>
              </div>

              {/* 진행중인 현장 */}
              <div className="mb-8">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-bold text-gray-800">진행중인 현장</h2>
                  <div className="flex items-center gap-3">
                    <div className="flex bg-gray-100 rounded-lg p-1">
                      <button onClick={() => setViewMode('timeline')}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${viewMode === 'timeline' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}>
                        📅 타임라인
                      </button>
                      <button onClick={() => setViewMode('card')}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${viewMode === 'card' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}>
                        🗂 카드
                      </button>
                    </div>
                    <Link href="/projects" className="text-sm text-blue-600 hover:underline">전체보기 →</Link>
                  </div>
                </div>

                {activeProjects.length === 0 ? (
                  <div className="bg-white rounded-xl border border-gray-200 text-center py-12 text-gray-400">
                    <p className="text-3xl mb-2">🏗️</p>
                    <p>진행중인 현장이 없어요</p>
                    <Link href="/projects" className="text-blue-600 text-sm mt-2 inline-block">현장 등록하기 →</Link>
                  </div>
                ) : viewMode === 'timeline' ? (
                  <TimelineView projects={activeProjects} schedules={schedules} onRefresh={fetchAll} />
                ) : (
                  <div className="grid grid-cols-1 gap-3">
                    {STATUS_GROUPS.filter(g => g.label !== '완료').map(group => {
                      const groupProjects = activeProjects.filter(p => group.statuses.includes(p.status))
                      if (groupProjects.length === 0) return null
                      return (
                        <div key={group.label}>
                          <p className="text-xs font-semibold text-gray-400 uppercase mb-2">{group.label} 단계</p>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
                            {groupProjects.map(p => (
                              <Link key={p.id} href={`/projects/${p.id}`}>
                                <div className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md hover:border-blue-300 transition-all cursor-pointer">
                                  <div className="flex items-start justify-between gap-2 mb-3">
                                    <div className="flex-1 min-w-0">
                                      <p className="font-semibold text-gray-900 truncate">{p.name}</p>
                                      {p.client_name && <p className="text-xs text-gray-400 mt-0.5">{p.client_name}</p>}
                                    </div>
                                    <span className={`text-xs px-2 py-1 rounded-full font-medium border flex-shrink-0 ${STATUS_COLOR[p.status]}`}>
                                      {p.status}
                                    </span>
                                  </div>
                                  <ProgressBar status={p.status} />
                                  {p.end_date && <p className="text-xs text-gray-400 mt-2 text-right">~{p.end_date}</p>}
                                </div>
                              </Link>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* 직원별 업무 현황 */}
              <div>
                <h2 className="text-base font-bold text-gray-800 mb-4">직원별 업무 현황</h2>
                {Object.keys(employeeMap).length === 0 ? (
                  <div className="bg-white rounded-xl border border-gray-200 text-center py-12 text-gray-400">
                    <p className="text-3xl mb-2">👥</p>
                    <p>담당자가 배정된 현장이 없어요</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Object.entries(employeeMap).map(([name, tasks]) => (
                      <div key={name} className="bg-white rounded-xl border border-gray-200 p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-semibold text-sm">
                            {name[0]}
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900 text-sm">{name}</p>
                            <p className="text-xs text-gray-400">{tasks.length}개 현장</p>
                          </div>
                        </div>
                        <div className="flex flex-col gap-2">
                          {tasks.map(({ project, task, role, phaseStatus }, i) => (
                            <Link key={`${project.id}-${i}`} href={`/projects/${project.id}`}>
                              <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 hover:bg-blue-50 transition-colors">
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium text-gray-700 truncate">{project.name}</p>
                                  <p className="text-xs text-gray-400">{task}</p>
                                </div>
                                <div className="flex flex-col items-end gap-1 ml-2 flex-shrink-0">
                                  {role === '공정' && phaseStatus ? (
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${
                                      phaseStatus === '진행중' ? 'bg-blue-100 text-blue-700 border-blue-300' :
                                      phaseStatus === '완료' ? 'bg-green-100 text-green-700 border-green-300' :
                                      'bg-gray-100 text-gray-600 border-gray-200'
                                    }`}>{phaseStatus}</span>
                                  ) : (
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${STATUS_COLOR[project.status]}`}>
                                      {project.status}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </Link>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// 공정 진행바 컴포넌트
const ALL_STATUSES = [
  '상담중','현장실측','디자인중','디자인확정',
  '견적작성중','견적확정','계약완료',
  '시공준비','철거','목공','전기/설비','타일',
  '도배/마루','가구/조명','입주청소','완료'
]

// 상태별 색상
const PHASE_STATUS_COLOR: Record<string, string> = {
  '예정':   '#93c5fd', // blue-300
  '진행중': '#3b82f6', // blue-500
  '완료':   '#86efac', // green-300
}

function TimelineView({ projects, schedules, onRefresh }: {
  projects: Project[]
  schedules: Schedule[]
  onRefresh: () => void
}) {
  const today = new Date(); today.setHours(0,0,0,0)
  // 기본 표시 범위: 오늘 -2주 ~ +6주 (약 2개월), 스크롤로 전체 공정 확인 가능
  const rangeStart = new Date(today.getTime() - 14 * 86400000)
  const rangeEnd   = new Date(today.getTime() + 42 * 86400000)
  const totalDays  = Math.ceil((rangeEnd.getTime() - rangeStart.getTime()) / 86400000)

  const [showAddForm, setShowAddForm] = useState<string | null>(null) // project_id
  const [addForm, setAddForm] = useState({ task_name: '', scheduled_date: '', end_date: '' })
  const [saving, setSaving] = useState(false)
  const [statusPicker, setStatusPicker] = useState<string | null>(null) // schedule id

  // 월 헤더
  const months: { label: string; days: number }[] = []
  let cur = new Date(rangeStart)
  while (cur < rangeEnd) {
    const monthEnd = new Date(cur.getFullYear(), cur.getMonth() + 1, 0)
    const startDay = Math.max(0, Math.ceil((new Date(cur.getFullYear(), cur.getMonth(), 1).getTime() - rangeStart.getTime()) / 86400000))
    const endDay   = Math.min(totalDays, Math.ceil((monthEnd.getTime() - rangeStart.getTime()) / 86400000))
    months.push({ label: `${cur.getMonth() + 1}월`, days: endDay - startDay })
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1)
  }

  const todayPct = (Math.ceil((today.getTime() - rangeStart.getTime()) / 86400000) / totalDays) * 100

  function pct(dateStr: string) {
    const d = new Date(dateStr); d.setHours(0,0,0,0)
    return (Math.ceil((d.getTime() - rangeStart.getTime()) / 86400000) / totalDays) * 100
  }

  async function handleAddPhase(e: React.FormEvent) {
    e.preventDefault()
    if (!showAddForm || !addForm.scheduled_date) return
    setSaving(true)
    await supabase.from('schedules').insert([{
      project_id: showAddForm,
      task_name: addForm.task_name,
      scheduled_date: addForm.scheduled_date,
      end_date: addForm.end_date || null,
    }])
    setSaving(false)
    setShowAddForm(null)
    setAddForm({ task_name: '', scheduled_date: '', end_date: '' })
    onRefresh()
  }

  async function deletePhase(id: string) {
    await supabase.from('schedules').delete().eq('id', id)
    onRefresh()
  }

  async function updatePhaseStatus(id: string, status: '예정' | '진행중' | '완료') {
    await supabase.from('schedules').update({ phase_status: status, is_done: status === '완료' }).eq('id', id)
    setStatusPicker(null)
    onRefresh()
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden" onClick={() => setStatusPicker(null)}>
      {/* 범례 */}
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-4 flex-wrap">
        {[
          { label: '예정', color: PHASE_STATUS_COLOR['예정'], textColor: '#1d4ed8' },
          { label: '진행중', color: PHASE_STATUS_COLOR['진행중'], textColor: '#fff', border: '#2563eb' },
          { label: '완료', color: PHASE_STATUS_COLOR['완료'], textColor: '#166534' },
        ].map(item => (
          <div key={item.label} className="flex items-center gap-1.5">
            <div className="w-8 h-4 rounded-full border" style={{ backgroundColor: item.color, borderColor: item.border || 'transparent' }} />
            <span className="text-xs text-gray-500">{item.label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 ml-2">
          <div className="w-px h-4 bg-red-400" />
          <span className="text-xs text-gray-500">오늘</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div style={{ minWidth: totalDays * 18 }}>
          {/* 월 헤더 */}
          <div className="flex border-b border-gray-100 bg-gray-50">
            <div className="w-48 flex-shrink-0 px-4 py-2 text-xs font-semibold text-gray-400 border-r border-gray-100">현장명</div>
            <div className="flex-1 flex">
              {months.map(m => (
                <div key={m.label} className="border-r border-gray-100 px-2 py-2 text-xs font-semibold text-gray-500 text-center"
                  style={{ width: `${(m.days / totalDays) * 100}%` }}>{m.label}</div>
              ))}
            </div>
          </div>
          {/* 날짜 행 */}
          <div className="flex border-b border-gray-200 bg-gray-50/50">
            <div className="w-48 flex-shrink-0 border-r border-gray-100" />
            <div className="flex-1 relative flex">
              {Array.from({ length: totalDays }).map((_, i) => {
                const d = new Date(rangeStart.getTime() + i * 86400000)
                const day = d.getDate()
                const isToday = d.toDateString() === today.toDateString()
                const isSun = d.getDay() === 0
                return (
                  <div key={i} className="flex-shrink-0 flex flex-col items-center justify-center border-r border-gray-100 relative"
                    style={{ width: `${(1 / totalDays) * 100}%`, height: 28 }}>
                    {isToday && <div className="absolute inset-0 bg-red-50" />}
                    <span className="relative text-center select-none leading-none"
                      style={{ fontSize: 8, color: isToday ? '#ef4444' : isSun ? '#f87171' : '#9ca3af', fontWeight: isToday ? 700 : 400 }}>
                      {day === 1 ? `${d.getMonth()+1}/1` : day}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {projects.map(p => {
            const projectSchedules = schedules.filter(s => s.project_id === p.id && s.scheduled_date)
            return (
              <div key={p.id} className="border-b border-gray-100">
                {/* 현장명 행 */}
                <div className="flex" style={{ minHeight: 40 }}>
                  <div className="w-48 flex-shrink-0 px-4 flex items-center justify-between border-r border-gray-100 gap-1">
                    <Link href={`/projects/${p.id}`}
                      className="text-xs font-semibold text-gray-800 hover:text-blue-600 truncate flex-1">{p.name}</Link>
                    <button onClick={() => { setShowAddForm(p.id); setAddForm({ task_name: '', scheduled_date: '', end_date: '' }) }}
                      className="text-gray-300 hover:text-blue-500 text-base flex-shrink-0" title="공정 추가">+</button>
                  </div>
                  <div className="flex-1 relative" style={{ minHeight: 40 }}>
                    <div className="absolute top-0 bottom-0 w-px bg-red-300 z-10" style={{ left: `${todayPct}%` }} />
                    {projectSchedules.length === 0 && (
                      <div className="flex items-center h-full px-3">
                        <span className="text-xs text-gray-300">+ 버튼으로 공정 추가</span>
                      </div>
                    )}
                    {projectSchedules.map(s => {
                      const left = Math.max(0, Math.min(100, pct(s.scheduled_date)))
                      const right = s.end_date ? Math.max(0, Math.min(100, pct(s.end_date))) : left + 4
                      const width = Math.max(right - left, 2)
                      const ps = s.phase_status || '예정'
                      const color = PHASE_STATUS_COLOR[ps]
                      const textColor = ps === '완료' ? '#166534' : ps === '진행중' ? '#fff' : '#1d4ed8'
                      return (
                        <div key={s.id} className="absolute group"
                          style={{ left: `${left}%`, width: `${width}%`, top: 6, height: 28, zIndex: statusPicker === s.id ? 30 : 1 }}>
                          {/* 바 */}
                          <div onClick={e => { e.stopPropagation(); setStatusPicker(statusPicker === s.id ? null : s.id) }}
                            className="w-full h-6 rounded-full flex items-center px-2 overflow-hidden border cursor-pointer hover:opacity-90"
                            style={{ backgroundColor: color, borderColor: ps === '진행중' ? '#2563eb' : 'transparent' }}>
                            <span className="text-xs font-medium truncate" style={{ fontSize: 10, color: textColor }}>
                              {s.task_name}
                            </span>
                          </div>
                          {/* 삭제 버튼 */}
                          <button onClick={e => { e.stopPropagation(); deletePhase(s.id) }}
                            className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-xs hidden group-hover:flex items-center justify-center leading-none">×</button>
                          {/* 상태 선택 팝업 */}
                          {statusPicker === s.id && (
                            <div className="absolute top-7 left-0 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden"
                              style={{ minWidth: 100 }}>
                              {(['예정', '진행중', '완료'] as const).map(st => (
                                <button key={st} onClick={e => { e.stopPropagation(); updatePhaseStatus(s.id, st) }}
                                  className={`w-full text-left px-3 py-2 text-xs font-medium hover:bg-gray-50 flex items-center gap-2 ${ps === st ? 'font-bold' : ''}`}>
                                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: PHASE_STATUS_COLOR[st] }} />
                                  {st}
                                  {ps === st && <span className="ml-auto text-blue-500">✓</span>}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 공정 추가 모달 */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-bold">공정 추가</h2>
              <button onClick={() => setShowAddForm(null)} className="text-gray-400 text-2xl">&times;</button>
            </div>
            <form onSubmit={handleAddPhase} className="px-6 py-5 flex flex-col gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">공정명 *</label>
                <input required value={addForm.task_name}
                  onChange={e => setAddForm({...addForm, task_name: e.target.value})}
                  placeholder="예) 목공, 타일, 도배, 입주청소..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1.5">시작일 *</label>
                  <input required type="date" value={addForm.scheduled_date}
                    onChange={e => setAddForm({...addForm, scheduled_date: e.target.value})}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1.5">종료일</label>
                  <input type="date" value={addForm.end_date}
                    onChange={e => setAddForm({...addForm, end_date: e.target.value})}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowAddForm(null)}
                  className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm">취소</button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
                  {saving ? '저장 중...' : '추가'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function ProgressBar({ status }: { status: string }) {
  const currentIndex = ALL_STATUSES.indexOf(status)
  const progress = Math.round(((currentIndex + 1) / ALL_STATUSES.length) * 100)

  const color =
    currentIndex <= 3 ? 'bg-purple-400' :
    currentIndex <= 6 ? 'bg-yellow-400' :
    currentIndex === 15 ? 'bg-green-400' :
    'bg-blue-400'

  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <p className="text-xs text-gray-400">공정 진행률</p>
        <p className="text-xs font-medium text-gray-600">{progress}%</p>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-1.5">
        <div className={`h-1.5 rounded-full transition-all ${color}`} style={{ width: `${progress}%` }} />
      </div>
    </div>
  )
}
