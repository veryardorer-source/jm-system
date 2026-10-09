'use client'

import { useState } from 'react'
import Link from 'next/link'
import { supabase, Project, Schedule, PhaseStatus, STATUS_LIST, STATUS_COLOR, HIDDEN_STATUSES } from '@/lib/supabase'
import { notifyOthers } from '@/lib/notify'
import { toast } from '@/components/Toaster'
import { buildRows, parseDate, md, mdw, daysBetween, STYLE, type Row } from '@/components/ProjectGantt'

// 대시보드 · 진행중인 현장 — 현장마다 한 줄: 현장명 · 단계 · 오늘 앞뒤 1주 공정 · 마감
// (전체 공정일정은 현장 상세에서)
const DAY = 86400000
const RANGE = 7 // 오늘 앞뒤 며칠까지 보여줄지
const MAX_CHIPS = 6
// 진행중 현장의 단계 (완료·중단 제외) — 정렬용
export const STAGES = STATUS_LIST.filter(s => !HIDDEN_STATUSES.includes(s as typeof HIDDEN_STATUSES[number]))

// 현장별 공정 요약
export type Kind = 'late' | 'ok' | 'empty'
export type Info = {
  p: Project
  late: Row[]     // 지연 (기간 상관없이 — 완료 체크가 필요하므로)
  now: Row[]      // 오늘 작업
  week: Row[]     // 대시보드에 보여줄 공정: 지연 + 오늘 앞뒤 1주에 걸친 미완료 공정
  doneInWeek: number
  kind: Kind
}
export type Filter = 'all' | 'now' | 'late' | 'empty'

const ORDER: Record<string, number> = { '지연': 0, '진행중': 1, '예정': 2, '완료': 3 }

export function summarize(p: Project, schedules: Schedule[], today: Date): Info {
  const rows = buildRows(schedules.filter(s => s.project_id === p.id), today)
  const from = new Date(today.getTime() - RANGE * DAY), to = new Date(today.getTime() + RANGE * DAY)
  const inWeek = (r: Row) => !!(r.start && r.end && r.start <= to && r.end >= from)
  const byStart = (a: Row, b: Row) => (a.start?.getTime() ?? Infinity) - (b.start?.getTime() ?? Infinity)
  const late = rows.filter(r => r.status === '지연').sort(byStart)
  const now = rows.filter(r => r.status !== '완료' && r.status !== '지연' && r.start && r.end && r.start <= today && today <= r.end).sort(byStart)
  const week = rows.filter(r => r.status === '지연' || (r.status !== '완료' && inWeek(r)))
    .sort((a, b) => (ORDER[a.status] - ORDER[b.status]) || byStart(a, b))
  const doneInWeek = rows.filter(r => r.status === '완료' && inWeek(r)).length
  const kind: Kind = rows.length === 0 ? 'empty' : late.length ? 'late' : 'ok'
  return { p, late, now, week, doneInWeek, kind }
}

// 칩에 쓸 짧은 날짜 설명
export function chipWhen(r: Row, today: Date) {
  if (!r.start || !r.end) return ''
  if (r.status === '지연') return `${daysBetween(r.end, today)}일 지남`
  if (r.status === '진행중') return `~${md(r.end)}`
  return r.end > r.start ? `${md(r.start)}~${md(r.end)}` : md(r.start)
}

// ── 현황판: 현장마다 한 줄 (폰에서는 카드) ──
export function StatusBoard({ infos, today, readOnly, onAdd, onPick }: {
  infos: Info[]
  today: Date
  readOnly: boolean
  onAdd: (p: Project) => void
  onPick: (r: Row, p: Project) => void
}) {
  if (infos.length === 0) {
    return <div className="bg-white rounded-xl border border-gray-200 text-center py-8 text-sm text-gray-400">해당하는 현장이 없어요</div>
  }
  const cols = 'md:grid md:grid-cols-[minmax(160px,220px)_84px_minmax(0,1fr)_76px] md:items-center md:gap-4'
  const stop = (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation() }
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className={`hidden ${cols} px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-400`}>
        <span>현장</span><span>단계</span><span>이번 주 앞뒤 공정</span><span className="text-right">마감</span>
      </div>
      {infos.map(info => {
        const { p, week, doneInWeek, kind } = info
        const end = parseDate(p.end_date)
        const dday = end ? daysBetween(today, end) : null
        const stage = <span className={`text-xs px-2 py-0.5 rounded-full font-medium border whitespace-nowrap ${STATUS_COLOR[p.status] || ''}`}>{p.status}</span>
        return (
          <Link key={p.id} href={`/projects/${p.id}`}
            className={`block ${cols} px-4 py-3 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors`}>
            {/* 현장명 (+ 폰: 단계·마감 같은 줄) */}
            <div className="flex items-center gap-2 min-w-0">
              <div className="min-w-0 flex-1 md:flex-none md:w-full">
                <p className={`text-[15px] font-semibold truncate ${kind === 'late' ? 'text-red-600' : 'text-gray-900'}`}>{p.name}</p>
                {p.manager && <p className="text-xs text-gray-400 truncate">담당 {p.manager}</p>}
              </div>
              <span className="md:hidden flex-shrink-0">{stage}</span>
              <DDay dday={dday} className="md:hidden" />
            </div>

            <div className="hidden md:block">{stage}</div>

            {/* 이번 주 앞뒤 공정 — 누르면 상태 바로 변경 */}
            <div className="mt-2 md:mt-0 flex flex-wrap items-center gap-1.5 min-w-0">
              {week.slice(0, MAX_CHIPS).map(r => (
                <button key={r.s.id} type="button" onClick={e => { stop(e); onPick(r, p) }}
                  className={`text-xs px-2.5 py-1 rounded-full font-medium hover:brightness-95 ${STYLE[r.status].chip}`}>
                  {r.s.task_name} <span className="font-normal opacity-80">{r.status === '진행중' || r.status === '지연' ? `${r.status} ` : ''}{chipWhen(r, today)}</span>
                </button>
              ))}
              {week.length > MAX_CHIPS && <span className="text-xs text-gray-400">+{week.length - MAX_CHIPS}</span>}
              {week.length > 0 && doneInWeek > 0 && <span className="text-xs text-gray-400">완료 {doneInWeek}</span>}
              {week.length === 0 && (
                kind === 'empty' ? <span className="text-sm text-gray-400">등록된 공정 없음</span> :
                <span className="text-sm text-gray-400">이번 2주 공정 없음{doneInWeek ? ` · 완료 ${doneInWeek}` : ''}</span>
              )}
              {!readOnly && (week.length === 0 || kind === 'empty') && (
                <button type="button" onClick={e => { stop(e); onAdd(p) }}
                  className="text-xs text-green-600 border border-green-300 rounded-full px-2 py-0.5 hover:bg-green-50">+ 공정</button>
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
  return <span className={`text-sm font-semibold flex-shrink-0 whitespace-nowrap ${cls} ${className}`}>{text}</span>
}

// ── 공정 누르면: 정보 + 상태 바로 변경 ──
export function PhaseQuickModal({ r, p, readOnly, onStatus, onClose }: {
  r: Row
  p: Project
  readOnly: boolean
  onStatus: (s: Schedule, st: PhaseStatus) => void
  onClose: () => void
}) {
  const ps = (r.s.phase_status || '예정') as PhaseStatus
  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl shadow-xl p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="min-w-0">
            <p className="text-xs text-gray-400 truncate">{p.name}</p>
            <h3 className="text-base font-bold text-gray-900 break-keep">{r.s.task_name}</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 text-2xl leading-none">&times;</button>
        </div>
        <p className="text-sm text-gray-500">
          {r.start ? mdw(r.start) : '날짜 미정'}{r.start && r.end && r.end > r.start ? ` ~ ${mdw(r.end)}` : ''}
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
                  <button key={st} onClick={() => { if (!on) onStatus(r.s, st); onClose() }}
                    className={`py-3 rounded-lg text-sm font-medium border ${on ? color : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
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
          현장 전체 공정 보기 →
        </Link>
      </div>
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
