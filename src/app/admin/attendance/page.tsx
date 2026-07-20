'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase-browser'

type Employee = { id: string; name: string; is_active: boolean }
type Att = { id: string; employee_id: string; att_date: string; att_type: string; memo: string | null }

const ATT_TYPES = ['연차', '반차', '조퇴', '결근', '지각', '기타']
const ATT_COLOR: Record<string, string> = {
  '연차': 'bg-blue-100 text-blue-700', '반차': 'bg-sky-100 text-sky-700',
  '조퇴': 'bg-amber-100 text-amber-700', '지각': 'bg-amber-100 text-amber-700',
  '결근': 'bg-red-100 text-red-700', '기타': 'bg-gray-100 text-gray-600',
}
const thisMonth = () => new Date().toISOString().slice(0, 7)

export default function AttendancePage() {
  const router = useRouter()
  const { profile: myProfile, loading: authLoading } = useAuth()
  const [emps, setEmps] = useState<Employee[]>([])
  const [list, setList] = useState<Att[]>([])       // 선택한 연도 전체 (집계용)
  const [month, setMonth] = useState(thisMonth())    // 'YYYY-MM'
  const [typeFilter, setTypeFilter] = useState('전체')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Att | null>(null)
  const [form, setForm] = useState({ employee_id: '', att_date: '', att_type: '연차', memo: '' })
  const [saving, setSaving] = useState(false)

  const year = month.slice(0, 4)

  const load = useCallback(async () => {
    setLoading(true)
    const sb = createClient()
    const [{ data: e }, { data: a }] = await Promise.all([
      sb.from('employees').select('id, name, is_active').order('name'),
      sb.from('employee_attendance').select('*')
        .gte('att_date', `${year}-01-01`).lte('att_date', `${year}-12-31`)
        .order('att_date', { ascending: false }),
    ])
    setEmps(e || [])
    setList(a || [])
    setLoading(false)
  }, [year])

  useEffect(() => {
    if (!authLoading) {
      if (!myProfile || myProfile.role !== 'admin') { router.push('/'); return }
      load()
    }
  }, [authLoading, myProfile, load, router])

  const nameOf = (id: string) => emps.find(e => e.id === id)?.name || '(퇴사/삭제)'

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!form.employee_id || !form.att_date) return
    setSaving(true)
    const sb = createClient()
    const payload = { employee_id: form.employee_id, att_date: form.att_date, att_type: form.att_type, memo: form.memo || null }
    const { error } = editing
      ? await sb.from('employee_attendance').update(payload).eq('id', editing.id)
      : await sb.from('employee_attendance').insert([payload])
    setSaving(false)
    if (error) { alert('저장 실패: ' + error.message); return }
    setShowForm(false); setEditing(null)
    setForm({ employee_id: '', att_date: '', att_type: '연차', memo: '' })
    load()
  }

  async function del(a: Att) {
    if (!confirm(`${nameOf(a.employee_id)} · ${a.att_date} ${a.att_type} 기록을 삭제할까요?`)) return
    const sb = createClient()
    await sb.from('employee_attendance').delete().eq('id', a.id)
    load()
  }

  function openEdit(a: Att) {
    setEditing(a)
    setForm({ employee_id: a.employee_id, att_date: a.att_date, att_type: a.att_type, memo: a.memo || '' })
    setShowForm(true)
  }

  // 이번 달 목록 (유형 필터 적용)
  const monthList = list.filter(a => a.att_date?.startsWith(month))
    .filter(a => typeFilter === '전체' || a.att_type === typeFilter)

  // 직원별 연간 집계 (연차는 반차=0.5일로 합산한 '연차 사용일'도 표시)
  const activeEmps = emps.filter(e => e.is_active !== false)
  const yearCount = (empId: string, type: string) => list.filter(a => a.employee_id === empId && a.att_type === type).length
  const annualUsed = (empId: string) => yearCount(empId, '연차') + yearCount(empId, '반차') * 0.5

  if (authLoading || !myProfile || myProfile.role !== 'admin') return null

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <header className="bg-white border-b border-gray-200 px-4 md:px-8 py-4 md:py-5 flex items-center justify-between flex-shrink-0">
          <div>
            <h1 className="text-xl font-bold text-gray-900">근태 관리</h1>
            <p className="text-sm text-gray-500 mt-0.5">연차·조퇴·결근 기록 (관리자 전용)</p>
          </div>
          <button onClick={() => { setEditing(null); setForm({ employee_id: activeEmps[0]?.id || '', att_date: new Date().toISOString().slice(0, 10), att_type: '연차', memo: '' }); setShowForm(true) }}
            className="bg-green-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-green-700">+ 기록 추가</button>
        </header>

        <div className="flex-1 overflow-auto px-4 md:px-8 py-4 md:py-6 pb-20 md:pb-6">
          {/* 직원별 연간 집계 */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto mb-5">
            <p className="text-xs text-gray-400 px-4 pt-3">{year}년 직원별 집계 · 연차 사용일 = 연차 1일 + 반차 0.5일</p>
            <table className="w-full whitespace-nowrap text-sm mt-1">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left text-xs font-semibold text-gray-400 px-4 py-2">직원</th>
                  <th className="text-right text-xs font-semibold text-blue-500 px-4 py-2">연차 사용일</th>
                  {ATT_TYPES.map(t => <th key={t} className="text-right text-xs font-semibold text-gray-400 px-4 py-2">{t}</th>)}
                </tr>
              </thead>
              <tbody>
                {activeEmps.map(e => (
                  <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium text-gray-800">{e.name}</td>
                    <td className="px-4 py-2 text-right font-semibold text-blue-600">{annualUsed(e.id) || '-'}</td>
                    {ATT_TYPES.map(t => {
                      const n = yearCount(e.id, t)
                      return <td key={t} className={`px-4 py-2 text-right ${n ? 'text-gray-700' : 'text-gray-300'}`}>{n || '-'}</td>
                    })}
                  </tr>
                ))}
                {activeEmps.length === 0 && (
                  <tr><td colSpan={8} className="text-center text-xs text-gray-400 py-6">직원정보내역에 직원을 먼저 등록해 주세요</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* 월 선택 + 유형 필터 */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <input type="month" value={month} onChange={e => setMonth(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <div className="flex gap-1.5 flex-wrap">
              {['전체', ...ATT_TYPES].map(t => (
                <button key={t} onClick={() => setTypeFilter(t)}
                  className={`text-xs px-3 py-1.5 rounded-full border font-medium ${typeFilter === t ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-500 border-gray-300 hover:border-green-400'}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* 월별 기록 목록 */}
          {loading ? (
            <div className="text-center py-12 text-gray-400">불러오는 중...</div>
          ) : monthList.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 text-center py-12 text-gray-400">
              <p className="text-3xl mb-2">🗓️</p>
              <p>{month.replace('-', '년 ')}월 기록이 없어요</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {monthList.map(a => (
                <div key={a.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50">
                  <span className="text-sm text-gray-500 w-20 flex-shrink-0">{a.att_date?.slice(5).replace('-', '/')}</span>
                  <span className="text-sm font-medium text-gray-800 w-20 flex-shrink-0 truncate">{nameOf(a.employee_id)}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${ATT_COLOR[a.att_type] || 'bg-gray-100 text-gray-600'}`}>{a.att_type}</span>
                  <span className="text-xs text-gray-400 flex-1 truncate">{a.memo || ''}</span>
                  <button onClick={() => openEdit(a)} className="text-xs text-green-500 hover:text-green-700 flex-shrink-0">수정</button>
                  <button onClick={() => del(a)} className="text-xs text-red-400 hover:text-red-600 flex-shrink-0">삭제</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 기록 추가/수정 모달 */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 sticky top-0 bg-white">
              <h2 className="text-lg font-bold">{editing ? '근태 수정' : '근태 기록 추가'}</h2>
              <button onClick={() => { setShowForm(false); setEditing(null) }} className="text-gray-400 text-2xl">&times;</button>
            </div>
            <form onSubmit={save} className="px-6 py-5 flex flex-col gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">직원 *</label>
                <select required value={form.employee_id} onChange={e => setForm({ ...form, employee_id: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                  <option value="">선택하세요</option>
                  {emps.map(e => <option key={e.id} value={e.id}>{e.name}{e.is_active === false ? ' (퇴사)' : ''}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">날짜 *</label>
                <input type="date" required value={form.att_date} onChange={e => setForm({ ...form, att_date: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">유형 *</label>
                <div className="flex gap-1.5 flex-wrap">
                  {ATT_TYPES.map(t => (
                    <button type="button" key={t} onClick={() => setForm({ ...form, att_type: t })}
                      className={`text-sm px-3 py-1.5 rounded-full border ${form.att_type === t ? 'bg-green-600 text-white border-green-600' : 'border-gray-300 text-gray-600'}`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">메모</label>
                <input value={form.memo} onChange={e => setForm({ ...form, memo: e.target.value })} placeholder="예) 개인 사유, 병원"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <button type="submit" disabled={saving || !form.employee_id || !form.att_date}
                className="bg-green-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                {saving ? '저장 중...' : editing ? '수정 저장' : '기록 추가'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
