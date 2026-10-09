'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Sidebar from '@/components/Sidebar'
import { supabase, Project, ProjectAssignment, Schedule, PhaseStatus, STATUS_COLOR, HIDDEN_STATUSES } from '@/lib/supabase'
import { useAuth, canEdit } from '@/lib/auth-context'
import { toast } from '@/components/Toaster'
import { todayStart, type Row } from '@/components/ProjectGantt'
import { STAGES, type Filter, summarize, StatusBoard, PhaseQuickModal, AddPhaseModal } from '@/components/DashboardSites'

export default function Dashboard() {
  const { profile } = useAuth()
  const readOnly = !canEdit(profile)
  const [projects, setProjects] = useState<Project[]>([])
  const [assignments, setAssignments] = useState<ProjectAssignment[]>([])
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [addFor, setAddFor] = useState<Project | null>(null)
  const [picked, setPicked] = useState<{ r: Row; p: Project } | null>(null)

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

  // 공정 상태 바로 변경 — 화면 먼저 바꾸고 저장 (실패하면 되돌림)
  async function changeStatus(s: Schedule, status: PhaseStatus) {
    setSchedules(prev => prev.map(x => x.id === s.id ? { ...x, phase_status: status, is_done: status === '완료' } : x))
    const { error } = await supabase.from('schedules').update({ phase_status: status, is_done: status === '완료' }).eq('id', s.id)
    if (error) {
      setSchedules(prev => prev.map(x => x.id === s.id ? s : x))
      toast('상태 변경 실패: ' + error.message)
    } else toast(`${s.task_name} → ${status}`)
  }

  const activeProjects = projects.filter(p => !HIDDEN_STATUSES.includes(p.status as typeof HIDDEN_STATUSES[number]))
  const completedProjects = projects.filter(p => p.status === '완료')

  // 현황판 순서: 지연 → 오늘 작업 있는 현장 → 단계가 많이 진행된 현장
  const today = todayStart()
  const infos = activeProjects.map(p => summarize(p, schedules, today)).sort((a, b) =>
    (+(b.kind === 'late') - +(a.kind === 'late')) ||
    (+(b.now.length > 0) - +(a.now.length > 0)) ||
    (STAGES.indexOf(b.p.status) - STAGES.indexOf(a.p.status)) ||
    a.p.name.localeCompare(b.p.name, 'ko'))
  const counts = {
    all: infos.length,
    now: infos.filter(i => i.now.length).length,
    late: infos.filter(i => i.kind === 'late').length,
    stale: infos.filter(i => i.kind === 'stale').length,
    empty: infos.filter(i => i.kind === 'empty').length,
  }
  const shown = infos.filter(i => filter === 'all' ? true : filter === 'now' ? i.now.length > 0 : i.kind === filter)

  // 직원별 업무 정리
  const employeeMap: Record<string, { project: Project; task: string; role: string; phaseStatus?: string }[]> = {}

  // project_assignments 에서
  assignments.forEach(a => {
    const project = projects.find(p => p.id === a.project_id)
    if (!project || HIDDEN_STATUSES.includes(project.status as typeof HIDDEN_STATUSES[number])) return
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

  const FILTERS: { key: Filter; label: string; on: string }[] = [
    { key: 'all', label: '진행중', on: 'bg-green-600 text-white border-green-600' },
    { key: 'now', label: '오늘 작업', on: 'bg-green-600 text-white border-green-600' },
    { key: 'late', label: '지연', on: 'bg-red-500 text-white border-red-500' },
    { key: 'stale', label: '공정 갱신 필요', on: 'bg-amber-500 text-white border-amber-500' },
    { key: 'empty', label: '공정 미등록', on: 'bg-gray-600 text-white border-gray-600' },
  ]

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-gray-200 px-8 py-5 flex-shrink-0">
          <h1 className="text-xl font-bold text-gray-900">대시보드</h1>
          <p className="text-sm text-gray-500 mt-0.5">진행중인 현장과 직원 업무 현황</p>
        </header>

        <div className="flex-1 overflow-auto px-4 md:px-8 py-4 md:py-6 pb-20 md:pb-24">
          {loading ? (
            <div className="text-center py-20 text-gray-400">불러오는 중...</div>
          ) : (
            <>
              {/* 진행중인 현장 — 현황판 */}
              <div className="mb-8">
                <div className="flex items-center justify-between mb-3 gap-2">
                  <h2 className="text-base font-bold text-gray-800">진행중인 현장</h2>
                  <Link href="/projects" className="text-sm text-green-600 hover:underline flex-shrink-0">
                    완료 {completedProjects.length} · 전체 {projects.length} →
                  </Link>
                </div>

                {/* 필터 (개수 0인 항목은 숨김) */}
                <div className="flex gap-2 flex-wrap mb-3">
                  {FILTERS.filter(f => f.key === 'all' || counts[f.key] > 0).map(f => (
                    <button key={f.key} onClick={() => setFilter(filter === f.key ? 'all' : f.key)}
                      className={`text-sm px-3 py-1.5 rounded-full border font-medium transition-colors ${filter === f.key ? f.on : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                      {f.label} <span className="ml-0.5">{counts[f.key]}</span>
                    </button>
                  ))}
                </div>

                {activeProjects.length === 0 ? (
                  <div className="bg-white rounded-xl border border-gray-200 text-center py-12 text-gray-400">
                    <p className="text-3xl mb-2">🏗️</p>
                    <p>진행중인 현장이 없어요</p>
                    <Link href="/projects" className="text-green-600 text-sm mt-2 inline-block">현장 등록하기 →</Link>
                  </div>
                ) : (
                  <StatusBoard infos={shown} today={today} readOnly={readOnly} onAdd={setAddFor} onPick={(r, p) => setPicked({ r, p })} />
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
                          <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center text-green-600 font-semibold text-sm">
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
                              <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 hover:bg-green-50 transition-colors">
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium text-gray-700 truncate">{project.name}</p>
                                  <p className="text-xs text-gray-400">{task}</p>
                                </div>
                                <div className="flex flex-col items-end gap-1 ml-2 flex-shrink-0">
                                  {role === '공정' && phaseStatus ? (
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${
                                      phaseStatus === '진행중' ? 'bg-green-100 text-green-700 border-green-300' :
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

      {picked && (
        <PhaseQuickModal r={picked.r} p={picked.p} readOnly={readOnly} onStatus={changeStatus} onClose={() => setPicked(null)} />
      )}

      {addFor && (
        <AddPhaseModal project={addFor} onClose={() => setAddFor(null)} onSaved={() => { setAddFor(null); fetchAll() }} />
      )}
    </div>
  )
}

