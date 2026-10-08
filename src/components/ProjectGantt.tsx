'use client'
import { useEffect, useRef, useState } from 'react'
import type { Schedule } from '@/lib/supabase'

// 현장 상세 · 현황 탭의 공정일정 — 목록 보기(폰 기본) / 일정표 보기(간트), 상태별 색 구분
const DAY = 86400000
const ZOOMS = [10, 16, 24, 36] // 일정표 하루 칸 너비(px) — 확대/축소 단계
const VIEW_KEY = 'jm.ganttView'
const WEEK = ['일', '월', '화', '수', '목', '금', '토']

// 'YYYY-MM-DD'를 현지 자정으로 (new Date('YYYY-MM-DD')는 UTC 기준이라 하루 밀릴 수 있음)
function parseDate(s?: string | null): Date | null {
  const m = (s || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null
}
const md = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`
const mdw = (d: Date) => `${md(d)}(${WEEK[d.getDay()]})`
const todayStart = () => { const t = new Date(); t.setHours(0, 0, 0, 0); return t }
const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / DAY)

type Status = '완료' | '진행중' | '예정' | '지연'
type PhaseStatus = '예정' | '진행중' | '완료'
const STYLE: Record<Status, { bar: string; text: string; chip: string }> = {
  '완료':   { bar: 'bg-green-500', text: 'text-white',    chip: 'bg-green-100 text-green-700' },
  '진행중': { bar: 'bg-blue-500',  text: 'text-white',    chip: 'bg-blue-100 text-blue-700' },
  '예정':   { bar: 'bg-gray-300',  text: 'text-gray-700', chip: 'bg-gray-100 text-gray-600' },
  '지연':   { bar: 'bg-red-500',   text: 'text-white',    chip: 'bg-red-100 text-red-700' },
}

type Row = { s: Schedule; start: Date | null; end: Date | null; status: Status }
function buildRows(schedules: Schedule[], today: Date): Row[] {
  return schedules.map(s => {
    const start = parseDate(s.scheduled_date)
    let end = parseDate(s.end_date) || start
    if (end && start && end < start) end = start
    const ps = (s.phase_status || '예정') as PhaseStatus
    // 종료일(없으면 시작일)이 지났는데 완료가 아니면 지연
    const status: Status = ps !== '완료' && end && end < today ? '지연' : ps
    return { s, start, end, status }
  })
}

type Props = {
  schedules: Schedule[]
  onEdit?: (s: Schedule) => void                       // 공정 수정 창 열기
  onStatus?: (s: Schedule, st: PhaseStatus) => void    // 상태 바로 변경
}

export default function ProjectGantt({ schedules, onEdit, onStatus }: Props) {
  // 보기 방식: 저장된 선택 → 없으면 폰(640px 미만)은 목록, 태블릿·PC는 일정표
  const [view, setViewState] = useState<'list' | 'chart'>(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY)
      if (v === 'list' || v === 'chart') return v
    } catch {}
    return typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches ? 'list' : 'chart'
  })
  const setView = (v: 'list' | 'chart') => { setViewState(v); try { localStorage.setItem(VIEW_KEY, v) } catch {} }
  const [full, setFull] = useState(false)
  const [picked, setPicked] = useState<string | null>(null) // 눌러서 연 공정 id
  const pickedS = schedules.find(s => s.id === picked)

  // 크게 보기: 화면 전체로 띄우기 (뒤 화면 스크롤 잠금)
  useEffect(() => {
    if (!full) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFull(false) }
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey) }
  }, [full])

  const board = (isFull: boolean) => (
    <Board schedules={schedules} view={view} setView={setView} full={isFull}
      onFull={isFull ? undefined : () => setFull(true)} onPick={s => setPicked(s.id)} />
  )

  return (
    <>
      {board(false)}
      {full && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <h2 className="text-base font-bold text-gray-800">공정일정</h2>
            <button onClick={() => setFull(false)} className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 text-gray-600 hover:bg-gray-50">닫기 ✕</button>
          </div>
          <div className="flex-1 overflow-auto p-3 md:p-5">{board(true)}</div>
        </div>
      )}

      {/* 공정 누르면: 정보 + 상태 바로 변경 */}
      {pickedS && (() => {
        const [{ start, end, status }] = buildRows([pickedS], todayStart())
        const ps = (pickedS.phase_status || '예정') as PhaseStatus
        return (
          <div className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setPicked(null)}>
            <div className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl shadow-xl p-5" onClick={e => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-2 mb-1">
                <h3 className="text-base font-bold text-gray-900 break-keep">{pickedS.task_name}</h3>
                <button onClick={() => setPicked(null)} className="text-gray-400 text-2xl leading-none">&times;</button>
              </div>
              <p className="text-sm text-gray-500">
                {start ? mdw(start) : '날짜 미정'}{end && start && end > start ? ` ~ ${mdw(end)}` : ''}
                {pickedS.manager ? ` · 담당 ${pickedS.manager}` : ''}
              </p>
              {pickedS.vendor && <p className="text-sm text-gray-500">업체 {pickedS.vendor} {pickedS.vendor_booked ? '(확정)' : '(미확정)'}</p>}
              {status === '지연' && <p className="mt-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">종료일이 지났는데 아직 완료로 체크되지 않았어요</p>}

              {onStatus ? (
                <>
                  <p className="text-xs text-gray-400 mt-4 mb-2">상태 변경</p>
                  <div className="grid grid-cols-3 gap-2">
                    {(['예정', '진행중', '완료'] as const).map(st => {
                      const on = ps === st
                      const color = st === '완료' ? 'bg-green-500 border-green-500 text-white' : st === '진행중' ? 'bg-blue-500 border-blue-500 text-white' : 'bg-gray-300 border-gray-300 text-gray-800'
                      return (
                        <button key={st} onClick={() => { if (!on) onStatus(pickedS, st); setPicked(null) }}
                          className={`py-2.5 rounded-lg text-sm font-medium border ${on ? color : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                          {on ? '✓ ' : ''}{st}
                        </button>
                      )
                    })}
                  </div>
                </>
              ) : (
                <p className="mt-4 text-sm">현재 상태: <b>{status}</b></p>
              )}
              {onEdit && (
                <button onClick={() => { setPicked(null); setFull(false); onEdit(pickedS) }}
                  className="mt-3 w-full py-2.5 rounded-lg text-sm border border-gray-300 text-gray-700 hover:bg-gray-50">
                  날짜·담당·업체 수정
                </button>
              )}
            </div>
          </div>
        )
      })()}
    </>
  )
}

function Board({ schedules, view, setView, full, onFull, onPick }: {
  schedules: Schedule[]
  view: 'list' | 'chart'
  setView: (v: 'list' | 'chart') => void
  full: boolean
  onFull?: () => void
  onPick: (s: Schedule) => void
}) {
  const [zoom, setZoom] = useState(full ? 2 : 1)
  const today = todayStart()
  const rows = buildRows(schedules, today)
  const counts = rows.reduce((acc, r) => { acc[r.status]++; return acc }, { '완료': 0, '진행중': 0, '예정': 0, '지연': 0 } as Record<Status, number>)
  const hasDated = rows.some(r => r.start)
  const btn = 'h-8 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-30'

  return (
    <div>
      {/* 상태별 개수 + 보기 전환 */}
      <div className="flex items-center gap-x-3 gap-y-2 flex-wrap mb-3">
        <div className="flex items-center gap-3 flex-wrap">
          {(['지연', '진행중', '예정', '완료'] as Status[]).map(st => (
            <span key={st} className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className={`w-3 h-3 rounded-sm ${STYLE[st].bar}`} />{st} <b className="text-gray-800">{counts[st]}</b>
            </span>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <div className="flex rounded-md border border-gray-300 overflow-hidden text-xs">
            {(['list', 'chart'] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`h-8 px-3 ${view === v ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                {v === 'list' ? '목록' : '일정표'}
              </button>
            ))}
          </div>
          {view === 'chart' && hasDated && (
            <>
              <button onClick={() => setZoom(z => Math.max(0, z - 1))} disabled={zoom === 0} title="축소" className={`${btn} w-8 text-sm`}>−</button>
              <button onClick={() => setZoom(z => Math.min(ZOOMS.length - 1, z + 1))} disabled={zoom === ZOOMS.length - 1} title="확대" className={`${btn} w-8 text-sm`}>+</button>
            </>
          )}
          {onFull && <button onClick={onFull} title="크게 보기" className={`${btn} px-2.5 text-xs`}>⛶ 크게</button>}
        </div>
      </div>

      {view === 'list'
        ? <ListView rows={rows} today={today} full={full} onPick={onPick} />
        : <ChartView rows={rows} today={today} full={full} dayW={ZOOMS[zoom]} onPick={onPick} />}
    </div>
  )
}

// ── 목록 보기: 지연 → 진행중 → 예정 → 완료 순, 남은/지난 일수 표시 ──
function ListView({ rows, today, full, onPick }: { rows: Row[]; today: Date; full: boolean; onPick: (s: Schedule) => void }) {
  const [showDone, setShowDone] = useState(false)
  const byStart = (a: Row, b: Row) => (a.start?.getTime() ?? Infinity) - (b.start?.getTime() ?? Infinity)
  const groups: { st: Status; title: string; items: Row[] }[] = [
    { st: '지연', title: '지연 — 완료 체크가 필요해요', items: rows.filter(r => r.status === '지연').sort(byStart) },
    { st: '진행중', title: '진행중', items: rows.filter(r => r.status === '진행중').sort(byStart) },
    { st: '예정', title: '예정', items: rows.filter(r => r.status === '예정').sort(byStart) },
    { st: '완료', title: '완료', items: rows.filter(r => r.status === '완료').sort(byStart) },
  ]

  // 오른쪽 배지: 지난 일수 / 마감까지 / 시작까지
  function badge(r: Row): { text: string; cls: string } | null {
    if (!r.start || !r.end) return null
    if (r.status === '완료') return null
    if (r.status === '지연') return { text: `${daysBetween(r.end, today)}일 지남`, cls: 'bg-red-100 text-red-700' }
    const toStart = daysBetween(today, r.start), toEnd = daysBetween(today, r.end)
    if (r.status === '진행중') return { text: toEnd === 0 ? '오늘 마감' : `마감 D-${toEnd}`, cls: 'bg-blue-100 text-blue-700' }
    if (toStart > 0) return { text: toStart === 1 ? '내일 시작' : `${toStart}일 후 시작`, cls: 'bg-gray-100 text-gray-600' }
    return { text: toStart === 0 ? '오늘 시작' : '시작일 지남', cls: 'bg-amber-100 text-amber-700' }
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.filter(g => g.items.length).map(g => {
        const hidden = g.st === '완료' && !showDone
        return (
          <section key={g.st}>
            <button onClick={() => g.st === '완료' && setShowDone(v => !v)}
              className={`flex items-center gap-2 mb-2 ${g.st === '완료' ? 'cursor-pointer' : 'cursor-default'}`}>
              <span className={`w-2.5 h-2.5 rounded-full ${STYLE[g.st].bar}`} />
              <span className={`text-sm font-semibold ${g.st === '지연' ? 'text-red-600' : 'text-gray-700'}`}>{g.title}</span>
              <span className="text-xs text-gray-400">{g.items.length}</span>
              {g.st === '완료' && <span className="text-xs text-gray-400">{showDone ? '▲ 접기' : '▼ 펼치기'}</span>}
            </button>
            {!hidden && (
              <div className={`grid gap-2 sm:grid-cols-2 ${full ? 'xl:grid-cols-3' : ''}`}>
                {g.items.map(r => {
                  const b = badge(r)
                  const days = r.start && r.end ? daysBetween(r.start, r.end) + 1 : 0
                  return (
                    <button key={r.s.id} type="button" onClick={() => onPick(r.s)}
                      className="flex items-stretch text-left bg-white rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 overflow-hidden">
                      <span className={`w-1.5 flex-shrink-0 ${STYLE[r.status].bar}`} />
                      <span className="flex-1 min-w-0 px-3 py-2.5">
                        <span className="flex items-start gap-2">
                          <span className={`flex-1 text-sm font-medium break-keep ${r.status === '완료' ? 'text-gray-400' : 'text-gray-900'}`}>{r.s.task_name}</span>
                          {b && <span className={`flex-shrink-0 text-[11px] font-medium px-1.5 py-0.5 rounded ${b.cls}`}>{b.text}</span>}
                        </span>
                        <span className="block text-xs text-gray-500 mt-0.5">
                          {r.start ? <>{mdw(r.start)}{r.end && r.end > r.start ? ` ~ ${mdw(r.end)}` : ''} · {days}일</> : '날짜 미정'}
                          {r.s.manager ? ` · ${r.s.manager}` : ''}
                          {r.s.vendor ? ` · ${r.s.vendor}${r.s.vendor_booked ? '' : '(미확정)'}` : ''}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

// ── 일정표 보기(간트): 모든 기기에서 같은 모양 — 왼쪽 공정명 칸 + 날짜 막대 ──
function ChartView({ rows, today, full, dayW, onPick }: { rows: Row[]; today: Date; full: boolean; dayW: number; onPick: (s: Schedule) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const dated = rows.filter(r => r.start && r.end) as (Row & { start: Date; end: Date })[]
  const undated = rows.filter(r => !r.start)
  // 공정명 칸 폭: 기기 폭에 맞춰 단계적으로
  const nameW = full ? 'w-36 sm:w-48 md:w-60' : 'w-28 sm:w-40 md:w-48'

  // 표시 범위: 전체 공정 기간 앞뒤 3일 (오늘이 범위 밖이면 오늘까지 포함)
  let rangeStart = today, rangeEnd = today
  if (dated.length) {
    rangeStart = new Date(Math.min(...dated.map(r => r.start.getTime()), today.getTime()))
    rangeEnd = new Date(Math.max(...dated.map(r => r.end.getTime()), today.getTime()))
  }
  rangeStart = new Date(rangeStart.getTime() - 3 * DAY)
  rangeEnd = new Date(rangeEnd.getTime() + 3 * DAY)
  const totalDays = daysBetween(rangeStart, rangeEnd) + 1
  const dayIdx = (d: Date) => daysBetween(rangeStart, d)
  const todayIdx = dayIdx(today)

  const months: { label: string; days: number }[] = []
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(rangeStart.getTime() + i * DAY)
    const label = `${d.getFullYear() !== today.getFullYear() ? `${String(d.getFullYear()).slice(2)}년 ` : ''}${d.getMonth() + 1}월`
    if (months.length && months[months.length - 1].label === label) months[months.length - 1].days++
    else months.push({ label, days: 1 })
  }

  // 오늘 위치가 화면 가운데쯤 오도록 가로 스크롤
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollLeft = Math.max(0, todayIdx * dayW - el.clientWidth / 2)
  }, [todayIdx, dayW, dated.length])

  return (
    <div>
      {dated.length > 0 && (
        <div ref={scrollRef} className="overflow-x-auto border border-gray-100 rounded-lg">
          <div className="w-max">
            {/* 월 · 날짜 헤더 */}
            <div className="flex bg-gray-50 border-b border-gray-100">
              <div className={`${nameW} flex-shrink-0 sticky left-0 z-20 bg-gray-50 border-r border-gray-100`} />
              {months.map((m, i) => (
                <div key={i} className="text-xs font-semibold text-gray-500 py-1 px-1.5 border-r border-gray-100 truncate"
                  style={{ width: m.days * dayW }}>{m.label}</div>
              ))}
            </div>
            <div className="flex bg-gray-50 border-b border-gray-200">
              <div className={`${nameW} flex-shrink-0 sticky left-0 z-20 bg-gray-50 border-r border-gray-100 px-3 py-1 text-xs font-semibold text-gray-400`}>공정</div>
              {Array.from({ length: totalDays }).map((_, i) => {
                const d = new Date(rangeStart.getTime() + i * DAY)
                const dow = d.getDay()
                return (
                  <div key={i} className={`flex-shrink-0 text-center py-1 border-r border-gray-100 ${i === todayIdx ? 'bg-red-50 font-bold text-red-500' : dow === 0 ? 'text-red-400' : dow === 6 ? 'text-blue-400' : 'text-gray-400'}`}
                    style={{ width: dayW, fontSize: dayW < 14 ? 8 : 10 }}>{dayW < 14 && d.getDate() % 2 === 0 && i !== todayIdx ? '' : d.getDate()}</div>
                )
              })}
            </div>

            {/* 공정 행 */}
            {dated.map(({ s, start, end, status }) => {
              const left = dayIdx(start) * dayW
              const width = (dayIdx(end) - dayIdx(start) + 1) * dayW
              const st = STYLE[status]
              return (
                <div key={s.id} className="flex border-b border-gray-50 hover:bg-gray-50/70 group">
                  <button type="button" onClick={() => onPick(s)}
                    className={`${nameW} flex-shrink-0 sticky left-0 z-20 bg-white group-hover:bg-gray-50 border-r border-gray-100 px-2 sm:px-3 py-1.5 flex items-center gap-1.5 text-left`}>
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${st.bar}`} />
                    {/* 긴 공정명은 잘리지 않게 두 줄까지 줄바꿈 */}
                    <span className={`${full ? 'text-sm' : 'text-xs'} leading-tight break-keep line-clamp-2 ${status === '완료' ? 'text-gray-400' : status === '지연' ? 'text-red-600 font-medium' : 'text-gray-800'}`} title={s.task_name}>{s.task_name}</span>
                  </button>
                  <div className="relative" style={{ width: totalDays * dayW, minHeight: full ? 40 : 36 }}>
                    {/* 주말 음영 */}
                    {Array.from({ length: totalDays }).map((_, i) => {
                      const dow = new Date(rangeStart.getTime() + i * DAY).getDay()
                      return (dow === 0 || dow === 6) ? <div key={i} className="absolute top-0 bottom-0 bg-gray-50" style={{ left: i * dayW, width: dayW }} /> : null
                    })}
                    <div className="absolute top-0 bottom-0 w-0.5 bg-red-400 z-10" style={{ left: todayIdx * dayW + dayW / 2 }} />
                    <button type="button" onClick={() => onPick(s)}
                      title={`${s.task_name}\n${md(start)} ~ ${md(end)} · ${status}`}
                      className={`absolute top-1/2 -translate-y-1/2 h-[22px] rounded-md px-1.5 flex items-center overflow-hidden z-[5] cursor-pointer hover:brightness-95 ${st.bar} ${st.text}`}
                      style={{ left, width }}>
                      <span className="text-[10px] font-medium whitespace-nowrap">{width >= 66 ? `${md(start)}~${md(end)}` : ''}</span>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 날짜 미정 공정 */}
      {undated.length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-gray-400 mb-1.5">날짜 미정 {undated.length}건</p>
          <div className="flex flex-wrap gap-1.5">
            {undated.map(({ s, status }) => (
              <button key={s.id} type="button" onClick={() => onPick(s)}
                className={`text-xs px-2 py-1 rounded-full ${STYLE[status].chip}`}>
                {s.task_name} · {status}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
