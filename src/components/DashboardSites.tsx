'use client'

import { useState } from 'react'
import Link from 'next/link'
import { supabase, Project, Schedule, PhaseStatus, STATUS_LIST, HIDDEN_STATUSES } from '@/lib/supabase'
import { notifyOthers } from '@/lib/notify'
import { toast } from '@/components/Toaster'
import { buildRows, parseDate, md, mdw, daysBetween, STYLE, type Row } from '@/components/ProjectGantt'

// 대시보드 · 진행중인 현장 — 현황판(단계·오늘/다음 공정) + 일 단위 공정표
const DAY = 86400000
const WEEK = ['일', '월', '화', '수', '목', '금', '토']
// 진행중 현장의 단계 (완료·중단 제외) — 현황판 단계 표시용
export const STAGES = STATUS_LIST.filter(s => !HIDDEN_STATUSES.includes(s as typeof HIDDEN_STATUSES[number]))
const STAGE_SHORT: Record<string, string> = { '상담중': '상담', '디자인중': '디자인', '견적중': '견적', '계약완료': '계약', '시공중': '시공' }

// 현장별 공정 요약: 지연 / 오늘 작업 / 다음 공정 / 갱신 필요 여부
export type Kind = 'late' | 'ok' | 'stale' | 'empty'
export type Info = { p: Project; rows: Row[]; late: Row[]; now: Row[]; next?: Row; kind: Kind }
export type Filter = 'all' | 'now' | 'late' | 'stale' | 'empty'

export function summarize(p: Project, schedules: Schedule[], today: Date): Info {
  const rows = buildRows(schedules.filter(s => s.project_id === p.id), today)
  const byStart = (a: Row, b: Row) => (a.start?.getTime() ?? Infinity) - (b.start?.getTime() ?? Infinity)
  const late = rows.filter(r => r.status === '지연').sort(byStart)
  const now = rows.filter(r => r.status !== '완료' && r.status !== '지연' && r.start && r.end && r.start <= today && today <= r.end).sort(byStart)
  const next = rows.filter(r => r.status === '예정' && r.start && r.start > today).sort(byStart)[0]
  const kind: Kind = rows.length === 0 ? 'empty' : late.length ? 'late' : rows.every(r => r.status === '완료') ? 'stale' : 'ok'
  return { p, rows, late, now, next, kind }
}

// ── 현황판: 현장마다 한 줄 (폰에서는 카드) — 단계 · 오늘/다음 공정 · 마감 ──
export function StatusBoard({ infos, today, readOnly, onAdd }: { infos: Info[]; today: Date; readOnly: boolean; onAdd: (p: Project) => void }) {
  if (infos.length === 0) {
    return <div className="bg-white rounded-xl border border-gray-200 text-center py-8 text-sm text-gray-400">해당하는 현장이 없어요</div>
  }
  const cols = 'md:grid md:grid-cols-[minmax(150px,1fr)_280px_minmax(0,1.6fr)_72px] md:items-center md:gap-4'
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className={`hidden ${cols} px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-400`}>
        <span>현장</span><span>단계</span><span>오늘 · 다음 공정</span><span className="text-right">마감</span>
      </div>
      {infos.map(info => {
        const { p, late, now, next, kind } = info
        const stageIdx = STAGES.indexOf(p.status)
        const end = parseDate(p.end_date)
        const dday = end ? daysBetween(today, end) : null
        return (
          <Link key={p.id} href={`/projects/${p.id}`}
            className={`block ${cols} px-4 py-3 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors ${kind === 'late' ? 'border-l-4 border-l-red-500' : ''}`}>
            {/* 현장명 */}
            <div className="flex items-start justify-between gap-2 min-w-0">
              <div className="min-w-0">
                <p className={`text-[15px] font-semibold truncate ${kind === 'late' ? 'text-red-600' : 'text-gray-900'}`}>{p.name}</p>
                <p className="text-xs text-gray-400 truncate">{[p.client_name, p.manager && `담당 ${p.manager}`].filter(Boolean).join(' · ') || ' '}</p>
              </div>
              <DDay dday={dday} className="md:hidden" />
            </div>

            {/* 단계 */}
            <div className="flex gap-0.5 mt-2 md:mt-0">
              {STAGES.map((s, i) => (
                <span key={s} className={`flex-1 text-center text-xs py-1 rounded ${
                  i < stageIdx ? 'bg-green-100 text-green-700' :
                  i === stageIdx ? 'bg-green-600 text-white font-semibold' :
                  'bg-gray-100 text-gray-400'}`}>{STAGE_SHORT[s] || s}</span>
              ))}
            </div>

            {/* 오늘 · 다음 공정 */}
            <div className="mt-2 md:mt-0 text-sm min-w-0 flex flex-col gap-0.5">
              {late.length > 0 && (
                <p className="text-red-600 md:truncate">
                  <span className="font-semibold">지연</span> · {late.slice(0, 2).map(r => `${r.s.task_name} ${r.end ? daysBetween(r.end, today) : 0}일 지남`).join(', ')}{late.length > 2 ? ` 외 ${late.length - 2}` : ''}
                </p>
              )}
              {now.length > 0 && (
                <p className="text-gray-800 md:truncate">
                  <span className="font-semibold text-green-700">오늘</span> · {now.slice(0, 2).map(r => `${r.s.task_name} (~${md(r.end!)})`).join(', ')}{now.length > 2 ? ` 외 ${now.length - 2}` : ''}
                </p>
              )}
              {next && (
                <p className="text-gray-500 md:truncate">다음 · {next.s.task_name} {mdw(next.start!)}</p>
              )}
              {kind === 'ok' && !now.length && !next && late.length === 0 && (
                <p className="text-gray-400">예정된 공정 없음</p>
              )}
              {kind === 'stale' && (
                <p className="text-amber-600 md:truncate">공정이 모두 완료됐어요 · 다음 공정 추가 또는 현장 완료 처리</p>
              )}
              {kind === 'empty' && (
                <p className="text-gray-400 flex items-center gap-2">
                  등록된 공정 없음
                  {!readOnly && (
                    <button onClick={e => { e.preventDefault(); e.stopPropagation(); onAdd(p) }}
                      className="text-xs text-green-600 border border-green-300 rounded-full px-2 py-0.5 hover:bg-green-50">+ 공정 추가</button>
                  )}
                </p>
              )}
            </div>

            <DDay dday={dday} className="hidden md:block text-right" />
          </Link>
        )
      })}
    </div>
  )
}

function DDay({ dday, className = '' }: { dday: number | null; className?: string }) {
  if (dday === null) return <span className={`text-sm text-gray-300 flex-shrink-0 ${className}`}>-</span>
  const text = dday > 0 ? `D-${dday}` : dday === 0 ? 'D-day' : `${-dday}일 지남`
  const cls = dday < 0 ? 'text-red-600' : dday <= 7 ? 'text-amber-600' : 'text-gray-500'
  return <span className={`text-sm font-semibold flex-shrink-0 ${cls} ${className}`}>{text}</span>
}

// ── 일 단위 공정표: 오늘 기준 3주, 공정마다 한 줄 ──
const SPAN = 21

export function DayGantt({ infos, today, readOnly, onStatus, onAdd }: {
  infos: Info[]
  today: Date
  readOnly: boolean
  onStatus: (s: Schedule, st: PhaseStatus) => void
  onAdd: (p: Project) => void
}) {
  const [offset, setOffset] = useState(0) // 일 단위 이동 (7일씩)
  const [closed, setClosed] = useState<Record<string, boolean>>({})
  const [picked, setPicked] = useState<{ r: Row; p: Project } | null>(null)

  const winStart = new Date(today.getTime() + (offset - 3) * DAY)
  const winEnd = new Date(winStart.getTime() + (SPAN - 1) * DAY)
  const days = Array.from({ length: SPAN }, (_, i) => new Date(winStart.getTime() + i * DAY))
  const idx = (d: Date) => daysBetween(winStart, d)
  const todayIdx = idx(today)

  // 이 기간에 걸친 공정만
  const groups = infos.map(info => ({
    info,
    rows: info.rows
      .filter(r => r.start && r.end && r.start <= winEnd && r.end >= winStart)
      .sort((a, b) => a.start!.getTime() - b.start!.getTime()),
  }))
  const visible = groups.filter(g => g.rows.length)
  const hiddenCount = groups.length - visible.length

  const grid = { gridTemplateColumns: `var(--name-w) repeat(${SPAN}, minmax(36px, 1fr))` }
  // 날짜 칸 배경 (주말 · 오늘)
  const dayBg = (d: Date, i: number) =>
    i === todayIdx ? 'bg-red-50' : d.getDay() === 0 || d.getDay() === 6 ? 'bg-gray-50' : ''

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* 이동 + 범례 */}
      <div className="flex items-center gap-2 flex-wrap px-4 py-2.5 border-b border-gray-100">
        <div className="flex items-center gap-1">
          <button onClick={() => setOffset(o => o - 7)} className="h-8 px-2.5 text-sm rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50">‹ 1주</button>
          <button onClick={() => setOffset(0)} className={`h-8 px-3 text-sm rounded-md border ${offset === 0 ? 'bg-green-600 border-green-600 text-white' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>오늘</button>
          <button onClick={() => setOffset(o => o + 7)} className="h-8 px-2.5 text-sm rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50">1주 ›</button>
        </div>
        <span className="text-sm text-gray-500">{mdw(winStart)} ~ {mdw(winEnd)}</span>
        <div className="ml-auto flex items-center gap-3 flex-wrap">
          {(['지연', '진행중', '예정', '완료'] as const).map(st => (
            <span key={st} className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className={`w-3 h-3 rounded-sm ${STYLE[st].bar}`} />{st}
            </span>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="text-center py-10 text-sm text-gray-400">이 기간에 잡힌 공정이 없어요</div>
      ) : (
        <div className="overflow-x-auto [--name-w:110px] md:[--name-w:200px]">
          <div className="min-w-max md:min-w-0">
            {/* 날짜 헤더 */}
            <div className="grid border-b border-gray-200 bg-gray-50" style={grid}>
              <div className="sticky left-0 z-20 bg-gray-50 border-r border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-400 flex items-end">현장 · 공정</div>
              {days.map((d, i) => {
                const dow = d.getDay()
                return (
                  <div key={i} className={`text-center py-1.5 border-r border-gray-100 leading-tight ${i === todayIdx ? 'bg-red-500 text-white font-bold' : dow === 0 ? 'text-red-500' : dow === 6 ? 'text-blue-500' : 'text-gray-500'}`}>
                    <div className="text-[11px]">{d.getDate() === 1 || i === 0 ? `${d.getMonth() + 1}/` : ''}{d.getDate()}</div>
                    <div className="text-[11px] opacity-80">{WEEK[dow]}</div>
                  </div>
                )
              })}
            </div>

            {visible.map(({ info, rows }) => {
              const { p } = info
              const open = !closed[p.id]
              return (
                <div key={p.id} className="border-b border-gray-200 last:border-b-0">
                  {/* 현장 줄 */}
                  <div className="grid bg-gray-50/60" style={grid}>
                    {/* 현장명은 날짜 칸 몇 개에 걸쳐 넓게 (폰에서도 안 잘리게) */}
                    <div className="sticky left-0 z-20 bg-gray-50 px-2 md:px-3 py-2 flex items-center gap-1 min-w-0" style={{ gridColumn: '1 / 7' }}>
                      <button onClick={() => setClosed(c => ({ ...c, [p.id]: open }))} className="text-gray-400 hover:text-gray-700 w-4 flex-shrink-0 text-xs" title={open ? '접기' : '펼치기'}>{open ? '▼' : '▶'}</button>
                      <Link href={`/projects/${p.id}`} className={`text-sm font-semibold truncate hover:text-green-600 ${info.kind === 'late' ? 'text-red-600' : 'text-gray-800'}`} title={p.name}>{p.name}</Link>
                      {!readOnly && (
                        <button onClick={() => onAdd(p)} className="ml-1 text-gray-400 hover:text-green-600 text-base flex-shrink-0" title="공정 추가">+</button>
                      )}
                    </div>
                    <div className="flex items-center px-2 text-xs text-gray-400" style={{ gridColumn: `7 / ${SPAN + 2}` }}>
                      {!open && `공정 ${rows.length}개${info.now.length ? ` · 오늘 ${info.now.map(r => r.s.task_name).join(', ')}` : ''}`}
                    </div>
                  </div>

                  {/* 공정 줄 */}
                  {open && rows.map(r => {
                    const a = Math.max(0, idx(r.start!))
                    const b = Math.min(SPAN - 1, idx(r.end!))
                    const st = STYLE[r.status]
                    const cutL = idx(r.start!) < 0, cutR = idx(r.end!) > SPAN - 1
                    const short = b - a < 2 && b < SPAN - 3
                    return (
                      <div key={r.s.id} className="grid border-t border-gray-100" style={grid}>
                        <button onClick={() => setPicked({ r, p })}
                          className="sticky left-0 z-20 bg-white border-r border-gray-200 pl-6 md:pl-8 pr-2 py-1.5 text-left text-xs text-gray-600 truncate hover:text-gray-900"
                          style={{ gridColumn: '1 / 2', gridRow: 1 }} title={r.s.task_name}>{r.s.task_name}</button>
                        {days.map((d, i) => (
                          <div key={i} className={`border-r border-gray-50 ${dayBg(d, i)}`} style={{ gridColumn: `${i + 2} / ${i + 3}`, gridRow: 1 }} />
                        ))}
                        <button onClick={() => setPicked({ r, p })}
                          title={`${r.s.task_name}\n${md(r.start!)} ~ ${md(r.end!)} · ${r.status}`}
                          className={`relative z-10 my-1.5 mx-0.5 h-7 px-2 flex items-center overflow-hidden hover:brightness-95 ${st.bar} ${st.text} ${cutL ? 'rounded-r-md' : cutR ? 'rounded-l-md' : 'rounded-md'} ${cutL && cutR ? 'rounded-none' : ''}`}
                          style={{ gridColumn: `${a + 2} / ${b + 3}`, gridRow: 1 }}>
                          {!short && (
                            <span className="text-xs font-medium whitespace-nowrap truncate">
                              {cutL ? '‹ ' : ''}{r.s.task_name}{b - a >= 2 ? ` · ${md(r.start!)}~${md(r.end!)}` : ''}
                            </span>
                          )}
                        </button>
                        {/* 1~2일짜리 짧은 공정은 이름을 막대 오른쪽에 */}
                        {short && (
                          <span className="relative z-10 self-center px-1.5 text-xs text-gray-700 whitespace-nowrap overflow-hidden"
                            style={{ gridColumn: `${b + 3} / ${SPAN + 2}`, gridRow: 1 }}>{r.s.task_name} · {md(r.start!)}{b > a ? `~${md(r.end!)}` : ''}</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {hiddenCount > 0 && visible.length > 0 && (
        <p className="px-4 py-2 text-xs text-gray-400 border-t border-gray-100">이 기간에 공정이 없는 현장 {hiddenCount}곳은 숨겼어요</p>
      )}

      {/* 공정 누르면: 정보 + 상태 바로 변경 */}
      {picked && (() => {
        const { r, p } = picked
        const ps = (r.s.phase_status || '예정') as PhaseStatus
        return (
          <div className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setPicked(null)}>
            <div className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl shadow-xl p-5" onClick={e => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="min-w-0">
                  <p className="text-xs text-gray-400 truncate">{p.name}</p>
                  <h3 className="text-base font-bold text-gray-900 break-keep">{r.s.task_name}</h3>
                </div>
                <button onClick={() => setPicked(null)} className="text-gray-400 text-2xl leading-none">&times;</button>
              </div>
              <p className="text-sm text-gray-500">
                {mdw(r.start!)}{r.end! > r.start! ? ` ~ ${mdw(r.end!)}` : ''}
                {r.s.manager ? ` · 담당 ${r.s.manager}` : ''}
              </p>
              {r.s.vendor && <p className="text-sm text-gray-500">업체 {r.s.vendor} {r.s.vendor_booked ? '(확정)' : '(미확정)'}</p>}
              {r.status === '지연' && <p className="mt-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">종료일이 지났는데 아직 완료로 체크되지 않았어요</p>}

              {!readOnly ? (
                <>
                  <p className="text-xs text-gray-400 mt-4 mb-2">상태 변경</p>
                  <div className="grid grid-cols-3 gap-2">
                    {(['예정', '진행중', '완료'] as const).map(st => {
                      const on = ps === st
                      const color = st === '완료' ? 'bg-green-500 border-green-500 text-white' : st === '진행중' ? 'bg-blue-500 border-blue-500 text-white' : 'bg-gray-300 border-gray-300 text-gray-800'
                      return (
                        <button key={st} onClick={() => { if (!on) onStatus(r.s, st); setPicked(null) }}
                          className={`py-2.5 rounded-lg text-sm font-medium border ${on ? color : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                          {on ? '✓ ' : ''}{st}
                        </button>
                      )
                    })}
                  </div>
                </>
              ) : (
                <p className="mt-4 text-sm">현재 상태: <b>{r.status}</b></p>
              )}
              <Link href={`/projects/${p.id}?tab=공정`}
                className="mt-3 block text-center w-full py-2.5 rounded-lg text-sm border border-gray-300 text-gray-700 hover:bg-gray-50">
                현장에서 자세히 보기 →
              </Link>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

// ── 공정 추가 ──
export function AddPhaseModal({ project, onClose, onSaved }: { project: Project; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ task_name: '', scheduled_date: '', end_date: '' })
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.scheduled_date) return
    setSaving(true)
    const { error } = await supabase.from('schedules').insert([{
      project_id: project.id,
      task_name: form.task_name,
      scheduled_date: form.scheduled_date,
      end_date: form.end_date || null,
    }])
    setSaving(false)
    if (error) { toast('공정 저장 실패: ' + error.message); return }
    notifyOthers(undefined, { type: 'schedule', title: `${project.name} · 공정 추가`, body: `${form.task_name} (${form.scheduled_date})`, link: `/projects/${project.id}?tab=공정` })
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <div className="min-w-0">
            <h2 className="text-base font-bold">공정 추가</h2>
            <p className="text-xs text-gray-400 truncate">{project.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 text-2xl">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-4">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1.5">공정명 *</label>
            <input required value={form.task_name}
              onChange={e => setForm({ ...form, task_name: e.target.value })}
              placeholder="예) 목공, 타일, 도배, 입주청소..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1.5">시작일 *</label>
              <input required type="date" value={form.scheduled_date}
                onChange={e => setForm({ ...form, scheduled_date: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1.5">종료일</label>
              <input type="date" value={form.end_date}
                onChange={e => setForm({ ...form, end_date: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose}
              className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm">취소</button>
            <button type="submit" disabled={saving}
              className="flex-1 bg-green-600 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
              {saving ? '저장 중...' : '추가'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
