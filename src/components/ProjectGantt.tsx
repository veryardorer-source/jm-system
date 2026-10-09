'use client'
import { useEffect, useRef, useState } from 'react'
import type { Schedule } from '@/lib/supabase'

// 현장 상세 · 현황 탭의 공정일정 — 목록 보기(폰 기본) / 일정표 보기(간트), 상태별 색 구분
const DAY = 86400000
const SPANS = [14, 28, 56] // 일정표 한 화면에 보이는 날 수 — 2주 / 4주 / 8주
const VIEW_KEY = 'jm.ganttView'
const WEEK = ['일', '월', '화', '수', '목', '금', '토']

// 'YYYY-MM-DD'를 현지 자정으로 (new Date('YYYY-MM-DD')는 UTC 기준이라 하루 밀릴 수 있음)
export function parseDate(s?: string | null): Date | null {
  const m = (s || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null
}
export const md = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`
export const mdw = (d: Date) => `${md(d)}(${WEEK[d.getDay()]})`
export const todayStart = () => { const t = new Date(); t.setHours(0, 0, 0, 0); return t }
export const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / DAY)

export type Status = '완료' | '진행중' | '예정' | '지연'
type PhaseStatus = '예정' | '진행중' | '완료'
export const STYLE: Record<Status, { bar: string; text: string; chip: string }> = {
  '완료':   { bar: 'bg-green-500', text: 'text-white',    chip: 'bg-green-100 text-green-700' },
  '진행중': { bar: 'bg-blue-500',  text: 'text-white',    chip: 'bg-blue-100 text-blue-700' },
  '예정':   { bar: 'bg-gray-300',  text: 'text-gray-700', chip: 'bg-gray-100 text-gray-600' },
  '지연':   { bar: 'bg-red-500',   text: 'text-white',    chip: 'bg-red-100 text-red-700' },
}

export type Row = { s: Schedule; start: Date | null; end: Date | null; status: Status }
export function buildRows(schedules: Schedule[], today: Date): Row[] {
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
  onDelete?: (s: Schedule) => void                     // 공정 삭제 (확인 창은 부르는 쪽에서)
}

export default function ProjectGantt({ schedules, onEdit, onStatus, onDelete }: Props) {
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
              {onDelete && (
                <button onClick={() => { setPicked(null); onDelete(pickedS) }}
                  className="mt-2 w-full py-2 rounded-lg text-sm text-red-500 hover:bg-red-50">
                  공정 삭제
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
  const [span, setSpan] = useState(28)
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
            <div className="flex rounded-md border border-gray-300 overflow-hidden text-xs">
              {SPANS.map(n => (
                <button key={n} onClick={() => setSpan(n)}
                  className={`h-8 px-2.5 ${span === n ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>{n / 7}주</button>
              ))}
            </div>
          )}
          {onFull && <button onClick={onFull} title="크게 보기" className={`${btn} px-2.5 text-xs`}>⛶ 크게</button>}
        </div>
      </div>

      {view === 'list'
        ? <ListView rows={rows} today={today} full={full} onPick={onPick} />
        : <ChartView rows={rows} today={today} full={full} span={span} onPick={onPick} />}
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

// ── 일정표 보기(간트): 공정명은 막대 옆에 (왼쪽 공정명 칸 없음), 오늘 중심으로 열림 ──
function ChartView({ rows, today, full, span, onPick }: { rows: Row[]; today: Date; full: boolean; span: number; onPick: (s: Schedule) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [offset, setOffset] = useState(0) // 이전/다음으로 옮긴 날 수
  const [hideDone, setHideDone] = useState(false)
  const dated = rows.filter(r => r.start && r.end) as (Row & { start: Date; end: Date })[]
  const undated = rows.filter(r => !r.start)

  // 표시 범위: 오늘이 앞쪽 1/3쯤 오게 (지난 공정보다 앞으로 할 공정을 더 많이)
  const winStart = new Date(today.getTime() + (offset - Math.round(span / 3)) * DAY)
  const winEnd = new Date(winStart.getTime() + (span - 1) * DAY)
  const idx = (d: Date) => daysBetween(winStart, d)
  const todayIdx = idx(today)
  const pct = (i: number) => (i / span) * 100
  const days = Array.from({ length: span }, (_, i) => new Date(winStart.getTime() + i * DAY))
  const minDay = span <= 14 ? 24 : span <= 28 ? 12 : 8 // 하루 칸 최소 너비(px) — 폰에서도 대부분 한 화면에 들어오게

  const inWin = dated.filter(r => r.start <= winEnd && r.end >= winStart)
  const shown = inWin.filter(r => !(hideDone && r.status === '완료')).sort((a, b) => a.start.getTime() - b.start.getTime())
  const before = dated.filter(r => r.end < winStart).length
  const after = dated.filter(r => r.start > winEnd).length

  // 폰처럼 가로로 밀어야 할 때는 오늘이 보이게
  useEffect(() => {
    const el = scrollRef.current
    if (el && el.scrollWidth > el.clientWidth) el.scrollLeft = Math.max(0, (todayIdx / span) * el.scrollWidth - el.clientWidth / 3)
  }, [todayIdx, span])

  const btn = 'h-8 px-2.5 text-xs rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50'

  return (
    <div>
      {/* 기간 이동 */}
      <div className="flex items-center gap-1.5 flex-wrap mb-2">
        <button onClick={() => setOffset(o => o - Math.round(span / 2))} className={btn}>‹ 이전</button>
        <button onClick={() => setOffset(0)} className={`h-8 px-3 text-xs rounded-md border ${offset === 0 ? 'bg-green-600 border-green-600 text-white' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>오늘</button>
        <button onClick={() => setOffset(o => o + Math.round(span / 2))} className={btn}>다음 ›</button>
        <span className="text-xs text-gray-500 ml-1">{mdw(winStart)} ~ {mdw(winEnd)}</span>
        <label className="ml-auto flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
          <input type="checkbox" checked={hideDone} onChange={e => setHideDone(e.target.checked)} className="accent-green-600" />완료 숨김
        </label>
      </div>

      {dated.length > 0 && (
        <div ref={scrollRef} className="overflow-x-auto border border-gray-100 rounded-lg">
          <div style={{ minWidth: span * minDay }}>
            {/* 날짜 헤더 */}
            <div className="relative h-9 bg-gray-50 border-b border-gray-200">
              {days.map((d, i) => {
                const dow = d.getDay()
                const first = i === 0 || d.getDate() === 1
                const key = dow === 1 || first || i === todayIdx // 좁은 화면에서도 항상 보이는 날짜
                const numCls = key ? '' : span <= 14 ? '' : span <= 28 ? 'hidden sm:inline' : 'hidden'
                return (
                  <div key={i} className={`absolute top-0 bottom-0 flex flex-col items-center justify-center leading-tight ${i === todayIdx ? 'bg-red-500 text-white font-bold rounded' : dow === 0 ? 'text-red-400' : dow === 6 ? 'text-blue-400' : 'text-gray-400'}`}
                    style={{ left: `${pct(i)}%`, width: `${pct(1)}%` }}>
                    {first && <span className={`text-[10px] font-semibold ${span > 14 ? 'hidden sm:block' : ''}`}>{d.getMonth() + 1}월</span>}
                    <span className={`text-[11px] ${numCls}`}>{d.getDate()}</span>
                  </div>
                )
              })}
            </div>

            {/* 공정 막대 */}
            <div className="relative">
              {/* 주말 음영 · 오늘선 */}
              {days.map((d, i) => (d.getDay() === 0 || d.getDay() === 6) && (
                <div key={i} className="absolute top-0 bottom-0 bg-gray-50" style={{ left: `${pct(i)}%`, width: `${pct(1)}%` }} />
              ))}
              {todayIdx >= 0 && todayIdx < span && (
                <div className="absolute top-0 bottom-0 w-0.5 bg-red-400 z-10" style={{ left: `${pct(todayIdx + 0.5)}%` }} />
              )}

              {shown.length === 0 && (
                <p className="relative py-8 text-center text-sm text-gray-400">이 기간에 잡힌 공정이 없어요</p>
              )}
              {shown.map(({ s, start, end, status }) => {
                const a = Math.max(0, idx(start)), b = Math.min(span - 1, idx(end))
                const left = pct(a), right = pct(b + 1)
                const st = STYLE[status]
                const when = `${md(start)}${end > start ? `~${md(end)}` : ''}${status === '지연' ? ` · ${daysBetween(end, today)}일 지남` : ''}`
                // 이름 자리: 막대 오른쪽 → 안 되면 왼쪽 → 둘 다 좁으면 막대 안
                const place = right <= 70 ? 'right' : left >= 30 ? 'left' : 'inside'
                const color = status === '지연' ? 'text-red-600' : status === '완료' ? 'text-gray-400' : 'text-gray-800'
                const label = (
                  <><span className="font-medium">{s.task_name}</span> <span className="opacity-70">{when}</span></>
                )
                return (
                  <div key={s.id} className={`relative ${full ? 'h-10' : 'h-9'} border-b border-gray-50 hover:bg-gray-50/60`}>
                    <button type="button" onClick={() => onPick(s)} title={`${s.task_name}\n${md(start)} ~ ${md(end)} · ${status}`}
                      className={`absolute top-1/2 -translate-y-1/2 h-[22px] rounded-md px-1.5 flex items-center overflow-hidden z-[5] hover:brightness-95 ${st.bar} ${st.text}`}
                      style={{ left: `calc(${left}% + 1px)`, width: `calc(${right - left}% - 2px)` }}>
                      {place === 'inside' && <span className="text-xs whitespace-nowrap truncate">{label}</span>}
                    </button>
                    {place !== 'inside' && (
                      <button type="button" onClick={() => onPick(s)}
                        className={`absolute top-1/2 -translate-y-1/2 z-20 bg-white/90 rounded px-1 whitespace-nowrap overflow-hidden text-ellipsis ${full ? 'text-sm' : 'text-xs'} ${color} hover:underline`}
                        title={`${s.task_name} ${when}`}
                        style={place === 'right' ? { left: `calc(${right}% + 3px)`, maxWidth: `calc(${100 - right}% - 4px)` } : { right: `calc(${100 - left}% + 3px)`, maxWidth: `calc(${left}% - 4px)` }}>
                        {label}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* 기간 밖 공정 안내 */}
      {(before > 0 || after > 0) && (
        <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
          {before > 0 && <button onClick={() => setOffset(o => o - Math.round(span / 2))} className="hover:text-gray-700">‹ 이전 공정 {before}개</button>}
          {after > 0 && <button onClick={() => setOffset(o => o + Math.round(span / 2))} className="ml-auto hover:text-gray-700">이후 공정 {after}개 ›</button>}
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
