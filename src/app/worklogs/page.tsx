'use client'

import { useEffect, useState } from 'react'
import Sidebar from '@/components/Sidebar'
import { supabase } from '@/lib/supabase'
import { useAuth, canEdit } from '@/lib/auth-context'
import { notifyOthers } from '@/lib/notify'

type WorkLog = {
  id: string
  log_date: string
  today_work: string
  tomorrow_work: string
  memo: string
  author: string
  author_id: string | null
  created_at: string
}

const today = () => new Date().toISOString().slice(0, 10)
const EMPTY = { log_date: today(), today_work: '', tomorrow_work: '', memo: '' }

export default function WorkLogsPage() {
  const { profile } = useAuth()
  const readOnly = !canEdit(profile)
  const [logs, setLogs] = useState<WorkLog[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<typeof EMPTY>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [filterMine, setFilterMine] = useState(false)

  useEffect(() => { fetchLogs() }, [])

  async function fetchLogs() {
    setLoading(true)
    const { data } = await supabase.from('work_logs').select('*').order('log_date', { ascending: false }).order('created_at', { ascending: false })
    setLogs(data || [])
    setLoading(false)
  }

  function openAdd() {
    setEditingId(null)
    setForm({ ...EMPTY, log_date: today() })
    setShowForm(true)
  }
  function openEdit(l: WorkLog) {
    setEditingId(l.id)
    setForm({ log_date: l.log_date, today_work: l.today_work || '', tomorrow_work: l.tomorrow_work || '', memo: l.memo || '' })
    setShowForm(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.log_date) return
    setSaving(true)
    if (editingId) {
      await supabase.from('work_logs').update({
        log_date: form.log_date, today_work: form.today_work, tomorrow_work: form.tomorrow_work, memo: form.memo,
      }).eq('id', editingId)
    } else {
      await supabase.from('work_logs').insert([{
        log_date: form.log_date, today_work: form.today_work, tomorrow_work: form.tomorrow_work, memo: form.memo,
        author: profile?.name || '', author_id: profile?.id || null,
      }])
      notifyOthers(profile?.id, { type: 'worklog', title: `새 작업일지 · ${profile?.name || ''}`.trim(), body: form.log_date, link: '/worklogs' })
    }
    setShowForm(false)
    setEditingId(null)
    setSaving(false)
    fetchLogs()
  }

  async function remove(l: WorkLog) {
    if (!confirm('이 작업일지를 삭제할까요?')) return
    await supabase.from('work_logs').delete().eq('id', l.id)
    setLogs(ls => ls.filter(x => x.id !== l.id))
  }

  const visible = filterMine ? logs.filter(l => l.author_id === profile?.id) : logs

  const fmtDate = (d: string) => {
    const dt = new Date(d + 'T00:00:00')
    const wd = ['일', '월', '화', '수', '목', '금', '토'][dt.getDay()]
    return `${dt.getMonth() + 1}월 ${dt.getDate()}일 (${wd})`
  }

  if (profile?.role === 'partner') return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <Sidebar />
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">접근 권한이 없습니다.</div>
    </div>
  )

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <header className="bg-white border-b border-gray-200 px-4 md:px-8 py-4 md:py-5 flex items-center justify-between flex-shrink-0">
          <div>
            <h1 className="text-xl font-bold text-gray-900">작업일지</h1>
            <p className="text-sm text-gray-500 mt-0.5">하루 업무 기록 · 총 {logs.length}건</p>
          </div>
          {!readOnly && (
            <button onClick={openAdd} className="bg-green-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-green-700">+ 작업일지 작성</button>
          )}
        </header>

        <div className="flex-1 overflow-auto px-4 md:px-8 py-4 md:py-6 pb-24 md:pb-6">
          <div className="max-w-2xl mx-auto flex flex-col gap-4">
            <label className="flex items-center gap-1.5 text-sm text-gray-500 cursor-pointer self-end">
              <input type="checkbox" checked={filterMine} onChange={e => setFilterMine(e.target.checked)} className="rounded" />
              내 작업일지만 보기
            </label>

            {loading ? (
              <div className="text-center py-16 text-gray-400">불러오는 중...</div>
            ) : visible.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 text-center py-16 text-gray-400">
                <p className="text-4xl mb-3">📒</p>
                <p className="font-medium">작성된 작업일지가 없어요</p>
              </div>
            ) : (
              visible.map(l => (
                <div key={l.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-gray-800">{fmtDate(l.log_date)}</span>
                      {l.author && <span className="text-xs text-gray-400">· {l.author}</span>}
                    </div>
                    {!readOnly && (
                      <div className="flex gap-2">
                        <button onClick={() => openEdit(l)} className="text-xs text-green-600 hover:text-green-800">수정</button>
                        <button onClick={() => remove(l)} className="text-xs text-red-400 hover:text-red-600">삭제</button>
                      </div>
                    )}
                  </div>
                  <div className="px-5 py-4 flex flex-col gap-3">
                    <Field label="오늘 한 업무" value={l.today_work} accent="text-green-600" />
                    <Field label="내일 해야할 업무" value={l.tomorrow_work} accent="text-blue-600" />
                    {l.memo && <Field label="메모" value={l.memo} accent="text-gray-500" />}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl max-h-[92vh] overflow-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white">
              <h2 className="text-lg font-bold">{editingId ? '작업일지 수정' : '작업일지 작성'}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 text-2xl">&times;</button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">날짜 *</label>
                <input type="date" required value={form.log_date} onChange={e => setForm(f => ({ ...f, log_date: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">오늘 한 업무</label>
                <textarea value={form.today_work} onChange={e => setForm(f => ({ ...f, today_work: e.target.value }))} rows={4}
                  placeholder="오늘 진행한 업무를 적어주세요"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-y leading-relaxed" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">내일 해야할 업무</label>
                <textarea value={form.tomorrow_work} onChange={e => setForm(f => ({ ...f, tomorrow_work: e.target.value }))} rows={4}
                  placeholder="내일 할 업무를 적어주세요"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-y leading-relaxed" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">메모</label>
                <textarea value={form.memo} onChange={e => setForm(f => ({ ...f, memo: e.target.value }))} rows={3}
                  placeholder="기타 메모"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-y leading-relaxed" />
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm">취소</button>
                <button type="submit" disabled={saving} className="flex-1 bg-green-600 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
                  {saving ? '저장 중...' : editingId ? '수정 완료' : '저장'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div>
      <p className={`text-xs font-semibold mb-1 ${accent}`}>{label}</p>
      <p className="text-sm text-gray-700 whitespace-pre-wrap">{value || <span className="text-gray-300">-</span>}</p>
    </div>
  )
}
