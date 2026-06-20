'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase-browser'
import { Employee, EmploymentType } from '@/lib/supabase'

const EMPTY_FORM = {
  name: '', resident_number: '', department: '', phone: '',
  hire_date: '', resign_date: '', bank_name: '', account_number: '',
  email: '', employment_type: '상용직' as EmploymentType, memo: '',
}

export default function AdminEmployeesPage() {
  const router = useRouter()
  const { profile: myProfile, loading: authLoading } = useAuth()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [revealedId, setRevealedId] = useState<string | null>(null)

  useEffect(() => {
    if (!authLoading) {
      if (!myProfile || myProfile.role !== 'admin') {
        router.push('/')
        return
      }
      fetchEmployees()
    }
  }, [authLoading, myProfile])

  async function fetchEmployees() {
    const supabase = createClient()
    const { data } = await supabase.from('employees').select('*').order('employment_type').order('name')
    setEmployees(data || [])
    setLoading(false)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const supabase = createClient()
    const payload = {
      ...form,
      hire_date: form.hire_date || null,
      resign_date: form.resign_date || null,
    }
    const { error } = editingId
      ? await supabase.from('employees').update(payload).eq('id', editingId)
      : await supabase.from('employees').insert([{ ...payload, is_active: true }])
    if (error) {
      alert('저장 실패: ' + error.message)
      setSaving(false)
      return
    }
    setForm(EMPTY_FORM)
    setEditingId(null)
    setShowForm(false)
    setSaving(false)
    fetchEmployees()
  }

  function openEdit(emp: Employee) {
    setEditingId(emp.id)
    setForm({
      name: emp.name, resident_number: emp.resident_number || '', department: emp.department || '',
      phone: emp.phone || '', hire_date: emp.hire_date || '', resign_date: emp.resign_date || '',
      bank_name: emp.bank_name || '', account_number: emp.account_number || '', email: emp.email || '',
      employment_type: emp.employment_type, memo: emp.memo || '',
    })
    setShowForm(true)
  }

  async function toggleActive(emp: Employee) {
    const supabase = createClient()
    await supabase.from('employees').update({ is_active: !emp.is_active }).eq('id', emp.id)
    fetchEmployees()
  }

  async function deleteEmployee(emp: Employee) {
    if (!confirm(`"${emp.name}" 정보를 삭제할까요?`)) return
    const supabase = createClient()
    await supabase.from('employees').delete().eq('id', emp.id)
    fetchEmployees()
  }

  function mask(value: string, id: string) {
    if (!value) return '-'
    if (revealedId === id) return value
    return value.slice(0, 4) + '••••••'
  }

  if (authLoading || loading) return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex items-center justify-center text-gray-400">불러오는 중...</div>
    </div>
  )

  const regular = employees.filter(e => e.employment_type === '상용직')
  const daily = employees.filter(e => e.employment_type === '일용직')

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <header className="bg-white border-b border-gray-200 px-4 md:px-8 py-4 md:py-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">직원정보내역</h1>
              <p className="text-sm text-gray-500 mt-0.5">관리자만 볼 수 있는 개인정보입니다. 외부 노출에 주의하세요.</p>
            </div>
            <button onClick={() => { setForm(EMPTY_FORM); setEditingId(null); setShowForm(true) }}
              className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700">
              + 직원 추가
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-auto px-4 md:px-8 py-6 pb-20 md:pb-6 flex flex-col gap-8">
          <EmployeeTable title="상용직" list={regular} mask={mask} revealedId={revealedId} setRevealedId={setRevealedId}
            onEdit={openEdit} onToggle={toggleActive} onDelete={deleteEmployee} />
          <EmployeeTable title="일용직" list={daily} mask={mask} revealedId={revealedId} setRevealedId={setRevealedId}
            onEdit={openEdit} onToggle={toggleActive} onDelete={deleteEmployee} />
        </div>
      </div>

      {/* 추가/수정 모달 */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 sticky top-0 bg-white">
              <h2 className="text-lg font-bold">{editingId ? '직원정보 수정' : '직원 추가'}</h2>
              <button onClick={() => { setShowForm(false); setEditingId(null); setForm(EMPTY_FORM) }}
                className="text-gray-400 text-2xl">&times;</button>
            </div>
            <form onSubmit={handleSave} className="px-6 py-5 flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-2">
                {(['상용직', '일용직'] as const).map(t => (
                  <button key={t} type="button" onClick={() => setForm({ ...form, employment_type: t })}
                    className={`py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                      form.employment_type === t ? 'bg-green-600 text-white border-green-600' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}>
                    {t}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1.5">이름 *</label>
                  <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1.5">주민번호</label>
                  <input value={form.resident_number} onChange={e => setForm({ ...form, resident_number: e.target.value })}
                    placeholder="900101-1234567"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1.5">{form.employment_type === '상용직' ? '부서' : '분야'}</label>
                  <input value={form.department} onChange={e => setForm({ ...form, department: e.target.value })}
                    placeholder={form.employment_type === '상용직' ? '디자인, 현장' : '목수, 도배'}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1.5">연락처</label>
                  <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                    placeholder="010-0000-0000"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
              </div>
              {form.employment_type === '상용직' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1.5">입사날짜</label>
                    <input type="date" value={form.hire_date} onChange={e => setForm({ ...form, hire_date: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1.5">퇴사날짜</label>
                    <input type="date" value={form.resign_date} onChange={e => setForm({ ...form, resign_date: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1.5">은행명</label>
                  <input value={form.bank_name} onChange={e => setForm({ ...form, bank_name: e.target.value })}
                    placeholder="농협"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1.5">계좌번호</label>
                  <input value={form.account_number} onChange={e => setForm({ ...form, account_number: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
              </div>
              {form.employment_type === '상용직' && (
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1.5">메일주소</label>
                  <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
              )}
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">메모</label>
                <input value={form.memo} onChange={e => setForm({ ...form, memo: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div className="flex gap-3 mt-2">
                <button type="button" onClick={() => { setShowForm(false); setEditingId(null); setForm(EMPTY_FORM) }}
                  className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm font-medium">취소</button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-green-600 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
                  {saving ? '저장 중...' : editingId ? '수정' : '추가'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function EmployeeTable({ title, list, mask, revealedId, setRevealedId, onEdit, onToggle, onDelete }: {
  title: string
  list: Employee[]
  mask: (v: string, id: string) => string
  revealedId: string | null
  setRevealedId: (id: string | null) => void
  onEdit: (e: Employee) => void
  onToggle: (e: Employee) => void
  onDelete: (e: Employee) => void
}) {
  return (
    <div>
      <h2 className="text-sm font-bold text-gray-700 mb-3">{title} <span className="text-gray-400 font-normal">({list.length})</span></h2>
      {list.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 text-center py-10 text-gray-400 text-sm">등록된 직원이 없어요</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full whitespace-nowrap">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left text-xs font-semibold text-gray-400 px-4 py-3">이름</th>
                <th className="text-left text-xs font-semibold text-gray-400 px-4 py-3">주민번호</th>
                <th className="text-left text-xs font-semibold text-gray-400 px-4 py-3">{title === '상용직' ? '부서' : '분야'}</th>
                <th className="text-left text-xs font-semibold text-gray-400 px-4 py-3">연락처</th>
                {title === '상용직' && <th className="text-left text-xs font-semibold text-gray-400 px-4 py-3">입사날짜</th>}
                {title === '상용직' && <th className="text-left text-xs font-semibold text-gray-400 px-4 py-3">퇴사날짜</th>}
                <th className="text-left text-xs font-semibold text-gray-400 px-4 py-3">은행</th>
                <th className="text-left text-xs font-semibold text-gray-400 px-4 py-3">계좌번호</th>
                <th className="text-left text-xs font-semibold text-gray-400 px-4 py-3">상태</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {list.map(e => (
                <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-800">{e.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 font-mono">
                    <button onClick={() => setRevealedId(revealedId === e.id ? null : e.id)} className="hover:text-green-600">
                      {mask(e.resident_number, e.id)}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    {e.department && <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">{e.department}</span>}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{e.phone || '-'}</td>
                  {title === '상용직' && <td className="px-4 py-3 text-sm text-gray-500">{e.hire_date || '-'}</td>}
                  {title === '상용직' && <td className="px-4 py-3 text-sm text-gray-500">{e.resign_date || '-'}</td>}
                  <td className="px-4 py-3 text-sm text-gray-600">{e.bank_name || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 font-mono">{e.account_number || '-'}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => onToggle(e)}
                      className={`text-xs px-2.5 py-1 rounded-full font-medium ${e.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                      {e.is_active ? '재직중' : '퇴사'}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => onEdit(e)} className="text-xs text-green-500 hover:text-green-700">수정</button>
                      <button onClick={() => onDelete(e)} className="text-xs text-red-400 hover:text-red-600">삭제</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
