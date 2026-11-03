'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { retirementNet } from '@/lib/retirement-settlement'
import { toast } from '@/components/Toaster'

export type RetirementRecord = {
  id: string
  employee_id: string | null
  employee_name: string
  paid_on: string
  kind: '퇴직금' | '퇴직연금'
  amount: number
  income_tax: number
  local_tax: number
  memo: string | null
}
type EmployeeChoice = { id: string; name: string; is_active: boolean }
type Form = Omit<RetirementRecord, 'id' | 'employee_name'> & { id?: string; employee_name: string }
const fmt = (value: number) => Number(value).toLocaleString('ko-KR')

export function RetirementSection({ month, employees, rows, missing, reload }: {
  month: string; employees: EmployeeChoice[]; rows: RetirementRecord[];
  missing: boolean; reload: () => Promise<boolean>
}) {
  const [form, setForm] = useState<Form | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (part: Partial<Form>) => setForm(prev => prev ? { ...prev, ...part } : null)
  const newForm = (): Form => ({ employee_id: '', employee_name: '', paid_on: `${month}-05`, kind: '퇴직금', amount: 0, income_tax: 0, local_tax: 0, memo: '' })

  async function save() {
    if (!form || busy) return
    const name = employees.find(e => e.id === form.employee_id)?.name || (form.id ? form.employee_name : '')
    if (!name) { setError('직원을 선택해 주세요.'); return }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.paid_on) || !form.paid_on.startsWith(`${month}-`)) {
      setError('지급일은 현재 선택한 달의 날짜로 입력해 주세요.'); return
    }
    if (form.amount <= 0) { setError('지급액은 0원보다 커야 합니다.'); return }
    try { retirementNet({ amount: form.amount, incomeTax: form.income_tax, localTax: form.local_tax }) }
    catch (e) { setError(e instanceof Error ? e.message : '금액을 확인해 주세요.'); return }
    setError(''); setBusy(true)
    const payload = {
      employee_id: form.employee_id || null, employee_name: name, paid_on: form.paid_on,
      kind: form.kind, amount: form.amount, income_tax: form.income_tax,
      local_tax: form.local_tax, memo: form.memo?.trim() || null,
      updated_at: new Date().toISOString(),
    }
    const sb = createClient()
    const result = form.id
      ? await sb.from('retirement_settlements').update(payload).eq('id', form.id).select('id').single()
      : await sb.from('retirement_settlements').insert(payload).select('id').single()
    if (result.error) { setBusy(false); setError('저장 실패: ' + result.error.message); return }
    const refreshed = await reload()
    setBusy(false)
    if (!refreshed) { setError('저장됐지만 목록을 다시 확인하지 못했어요. 화면을 새로고침해 주세요.'); return }
    setForm(null)
    toast('퇴직 정산 내역을 저장했어요')
  }

  async function remove(row: RetirementRecord) {
    if (busy || !confirm(`${row.employee_name} 님의 ${row.paid_on} ${row.kind} 지급 내역을 삭제할까요?`)) return
    setBusy(true)
    const { error: deleteError } = await createClient().from('retirement_settlements').delete().eq('id', row.id)
    if (deleteError) { setError('삭제 실패: ' + deleteError.message); setBusy(false); return }
    const refreshed = await reload()
    setBusy(false)
    if (!refreshed) { setError('삭제 후 목록을 다시 확인하지 못했어요. 화면을 새로고침해 주세요.'); return }
    setForm(null)
    toast('퇴직 정산 내역을 삭제했어요')
  }

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold text-gray-900">퇴직 정산 내역 <span className="text-sm font-normal text-gray-400">· 지급월 기준</span></h2>
        {!missing && <button onClick={() => { setForm(newForm()); setError('') }} className="text-sm text-green-700 hover:underline">+ 퇴직금·퇴직연금 지급 추가</button>}
      </div>
      <p className="text-xs text-gray-500 mt-1">퇴직금·퇴직연금 지급 내역을 월 급여와 <b>별도로</b> 기록합니다. 급여 합계·근로소득세·임금명세서에는 합치지 않습니다. 퇴사한 직원도 선택할 수 있어요.</p>
      {missing ? <p className="text-sm text-amber-700 mt-3">DB 준비가 필요합니다: db/payroll_special_retirement.sql 적용 후 사용할 수 있어요.</p> : <>
        {rows.length === 0 ? <p className="text-sm text-gray-400 mt-4">이 달의 퇴직 지급 내역이 없어요.</p> : (
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-sm whitespace-nowrap">
              <thead><tr className="text-gray-500 border-b border-gray-100 text-left"><th className="py-2 pr-3">지급일</th><th className="pr-3">성명</th><th className="pr-3">구분</th><th className="text-right pr-3">지급액</th><th className="text-right pr-3">퇴직소득세</th><th className="text-right pr-3">지방소득세</th><th className="text-right pr-3">실지급액</th><th>메모 / 수정</th></tr></thead>
              <tbody>{rows.map(row => <tr key={row.id} className="border-b border-gray-50">
                <td className="py-2 pr-3">{row.paid_on}</td><td className="pr-3">{row.employee_name}</td><td className="pr-3">{row.kind}</td>
                <td className="text-right pr-3">{fmt(row.amount)}</td><td className="text-right pr-3">{fmt(row.income_tax)}</td><td className="text-right pr-3">{fmt(row.local_tax)}</td>
                <td className="text-right font-semibold pr-3">{fmt(retirementNet({ amount: Number(row.amount), incomeTax: Number(row.income_tax), localTax: Number(row.local_tax) }))}</td>
                <td className="text-xs text-gray-500">{row.memo || '-'} <button onClick={() => { setForm({ ...row, amount: Number(row.amount), income_tax: Number(row.income_tax), local_tax: Number(row.local_tax) }); setError('') }} className="ml-2 text-green-700 hover:underline">수정</button></td>
              </tr>)}</tbody>
            </table>
          </div>
        )}
      </>}
      {form && !missing && <div className="border-t border-gray-200 mt-4 pt-4 flex flex-col gap-3 text-sm">
        <h3 className="font-semibold">{form.id ? '퇴직 정산 수정' : '퇴직 정산 추가'}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <label className="flex flex-col gap-1">직원<select value={form.employee_id || ''} onChange={e => set({ employee_id: e.target.value, employee_name: employees.find(x => x.id === e.target.value)?.name || '' })} className="border rounded-lg px-3 py-2"><option value="">직원 선택</option>{employees.map(e => <option key={e.id} value={e.id}>{e.name}{e.is_active ? '' : ' (퇴사)'}</option>)}</select></label>
          <label className="flex flex-col gap-1">지급일<input type="date" value={form.paid_on} onChange={e => set({ paid_on: e.target.value })} className="border rounded-lg px-3 py-2" /></label>
          <label className="flex flex-col gap-1">구분<select value={form.kind} onChange={e => set({ kind: e.target.value as Form['kind'] })} className="border rounded-lg px-3 py-2"><option>퇴직금</option><option>퇴직연금</option></select></label>
          {([['amount', '지급액 (세전)'], ['income_tax', '퇴직소득세 (직접 입력)'], ['local_tax', '지방소득세 (직접 입력)']] as const).map(([key, label]) => (
            <label key={key} className="flex flex-col gap-1">{label}<input type="number" min="0" step="1" value={form[key]} onChange={e => set({ [key]: e.target.value === '' ? 0 : Number(e.target.value) })} className="border rounded-lg px-3 py-2" /></label>
          ))}
          <label className="flex flex-col gap-1 sm:col-span-2">메모 (선택)<input value={form.memo || ''} onChange={e => set({ memo: e.target.value })} className="border rounded-lg px-3 py-2" placeholder="정산서·지급 방식 등" /></label>
        </div>
        <p className="text-xs text-gray-500">실지급액: {(() => { try { return fmt(retirementNet({ amount: form.amount, incomeTax: form.income_tax, localTax: form.local_tax })) } catch { return '입력 금액 확인' } })()}원 · 세금은 자동 계산하지 않습니다. 확정된 원천징수액을 입력하세요.</p>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-3 items-center"><button disabled={busy} onClick={save} className="bg-green-600 text-white px-4 py-2 rounded-lg disabled:opacity-40">저장</button><button onClick={() => { setForm(null); setError('') }} className="text-gray-500">취소</button>{form.id && <button disabled={busy} onClick={() => { const row = rows.find(x => x.id === form.id); if (row) remove(row) }} className="text-red-600 ml-auto disabled:opacity-40">삭제</button>}</div>
      </div>}
    </section>
  )
}
