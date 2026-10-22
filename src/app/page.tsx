'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Sidebar from '@/components/Sidebar'
import { supabase, Project, ProjectAssignment, Schedule, PhaseStatus, STATUS_COLOR, HIDDEN_STATUSES } from '@/lib/supabase'
import { useAuth, canEdit } from '@/lib/auth-context'
import { toast } from '@/components/Toaster'
import { todayStart, buildRows, parseDate, type Row } from '@/components/ProjectGantt'
import { PhaseQuickModal, AddPhaseModal } from '@/components/DashboardSites'
import WeekCalendar, { type OfficeEvent, type PaymentDue } from '@/components/WeekCalendar'
import OfficeEventModal from '@/components/OfficeEventModal'

const WEEK = ['일', '월', '화', '수', '목', '금', '토']
const BEFORE_STATUSES = ['상담중', '디자인중', '견적중', '계약완료']   // 착공 전

function greeting(name?: string) {
  const h = new Date().getHours()
  const who = name ? `, ${name}님` : ''
  if (h < 11) return `좋은 아침이에요${who}`
  if (h < 17) return `오늘도 힘내세요${who}`
  return `오늘 하루 고생 많으셨어요${who}`
}
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function ProjectCard({ p }: { p: Project }) {
  return (
    <Link href={`/projects/${p.id}`} className="block bg-white border border-gray-200 rounded-xl p-3.5 hover:border-green-400 hover:shadow-sm transition">
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-gray-900 text-sm truncate">{p.name}</p>
        <span className={`text-[11px] px-2 py-0.5 rounded-full border flex-shrink-0 ${STATUS_COLOR[p.status]}`}>{p.status}</span>
      </div>
      <p className="text-xs text-gray-500 mt-1 truncate">{[p.client_name, p.address].filter(Boolean).join(' · ') || '고객·주소 미입력'}</p>
      <p className="text-xs text-gray-400 mt-1">{p.start_date ? p.start_date.replaceAll('-', '.') : '착공일 미정'}{p.manager ? ` · ${p.manager}` : ''}</p>
    </Link>
  )
}

function ProjectColumn({ title, list, more }: { title: string; list: Project[]; more: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 md:p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-bold text-gray-900">{title} <span className="text-gray-400 font-normal text-sm">({list.length})</span></h2>
        <Link href="/projects" className="text-xs text-gray-500 hover:text-green-700">{more} →</Link>
      </div>
      {list.length === 0 ? (
        <p className="text-sm text-gray-300 py-6 text-center">없음</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3 gap-2.5">
          {/* 휴대폰은 4개까지만 — 아래 이번주 일정이 너무 밀리지 않게 */}
          {list.slice(0, 9).map((p, i) => <div key={p.id} className={i >= 4 ? 'hidden sm:block' : ''}><ProjectCard p={p} /></div>)}
        </div>
      )}
      {list.length > 4 && <Link href="/projects" className="sm:hidden block text-center text-xs text-gray-400 mt-3 hover:text-green-700">외 {list.length - 4}곳 더 보기</Link>}
      {list.length > 9 && <Link href="/projects" className="hidden sm:block text-center text-xs text-gray-400 mt-3 hover:text-green-700">외 {list.length - 9}곳 더 보기</Link>}
    </div>
  )
}

export default function Dashboard() {
  const { profile } = useAuth()
  const readOnly = !canEdit(profile)
  const [projects, setProjects] = useState<Project[]>([])
  const [assignments, setAssignments] = useState<ProjectAssignment[]>([])
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [events, setEvents] = useState<OfficeEvent[]>([])
  const [eventsReady, setEventsReady] = useState(true)
  const [payments, setPayments] = useState<PaymentDue[]>([])
  const [loading, setLoading] = useState(true)
  const [addFor, setAddFor] = useState<Project | null>(null)
  const [picked, setPicked] = useState<{ r: Row; p: Project } | null>(null)
  const [eventModal, setEventModal] = useState<{ event: OfficeEvent | null; date: string } | null>(null)
  const [addMenu, setAddMenu] = useState(false)
  const [phasePick, setPhasePick] = useState(false)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [p, a, s, e, pay] = await Promise.all([
      supabase.from('projects').select('*').order('created_at', { ascending: false }),
      supabase.from('project_assignments').select('*'),
      supabase.from('schedules').select('*'),
      supabase.from('office_events').select('*').order('event_date'),
      // 수금은 관리자만 보임(RLS) — 다른 직원은 빈 목록
      supabase.from('payments').select('id,project_name,type,amount,due_date,paid').eq('paid', false).not('due_date', 'is', null),
    ])
    setProjects(p.data || [])
    setAssignments(a.data || [])
    setSchedules(s.data || [])
    // office_events SQL을 아직 안 돌렸으면 표가 없음 → 사무실 일정만 끄고 나머지는 정상 표시
    setEventsReady(!e.error)
    setEvents(e.data || [])
    setPayments(pay.data || [])
    setLoading(false)
  }

  async function fetchEvents() {
    const { data } = await supabase.from('office_events').select('*').order('event_date')
    setEvents(data || [])
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
  const beforeProjects = activeProjects.filter(p => BEFORE_STATUSES.includes(p.status))
  const buildingProjects = activeProjects.filter(p => p.status === '시공중')

  const today = todayStart()

  // 오늘 일정 건수 (현장 공정 + 사무실 일정)
  const onDay = (start?: string | null, end?: string | null) => {
    const s = parseDate(start); if (!s) return false
    const e = parseDate(end) || s
    return s <= today && today <= (e >= s ? e : s)
  }
  const activeIds = new Set(activeProjects.map(p => p.id))
  const todayCount = schedules.filter(s => activeIds.has(s.project_id) && onDay(s.scheduled_date, s.end_date)).length
    + events.filter(e => onDay(e.event_date, e.end_date)).length

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

  const now = new Date()

  return (
    <div className="flex flex-col min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 bg-gray-50">
        <header className="px-4 md:px-8 pt-5 md:pt-7 pb-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg md:text-2xl font-bold text-gray-900 break-keep">{greeting(profile?.name)}</h1>
            <p className="text-xs md:text-sm text-gray-500 mt-1">
              {now.getFullYear()}년 {now.getMonth() + 1}월 {now.getDate()}일 ({WEEK[now.getDay()]})
              {!loading && <> · 오늘 일정 {todayCount}건 · 진행 현장 {buildingProjects.length}곳</>}
            </p>
          </div>
          {!readOnly && (
            <div className="relative flex-shrink-0">
              <button onClick={() => setAddMenu(!addMenu)} className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-xl px-4 py-2.5 shadow-sm">+ 추가</button>
              {addMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setAddMenu(false)} />
                  <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-xl shadow-lg z-50 py-1 text-sm">
                    <button disabled={!eventsReady} onClick={() => { setAddMenu(false); setEventModal({ event: null, date: ymd(today) }) }}
                      className="w-full text-left px-4 py-2.5 hover:bg-gray-50 disabled:text-gray-300">📅 사무실 일정</button>
                    <button onClick={() => { setAddMenu(false); setPhasePick(true) }} className="w-full text-left px-4 py-2.5 hover:bg-gray-50">🔨 현장 공정</button>
                    <Link href="/projects" className="block px-4 py-2.5 hover:bg-gray-50">🏗️ 새 현장</Link>
                  </div>
                </>
              )}
            </div>
          )}
        </header>

        <div className="flex-1 overflow-auto px-4 md:px-8 py-4 pb-24 flex flex-col gap-5 md:gap-6">
          {loading ? (
            <div className="text-center py-20 text-gray-400">불러오는 중...</div>
          ) : (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 md:gap-6">
                <ProjectColumn title="진행중 프로젝트" list={buildingProjects} more={`완료 ${completedProjects.length} · 전체 ${projects.length}`} />
                <ProjectColumn title="착공 전 프로젝트" list={beforeProjects} more="전체" />
              </div>

              <WeekCalendar
                projects={activeProjects}
                schedules={schedules}
                events={events}
                payments={payments}
                eventsReady={eventsReady}
                readOnly={readOnly}
                onPickSchedule={(s, p) => setPicked({ r: buildRows([s], today)[0], p })}
                onPickEvent={ev => setEventModal({ event: ev, date: ev.event_date })}
                onAddEvent={date => setEventModal({ event: null, date })}
              />

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

      {eventModal && (
        <OfficeEventModal event={eventModal.event} date={eventModal.date} projects={activeProjects} who={profile?.name || ''} readOnly={readOnly}
          onClose={() => setEventModal(null)} onSaved={() => { setEventModal(null); fetchEvents() }} />
      )}

      {phasePick && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setPhasePick(false)}>
          <div className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl shadow-xl p-5 max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-gray-900 mb-3">어느 현장에 공정을 넣을까요?</h3>
            <div className="flex flex-col gap-1.5">
              {activeProjects.map(p => (
                <button key={p.id} onClick={() => { setPhasePick(false); setAddFor(p) }}
                  className="flex items-center justify-between text-left px-3 py-2.5 rounded-lg border border-gray-200 hover:border-green-400 text-sm">
                  <span className="truncate">{p.name}</span>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full border ${STATUS_COLOR[p.status]}`}>{p.status}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
