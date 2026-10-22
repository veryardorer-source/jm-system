'use client'

// 사무실 일정 추가·수정 — 상담·방문·회의·연차처럼 현장 공정이 아닌 일정
import { useState } from 'react'
import { supabase, type Project } from '@/lib/supabase'
import { toast } from '@/components/Toaster'
import { EVENT_KINDS, type OfficeEvent } from '@/components/WeekCalendar'

export default function OfficeEventModal({ event, date, projects, who, readOnly, onClose, onSaved }: {
  event: OfficeEvent | null        // null = 새 일정
  date: string                     // 새 일정 기본 날짜 (YYYY-MM-DD)
  projects: Project[]
  who: string
  readOnly: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState(event?.title || '')
  const [kind, setKind] = useState(event?.kind || '상담')
  const [eventDate, setEventDate] = useState(event?.event_date || date)
  const [endDate, setEndDate] = useState(event?.end_date || '')
  const [person, setPerson] = useState(event?.person || '')
  const [projectId, setProjectId] = useState(event?.project_id || '')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!title.trim() && kind !== '연차' && kind !== '반차') { toast('내용을 적어 주세요'); return }
    setSaving(true)
    const row = {
      title: title.trim() || kind,
      kind,
      event_date: eventDate,
      end_date: endDate && endDate > eventDate ? endDate : null,
      person: person.trim() || null,
      project_id: projectId || null,
    }
    const { error } = event
      ? await supabase.from('office_events').update(row).eq('id', event.id)
      : await supabase.from('office_events').insert([{ ...row, created_by: who }])
    setSaving(false)
    if (error) { toast('저장 실패: ' + error.message); return }
    toast(event ? '일정을 고쳤어요' : '일정을 추가했어요')
    onSaved()
  }

  async function remove() {
    if (!event || !confirm(`"${event.title}" 일정을 지울까요?`)) return
    const { error } = await supabase.from('office_events').delete().eq('id', event.id)
    if (error) { toast('삭제 실패: ' + error.message); return }
    toast('일정을 지웠어요')
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-gray-900">{event ? '사무실 일정' : '사무실 일정 추가'}</h3>
          <button onClick={onClose} className="text-gray-400 text-2xl leading-none">&times;</button>
        </div>

        <div className="flex flex-wrap gap-1.5 mb-3">
          {EVENT_KINDS.map(k => (
            <button key={k} disabled={readOnly} onClick={() => setKind(k)}
              className={`px-3 py-1.5 rounded-full text-sm border ${kind === k ? 'bg-green-600 border-green-600 text-white' : 'bg-white border-gray-200 text-gray-600'}`}>{k}</button>
          ))}
        </div>

        <label className="block text-xs text-gray-500 mb-1">내용</label>
        <input value={title} onChange={e => setTitle(e.target.value)} disabled={readOnly}
          placeholder={kind === '상담' ? '예) 신규 고객 상담 — 방이동 24평' : kind === '방문' ? '예) 현장 방문 — 바닥 타일 샘플' : kind === '연차' || kind === '반차' ? '비워 두면 "연차"로 표시돼요' : '내용'}
          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm mb-3 focus:outline-none focus:border-green-500" />

        <div className="grid grid-cols-2 gap-2 mb-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">날짜</label>
            <input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} disabled={readOnly}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">끝나는 날 (여러 날일 때)</label>
            <input type="date" value={endDate} min={eventDate} onChange={e => setEndDate(e.target.value)} disabled={readOnly}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">누구</label>
            <input value={person} onChange={e => setPerson(e.target.value)} disabled={readOnly} placeholder="예) 이한국"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">관련 현장 (선택)</label>
            <select value={projectId} onChange={e => setProjectId(e.target.value)} disabled={readOnly}
              className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white">
              <option value="">없음</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>

        {!readOnly && (
          <div className="flex gap-2">
            {event && <button onClick={remove} className="px-4 py-2.5 rounded-lg border border-red-200 text-red-500 text-sm">삭제</button>}
            <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-lg bg-green-600 text-white text-sm font-medium disabled:opacity-50">
              {saving ? '저장 중…' : '저장'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
