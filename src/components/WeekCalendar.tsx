'use client'

// 대시보드 '이번주 일정' — 위 칸은 현장 공정, 아래 칸은 사무실 일정(상담·방문·연차)·수금 예정.
// 공정의 초록 체크 = 업체 확정(vendor_booked). 현장마다 색이 달라 어느 현장 공정인지 한눈에 구분.
import { useState } from 'react'
import Link from 'next/link'
import type { Project, Schedule } from '@/lib/supabase'
import { parseDate, todayStart, md } from '@/components/ProjectGantt'

export type OfficeEvent = {
  id: string
  title: string
  kind: string
  event_date: string
  end_date: string | null
  person: string | null
  project_id: string | null
  created_by: string | null
  created_at: string
}

export type PaymentDue = { id: string; project_name: string; type: string; amount: number; due_date: string | null; paid: boolean }

// Tailwind가 클래스를 찾을 수 있게 전부 문자열 그대로 적는다
const SITE_COLORS = [
  'bg-rose-100 text-rose-900', 'bg-amber-100 text-amber-900', 'bg-sky-100 text-sky-900', 'bg-emerald-100 text-emerald-900',
  'bg-violet-100 text-violet-900', 'bg-orange-100 text-orange-900', 'bg-teal-100 text-teal-900', 'bg-pink-100 text-pink-900',
  'bg-lime-100 text-lime-900', 'bg-indigo-100 text-indigo-900',
]
const SITE_DOT = ['bg-rose-300', 'bg-amber-300', 'bg-sky-300', 'bg-emerald-300', 'bg-violet-300', 'bg-orange-300', 'bg-teal-300', 'bg-pink-300', 'bg-lime-300', 'bg-indigo-300']

export const EVENT_KINDS = ['상담', '방문', '회의', '연차', '반차', '기타'] as const
const KIND_STYLE: Record<string, string> = {
  '상담': 'bg-sky-50 text-sky-800 border-sky-200',
  '방문': 'bg-amber-50 text-amber-800 border-amber-200',
  '회의': 'bg-violet-50 text-violet-800 border-violet-200',
  '연차': 'bg-gray-100 text-gray-600 border-gray-200 bg-[repeating-linear-gradient(135deg,transparent,transparent_6px,rgba(0,0,0,0.04)_6px,rgba(0,0,0,0.04)_12px)]',
  '반차': 'bg-gray-100 text-gray-600 border-gray-200 bg-[repeating-linear-gradient(135deg,transparent,transparent_6px,rgba(0,0,0,0.04)_6px,rgba(0,0,0,0.04)_12px)]',
  '기타': 'bg-white text-gray-700 border-gray-200',
}

const WEEK = ['일', '월', '화', '수', '목', '금', '토']
const DAY = 86400000
const sameDay = (a: Date, b: Date) => a.getTime() === b.getTime()
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function weekStart(d: Date) { const t = new Date(d); t.setHours(0, 0, 0, 0); t.setDate(t.getDate() - t.getDay()); return t }

// 그 날에 걸친 일정인지 (시작~종료 사이)
function covers(start: Date | null, end: Date | null, day: Date) {
  if (!start) return false
  const e = end && end >= start ? end : start
  return start <= day && day <= e
}

export function siteColorIndex(projects: Project[]) {
  // 오래된 현장부터 차례로 색 배정 — 현장이 추가돼도 기존 현장 색이 잘 안 바뀌게
  const order = [...projects].sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))
  const map: Record<string, number> = {}
  order.forEach((p, i) => { map[p.id] = i % SITE_COLORS.length })
  return map
}

type Props = {
  projects: Project[]          // 진행 중(달력에 표시할) 현장
  schedules: Schedule[]
  events: OfficeEvent[]
  payments: PaymentDue[]
  eventsReady: boolean         // office_events 표가 있는지 (SQL 실행 전이면 false)
  onPickSchedule: (s: Schedule, p: Project) => void
  onPickEvent: (e: OfficeEvent) => void
  onAddEvent: (date: string) => void
  readOnly: boolean
}

export default function WeekCalendar({ projects, schedules, events, payments, eventsReady, onPickSchedule, onPickEvent, onAddEvent, readOnly }: Props) {
  const today = todayStart()
  const [start, setStart] = useState(() => weekStart(today))
  const [expanded, setExpanded] = useState(false)
  const days = Array.from({ length: 7 }, (_, i) => new Date(start.getTime() + i * DAY))
  const end = days[6]
  const colorOf = siteColorIndex(projects)
  const projById = Object.fromEntries(projects.map(p => [p.id, p]))

  const siteItems = (day: Date) => schedules
    .filter(s => projById[s.project_id] && covers(parseDate(s.scheduled_date), parseDate(s.end_date), day))
    .sort((a, b) => (projById[a.project_id].name).localeCompare(projById[b.project_id].name, 'ko') || a.task_name.localeCompare(b.task_name, 'ko'))
  const officeItems = (day: Date) => events.filter(e => covers(parseDate(e.event_date), parseDate(e.end_date), day))
  const payItems = (day: Date) => payments.filter(p => !p.paid && p.due_date && sameDay(parseDate(p.due_date)!, day))

  const LIMIT = 4
  const weekProjects = projects.filter(p => days.some(d => siteItems(d).some(s => s.project_id === p.id)))

  const SiteChip = ({ s }: { s: Schedule }) => {
    const p = projById[s.project_id]
    const done = s.phase_status === '완료' || s.is_done
    return (
      <button onClick={() => onPickSchedule(s, p)} title={`${p.name} · ${s.task_name}${s.vendor ? ' · ' + s.vendor : ''}`}
        className={`w-full text-left rounded px-1.5 py-1 text-[12px] leading-tight flex items-center gap-1 ${SITE_COLORS[colorOf[p.id] ?? 0]} ${done ? 'opacity-50 line-through' : ''} hover:brightness-95`}>
        <span className="line-clamp-2 break-keep flex-1">{s.task_name}{s.vendor ? <span className="ml-1 text-[10px] px-1 rounded bg-white/70">{s.vendor}</span> : null}</span>
        {s.vendor_booked && <span className="flex-shrink-0 w-4 h-4 rounded-full bg-green-500 text-white text-[10px] font-bold flex items-center justify-center" aria-label="확정">✓</span>}
      </button>
    )
  }
  const OfficeChip = ({ e }: { e: OfficeEvent }) => (
    <button onClick={() => onPickEvent(e)}
      className={`w-full text-left rounded px-1.5 py-1 text-[12px] leading-tight border truncate ${KIND_STYLE[e.kind] || KIND_STYLE['기타']}`}>
      {e.person ? `${e.person} ` : ''}{e.title}
    </button>
  )
  const PayChip = ({ p }: { p: PaymentDue }) => (
    <Link href="/payments" className="block w-full rounded px-1.5 py-1 text-[12px] leading-tight border border-green-200 bg-green-50 text-green-800 truncate">
      💰 {p.project_name} {p.type}
    </Link>
  )

  return (
    <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 md:px-6 py-3 md:py-4">
        <h2 className="text-base font-bold text-gray-900">이번주 일정</h2>
        <div className="flex items-center gap-1 md:gap-3">
          <button onClick={() => setStart(new Date(start.getTime() - 7 * DAY))} className="w-8 h-8 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50" aria-label="이전 주">‹</button>
          <button onClick={() => setStart(weekStart(today))} className="text-sm font-medium text-gray-700 px-2 min-w-[96px]">{md(start)} – {md(end)}</button>
          <button onClick={() => setStart(new Date(start.getTime() + 7 * DAY))} className="w-8 h-8 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50" aria-label="다음 주">›</button>
        </div>
        <div className="hidden xl:flex items-center gap-2">
          <button onClick={() => setExpanded(!expanded)} className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">{expanded ? '⌃ 접기' : '⌄ 펼치기'}</button>
          <Link href="/projects" className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">현장 관리 →</Link>
        </div>
      </div>

      {/* 넓은 화면: 7칸 달력 */}
      <div className="hidden xl:grid grid-cols-7 border-t border-gray-200">
        {days.map((d, i) => {
          const isToday = sameDay(d, today)
          const site = siteItems(d)
          const shownSite = expanded ? site : site.slice(0, LIMIT)
          return (
            <div key={i} className={`border-r last:border-r-0 border-gray-200 flex flex-col min-w-0 ${isToday ? 'bg-green-50/40' : ''}`}>
              <div className={`text-center text-xs py-1.5 border-b border-gray-200 ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-500'}`}>{WEEK[i]}</div>
              <div className="px-1.5 pt-1.5">
                <span className={`inline-block text-xs font-medium px-1.5 py-0.5 rounded-md ${isToday ? 'bg-green-700 text-white' : i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-600'}`}>{md(d)}</span>
              </div>
              <div className="px-1.5 py-1.5 flex flex-col gap-1 min-h-[96px]">
                {shownSite.map(s => <SiteChip key={s.id} s={s} />)}
                {!expanded && site.length > LIMIT && (
                  <button onClick={() => setExpanded(true)} className="text-[11px] text-gray-400 text-left px-1">+{site.length - LIMIT}개 더</button>
                )}
              </div>
              <div className="border-t border-dashed border-gray-200 px-1.5 py-1.5 flex flex-col gap-1 min-h-[64px] group">
                {officeItems(d).map(e => <OfficeChip key={e.id} e={e} />)}
                {payItems(d).map(p => <PayChip key={p.id} p={p} />)}
                {eventsReady && !readOnly && (
                  <button onClick={() => onAddEvent(ymd(d))} className="text-[11px] text-gray-300 hover:text-green-600 text-left px-1 opacity-0 group-hover:opacity-100">+ 일정</button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* 휴대폰·좁은 화면: 날짜별 세로 목록 (일정 없는 날은 접어서 한 줄) */}
      <div className="xl:hidden border-t border-gray-200 divide-y divide-gray-100">
        {days.map((d, i) => {
          const isToday = sameDay(d, today)
          const site = siteItems(d), office = officeItems(d), pay = payItems(d)
          const empty = site.length + office.length + pay.length === 0
          return (
            <div key={i} className={`flex gap-3 px-4 ${empty ? 'py-2' : 'py-3'} ${isToday ? 'bg-green-50/50' : ''}`}>
              <div className="w-12 flex-shrink-0 text-center">
                <div className={`text-[11px] ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-400'}`}>{WEEK[i]}</div>
                <div className={`text-sm font-semibold rounded-md ${isToday ? 'bg-green-700 text-white' : 'text-gray-700'}`}>{md(d)}</div>
              </div>
              <div className="flex-1 min-w-0 flex flex-col gap-1">
                {empty && <span className="text-xs text-gray-300 py-1">일정 없음</span>}
                {/* 같은 현장 공정은 한 묶음으로 — 현장 이름은 한 번만 */}
                {[...new Set(site.map(s => s.project_id))].map(pid => (
                  <div key={pid} className="min-w-0">
                    <p className="text-[11px] text-gray-500 flex items-center gap-1 mb-0.5">
                      <span className={`w-2 h-2 rounded-sm ${SITE_DOT[colorOf[pid] ?? 0]}`} />{projById[pid].name}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {site.filter(s => s.project_id === pid).map(s => <div key={s.id} className="max-w-full"><SiteChip s={s} /></div>)}
                    </div>
                  </div>
                ))}
                {office.map(e => <OfficeChip key={e.id} e={e} />)}
                {pay.map(p => <PayChip key={p.id} p={p} />)}
              </div>
              {eventsReady && !readOnly && (
                <button onClick={() => onAddEvent(ymd(d))} className="text-gray-300 text-lg leading-none self-center px-1" aria-label={`${md(d)} 일정 추가`}>+</button>
              )}
            </div>
          )
        })}
      </div>

      {/* 범례 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 md:px-6 py-3 border-t border-gray-200 text-xs text-gray-500">
        <span className="text-gray-400">현장</span>
        {weekProjects.length === 0 && <span className="text-gray-300">이번 주 공정 없음</span>}
        {weekProjects.map(p => (
          <Link key={p.id} href={`/projects/${p.id}`} className="flex items-center gap-1.5 hover:text-gray-800">
            <span className={`w-3 h-3 rounded-sm ${SITE_DOT[colorOf[p.id] ?? 0]}`} />{p.name}
          </Link>
        ))}
        <span className="text-gray-300">|</span>
        <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded-full bg-green-500 text-white text-[9px] flex items-center justify-center">✓</span>업체 확정</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm border border-sky-200 bg-sky-50" />사무실 일정</span>
        {!eventsReady && <span className="text-amber-600">사무실 일정은 DB 설정(db/office_events.sql) 후 쓸 수 있어요</span>}
      </div>
    </section>
  )
}
