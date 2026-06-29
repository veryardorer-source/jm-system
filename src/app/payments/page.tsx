'use client'

import { useEffect, useState, useMemo } from 'react'
import Sidebar from '@/components/Sidebar'
import { supabase } from '@/lib/supabase'

const PAYMENT_TYPES = ['계약금', '중도금', '잔금', '기타']
const TYPE_COLOR: Record<string, string> = {
  '계약금': 'bg-blue-50 text-blue-600',
  '중도금': 'bg-purple-50 text-purple-600',
  '잔금': 'bg-green-50 text-green-600',
  '기타': 'bg-gray-100 text-gray-500',
}

type Payment = {
  id: string
  project_id: string | null
  project_name: string
  type: string
  amount: number
  due_date: string | null
  paid_date: string | null
  paid: boolean
  note: string | null
  created_at: string
}

type Proj = { id: string; name: string }

const today = () => new Date().toISOString().slice(0, 10)

function formatAmount(n: number | null) {
  if (!n && n !== 0) return '-'
  const num = Number(n)
  if (num >= 100000000) return `${(num / 100000000).toFixed(num % 100000000 === 0 ? 0 : 1)}억`
  if (num >= 10000) return `${Math.floor(num / 10000).toLocaleString()}만원`
  return `${num.toLocaleString()}원`
}

const EMPTY = { project_name: '', type: '계약금', amount: '', due_date: '', paid_date: '', paid: false, note: '' }

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [projects, setProjects] = useState<Proj[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<typeof EMPTY>(EMPTY)
  const [filterProject, setFilterProject] = useState('전체')
  const [showPaid, setShowPaid] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [{ data: pay }, { data: proj }] = await Promise.all([
      supabase.from('payments').select('*').order('due_date', { ascending: true, nullsFirst: false }),
      supabase.from('projects').select('id, name').order('created_at', { ascending: false }),
    ])
    setPayments(pay || [])
    setProjects(proj || [])
    setLoading(false)
  }

  // 현장명 자동완성 후보 (등록 현장 + 기존 수금에 쓰인 이름)
  const nameOptions = useMemo(() => {
    const set = new Set<string>()
    projects.forEach(p => set.add(p.name))
    payments.forEach(p => p.project_name && set.add(p.project_name))
    return Array.from(set)
  }, [projects, payments])

  // 통계
  const totalExpected = payments.reduce((s, p) => s + Number(p.amount || 0), 0)
  const totalReceived = payments.filter(p => p.paid).reduce((s, p) => s + Number(p.amount || 0), 0)
  const totalPending = totalExpected - totalReceived
  const overdue = payments.filter(p => !p.paid && p.due_date && p.due_date < today())

  const projectNames = useMemo(() => Array.from(new Set(payments.map(p => p.project_name).filter(Boolean))).sort(), [payments])

  const filtered = payments.filter(p => {
    const projOk = filterProject === '전체' || p.project_name === filterProject
    const paidOk = showPaid ? true : !p.paid
    return projOk && paidOk
  }).sort((a, b) => {
    if (!a.paid && b.paid) return -1
    if (a.paid && !b.paid) return 1
    return (a.due_date || '') > (b.due_date || '') ? 1 : -1
  })

  function openAdd() {
    setEditingId(null)
    setForm(EMPTY)
    setShowForm(true)
  }
  function openEdit(p: Payment) {
    setEditingId(p.id)
    setForm({ project_name: p.project_name, type: p.type, amount: String(p.amount), due_date: p.due_date || '', paid_date: p.paid_date || '', paid: p.paid, note: p.note || '' })
    setShowForm(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.amount || !form.project_name.trim()) return
    setSaving(true)
    const matched = projects.find(p => p.name === form.project_name.trim())
    const row = {
      project_name: form.project_name.trim(),
      project_id: matched?.id || null,
      type: form.type,
      amount: Number(form.amount),
      due_date: form.due_date || null,
      paid_date: form.paid_date || null,
      paid: Boolean(form.paid),
      note: form.note || null,
    }
    if (editingId) await supabase.from('payments').update(row).eq('id', editingId)
    else await supabase.from('payments').insert([row])
    setShowForm(false)
    setEditingId(null)
    setSaving(false)
    fetchAll()
  }

  async function togglePaid(p: Payment) {
    const paid = !p.paid
    await supabase.from('payments').update({ paid, paid_date: paid ? (p.paid_date || today()) : null }).eq('id', p.id)
    setPayments(ps => ps.map(x => x.id === p.id ? { ...x, paid, paid_date: paid ? (x.paid_date || today()) : null } : x))
  }

  async function remove(p: Payment) {
    if (!confirm('삭제할까요?')) return
    await supabase.from('payments').delete().eq('id', p.id)
    setPayments(ps => ps.filter(x => x.id !== p.id))
  }

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <header className="bg-white border-b border-gray-200 px-4 md:px-8 py-4 md:py-5 flex items-center justify-between flex-shrink-0">
          <div>
            <h1 className="text-xl font-bold text-gray-900">수금 관리</h1>
            <p className="text-sm text-gray-500 mt-0.5">현장별 계약금·중도금·잔금 입금 현황</p>
          </div>
          <button onClick={openAdd} className="bg-green-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-green-700">+ 수금 추가</button>
        </header>

        <div className="flex-1 overflow-auto px-4 md:px-8 py-4 md:py-6 pb-24 md:pb-6">
          {loading ? (
            <div className="text-center py-16 text-gray-400">불러오는 중...</div>
          ) : (
            <div className="max-w-3xl mx-auto flex flex-col gap-4">
              {/* 요약 */}
              <div className="grid grid-cols-3 gap-2 md:gap-3">
                <div className="bg-white rounded-xl p-3 md:p-4 border border-gray-100 text-center shadow-sm">
                  <div className="text-base md:text-xl font-bold text-gray-800">{formatAmount(totalExpected)}</div>
                  <div className="text-[11px] md:text-xs text-gray-400 mt-0.5">총 계약금액</div>
                </div>
                <div className="bg-white rounded-xl p-3 md:p-4 border border-gray-100 text-center shadow-sm">
                  <div className="text-base md:text-xl font-bold text-green-600">{formatAmount(totalReceived)}</div>
                  <div className="text-[11px] md:text-xs text-gray-400 mt-0.5">수금 완료</div>
                </div>
                <div className="bg-white rounded-xl p-3 md:p-4 border border-gray-100 text-center shadow-sm">
                  <div className={`text-base md:text-xl font-bold ${totalPending > 0 ? 'text-orange-500' : 'text-gray-400'}`}>{formatAmount(totalPending)}</div>
                  <div className="text-[11px] md:text-xs text-gray-400 mt-0.5">미수금</div>
                </div>
              </div>

              {totalExpected > 0 && (
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${Math.round((totalReceived / totalExpected) * 100)}%` }} />
                </div>
              )}

              {overdue.length > 0 && (
                <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 flex items-center gap-2 flex-wrap">
                  <span className="text-red-500">⚠</span>
                  <span className="text-sm text-red-600 font-medium">예정일 지난 미수금 {overdue.length}건</span>
                  <span className="text-sm text-red-500 font-semibold">{formatAmount(overdue.reduce((s, p) => s + Number(p.amount || 0), 0))}</span>
                </div>
              )}

              {/* 필터 */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <select value={filterProject} onChange={e => setFilterProject(e.target.value)}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500">
                  <option value="전체">전체 현장 ({payments.length})</option>
                  {projectNames.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                <label className="flex items-center gap-1.5 text-sm text-gray-500 cursor-pointer">
                  <input type="checkbox" checked={showPaid} onChange={e => setShowPaid(e.target.checked)} className="rounded" />
                  수금완료 포함
                </label>
              </div>

              {/* 목록 */}
              {filtered.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-200 text-center py-16 text-gray-400">
                  <p className="text-4xl mb-3">💰</p>
                  <p className="font-medium">수금 내역이 없어요</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {filtered.map(p => {
                    const isOverdue = !p.paid && p.due_date && p.due_date < today()
                    return (
                      <div key={p.id} className={`bg-white rounded-xl px-4 py-3.5 border shadow-sm ${isOverdue ? 'border-red-100' : p.paid ? 'border-green-100' : 'border-gray-100'} ${p.paid ? 'opacity-75' : ''}`}>
                        <div className="flex items-center gap-3">
                          <button onClick={() => togglePaid(p)}
                            className={`w-6 h-6 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${p.paid ? 'bg-green-500 border-green-500' : isOverdue ? 'border-red-300' : 'border-gray-300 hover:border-green-400'}`}>
                            {p.paid && <span className="text-white text-xs">✓</span>}
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-sm font-medium ${p.paid ? 'text-gray-400' : 'text-gray-800'}`}>{p.project_name}</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full ${TYPE_COLOR[p.type] || 'bg-gray-100 text-gray-500'}`}>{p.type}</span>
                              {isOverdue && <span className="text-[11px] text-red-500 font-medium">연체</span>}
                            </div>
                            <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                              <span className={`text-sm font-semibold ${p.paid ? 'text-green-600' : 'text-orange-500'}`}>{Number(p.amount).toLocaleString()}원</span>
                              {p.due_date && <span className={`text-[11px] ${isOverdue ? 'text-red-500' : 'text-gray-400'}`}>예정 {p.due_date}</span>}
                              {p.paid_date && <span className="text-[11px] text-green-500">입금 {p.paid_date}</span>}
                            </div>
                            {p.note && <div className="text-xs text-gray-400 mt-0.5">{p.note}</div>}
                          </div>
                          <div className="flex gap-1 flex-shrink-0">
                            <button onClick={() => openEdit(p)} className="text-gray-300 hover:text-green-500 text-sm px-1">✎</button>
                            <button onClick={() => remove(p)} className="text-gray-300 hover:text-red-400 text-lg leading-none px-1">×</button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 추가/수정 모달 */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold">{editingId ? '수금 수정' : '수금 추가'}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 text-2xl">&times;</button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-3.5">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">현장 *</label>
                <input list="proj-names" value={form.project_name} onChange={e => setForm(f => ({ ...f, project_name: e.target.value }))}
                  placeholder="현장 선택 또는 직접 입력" required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                <datalist id="proj-names">{nameOptions.map(n => <option key={n} value={n} />)}</datalist>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1.5">구분</label>
                  <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                    {PAYMENT_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1.5">금액(원) *</label>
                  <input type="number" inputMode="numeric" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                    placeholder="10000000" required
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1.5">입금 예정일</label>
                  <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1.5">실제 입금일</label>
                  <input type="date" value={form.paid_date} onChange={e => setForm(f => ({ ...f, paid_date: e.target.value, paid: !!e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">메모</label>
                <input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="메모..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.paid} onChange={e => setForm(f => ({ ...f, paid: e.target.checked }))} className="rounded" />
                <span className="text-sm text-gray-600">수금 완료</span>
              </label>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm">취소</button>
                <button type="submit" disabled={saving} className="flex-1 bg-green-600 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
                  {saving ? '저장 중...' : editingId ? '수정 완료' : '추가'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
