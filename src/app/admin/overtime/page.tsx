'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from '@/components/Toaster'
import Sidebar from '@/components/Sidebar'
import HowTo from '@/components/HowTo'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase-browser'
import { Employee } from '@/lib/supabase'

// 직원 추가근무(연장·야간·휴일) — 관리자 전용. 월별로 직원마다 시간을 합산해 급여 계산에 쓴다.
type OtType = '연장' | '야간' | '휴일'
type Overtime = {
  id: string
  employee_id: string
  work_date: string
  ot_type: OtType
  start_time: string | null
  end_time: string | null
  hours: number
  project_name: string | null
  memo: string | null
}

const OT_TYPES: OtType[] = ['연장', '야간', '휴일']
const OT_HINT: Record<OtType, string> = {
  '연장': '정해진 근무시간 이후',
  '야간': '밤 10시 ~ 아침 6시',
  '휴일': '주말·공휴일 근무',
}
const OT_COLOR: Record<OtType, string> = {
  '연장': 'bg-amber-100 text-amber-700',
  '야간': 'bg-indigo-100 text-indigo-700',
  '휴일': 'bg-red-100 text-red-700',
}

// 기기 현지(한국) 날짜 — toISOString()은 UTC라 새벽 0~9시엔 전날이 됨
const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const thisMonth = () => today().slice(0, 7)

function shiftMonth(month: string, diff: number) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + diff, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// 시작~종료 시각으로 시간 계산 (종료가 시작보다 이르면 자정을 넘긴 것으로 봄)
function calcHours(start: string, end: string): number | null {
  if (!start || !end) return null
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  let min = (eh * 60 + em) - (sh * 60 + sm)
  if (min <= 0) min += 24 * 60
  return Math.round((min / 60) * 100) / 100
}

const fmtH = (n: number) => (Math.round(n * 100) / 100).toString()
const weekday = (d: string) => '일월화수목금토'[new Date(d + 'T00:00:00').getDay()]

const emptyForm = () => ({
  employee_id: '', work_date: today(), ot_type: '연장' as OtType,
  start_time: '', end_time: '', hours: '', project_name: '', memo: '',
})

export default function AdminOvertimePage() {
  const router = useRouter()
  const { profile, loading: authLoading } = useAuth()
  const [month, setMonth] = useState(thisMonth())
  const [employees, setEmployees] = useState<Employee[]>([])
  const [records, setRecords] = useState<Overtime[]>([])
  const [projectNames, setProjectNames] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [tableMissing, setTableMissing] = useState(false)
  const [filterEmp, setFilterEmp] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const isAdmin = profile?.role === 'admin'

  useEffect(() => {
    if (!authLoading && !isAdmin) router.push('/')
  }, [authLoading, isAdmin, router])

  // 직원·현장 목록은 한 번만
  useEffect(() => {
    if (!isAdmin) return
    const sb = createClient()
    sb.from('employees').select('*').order('employment_type').order('name')
      .then(({ data }) => setEmployees(data || []))
    sb.from('projects').select('name').order('created_at', { ascending: false }).limit(200)
      .then(({ data }) => setProjectNames(Array.from(new Set((data || []).map(p => p.name).filter(Boolean)))))
  }, [isAdmin])

  const load = useCallback(async () => {
    const sb = createClient()
    const { data, error } = await sb.from('employee_overtime').select('*')
      .gte('work_date', `${month}-01`).lt('work_date', `${shiftMonth(month, 1)}-01`)
      .order('work_date', { ascending: false }).order('created_at', { ascending: false })
    if (error) {
      // 테이블이 아직 없으면(SQL 미실행) 안내만 표시
      const missing = error.code === '42P01' || error.code === 'PGRST205'
      setTableMissing(missing)
      if (!missing) toast('불러오기 실패: ' + error.message)
      setRecords([])
    } else {
      setTableMissing(false)
      setRecords((data || []).map(r => ({ ...r, hours: Number(r.hours) })))
    }
    setLoading(false)
  }, [month])

  useEffect(() => {
    if (!isAdmin) return
    let on = true
    Promise.resolve().then(() => { if (on) load() })
    return () => { on = false }
  }, [isAdmin, load])

  const empById = useMemo(() => new Map(employees.map(e => [e.id, e])), [employees])

  // 직원별 월 합계 (기록이 있는 직원만, 합계 많은 순)
  const summary = useMemo(() => {
    const map = new Map<string, { 연장: number; 야간: number; 휴일: number; total: number; count: number }>()
    for (const r of records) {
      const s = map.get(r.employee_id) || { 연장: 0, 야간: 0, 휴일: 0, total: 0, count: 0 }
      s[r.ot_type] += r.hours
      s.total += r.hours
      s.count += 1
      map.set(r.employee_id, s)
    }
    return Array.from(map.entries())
      .map(([id, s]) => ({ id, name: empById.get(id)?.name || '(삭제된 직원)', ...s }))
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
  }, [records, empById])

  const grand = summary.reduce((g, s) => ({
    연장: g.연장 + s.연장, 야간: g.야간 + s.야간, 휴일: g.휴일 + s.휴일, total: g.total + s.total,
  }), { 연장: 0, 야간: 0, 휴일: 0, total: 0 })

  const visible = filterEmp ? records.filter(r => r.employee_id === filterEmp) : records

  // 입력폼 대상 직원: 재직중 + (수정 중이면 그 직원은 퇴사여도 포함)
  const selectable = employees.filter(e => e.is_active || e.id === form.employee_id)

  function openAdd() {
    setEditingId(null)
    setForm({ ...emptyForm(), employee_id: filterEmp || '', work_date: month === thisMonth() ? today() : `${month}-01` })
    setShowForm(true)
  }

  function openEdit(r: Overtime) {
    setEditingId(r.id)
    setForm({
      employee_id: r.employee_id, work_date: r.work_date, ot_type: r.ot_type,
      start_time: r.start_time || '', end_time: r.end_time || '', hours: fmtH(r.hours),
      project_name: r.project_name || '', memo: r.memo || '',
    })
    setShowForm(true)
  }

  // 시각을 바꾸면 시간 자동 계산
  function setTime(key: 'start_time' | 'end_time', v: string) {
    const next = { ...form, [key]: v }
    const h = calcHours(next.start_time, next.end_time)
    if (h !== null) next.hours = fmtH(h)
    setForm(next)
  }

  async function handleSave(e: { preventDefault(): void }, keepOpen = false) {
    e.preventDefault()
    const hours = Number(form.hours)
    if (!form.employee_id) { toast('직원을 선택하세요'); return }
    if (!form.work_date) { toast('날짜를 입력하세요'); return }
    if (!(hours > 0 && hours <= 24)) { toast('시간은 0보다 크고 24 이하로 입력하세요'); return }
    setSaving(true)
    const sb = createClient()
    const payload = {
      employee_id: form.employee_id, work_date: form.work_date, ot_type: form.ot_type,
      start_time: form.start_time || null, end_time: form.end_time || null, hours,
      project_name: form.project_name.trim() || null, memo: form.memo.trim() || null,
    }
    const { error } = editingId
      ? await sb.from('employee_overtime').update(payload).eq('id', editingId)
      : await sb.from('employee_overtime').insert([payload])
    setSaving(false)
    if (error) { toast('저장 실패: ' + error.message); return }
    toast(editingId ? '수정했어요' : '저장했어요')
    // 다른 달 날짜로 저장했으면 그 달로 이동해서 보여줌
    const savedMonth = form.work_date.slice(0, 7)
    if (keepOpen && !editingId) {
      // 같은 날·같은 현장으로 다음 직원 계속 입력
      setForm({ ...form, employee_id: '', memo: '' })
    } else {
      setShowForm(false); setEditingId(null); setForm(emptyForm())
    }
    if (savedMonth !== month) setMonth(savedMonth); else load()
  }

  async function handleDelete(r: Overtime) {
    const name = empById.get(r.employee_id)?.name || ''
    if (!confirm(`${name} ${r.work_date} ${r.ot_type} ${fmtH(r.hours)}시간 기록을 삭제할까요?`)) return
    const { error } = await createClient().from('employee_overtime').delete().eq('id', r.id)
    if (error) { toast('삭제 실패: ' + error.message); return }
    load()
  }

  // 엑셀 저장 — 시트1: 직원별 합계, 시트2: 상세 내역
  async function exportExcel() {
    if (records.length === 0) { toast('이 달에 기록이 없어요'); return }
    const XLSX = await import('xlsx')
    const wb = XLSX.utils.book_new()
    const sumRows = [
      ['성명', '연장(시간)', '야간(시간)', '휴일(시간)', '합계(시간)', '건수'],
      ...summary.map(s => [s.name, s.연장, s.야간, s.휴일, s.total, s.count]),
      ['합계', grand.연장, grand.야간, grand.휴일, grand.total, records.length],
    ]
    const detailRows = [
      ['날짜', '요일', '성명', '구분', '시작', '종료', '시간', '현장', '메모'],
      ...[...records].sort((a, b) => a.work_date.localeCompare(b.work_date)).map(r => [
        r.work_date, weekday(r.work_date), empById.get(r.employee_id)?.name || '', r.ot_type,
        r.start_time || '', r.end_time || '', r.hours, r.project_name || '', r.memo || '',
      ]),
    ]
    const s1 = XLSX.utils.aoa_to_sheet(sumRows)
    s1['!cols'] = [{ wch: 10 }, { wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 6 }]
    const s2 = XLSX.utils.aoa_to_sheet(detailRows)
    s2['!cols'] = [{ wch: 11 }, { wch: 5 }, { wch: 10 }, { wch: 6 }, { wch: 7 }, { wch: 7 }, { wch: 6 }, { wch: 20 }, { wch: 30 }]
    XLSX.utils.book_append_sheet(wb, s1, '직원별 합계')
    XLSX.utils.book_append_sheet(wb, s2, '상세 내역')
    XLSX.writeFile(wb, `추가근무_${month}.xlsx`)
  }

  if (authLoading || !isAdmin) return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex items-center justify-center text-gray-400">불러오는 중...</div>
    </div>
  )

  const [yy, mm] = month.split('-')
  const filterName = filterEmp ? empById.get(filterEmp)?.name : null

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-gray-200 px-4 md:px-8 py-4 md:py-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-gray-900">추가근무 관리</h1>
              <p className="text-sm text-gray-500 mt-0.5">직원별 연장·야간·휴일 근무 시간을 기록하고 월별로 합산합니다. 급여대장을 만들 때 자동으로 불러와요(5인 미만 — 가산 없이 1배).</p>
            </div>
            <div className="flex gap-2">
              <button onClick={exportExcel} disabled={tableMissing}
                className="border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-40">
                엑셀 저장
              </button>
              <button onClick={openAdd} disabled={tableMissing}
                className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-40">
                + 추가근무 입력
              </button>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-auto px-4 md:px-8 py-6 pb-24 flex flex-col gap-6">
          <HowTo id="overtime">
            <ol>
              <li><b>[+ 추가근무 입력]</b> → 직원, 날짜, 구분을 고르고 시간을 넣어요. 시작·종료 시각을 넣으면 시간이 자동 계산돼요(자정 넘겨도 OK, 예: 21:00~01:30 = 4.5시간).</li>
              <li>같은 날 여러 명이 일했으면 <b>[저장 후 다음 직원]</b>으로 이어서 입력.</li>
              <li>고칠 땐 아래 상세 내역의 <b>수정</b>·<b>삭제</b>. 이름을 누르면 그 직원 내역만 보여요.</li>
            </ol>
            <ul>
              <li><b>구분</b>: 연장 = 정해진 근무시간 이후, 야간 = 밤 10시~아침 6시, 휴일 = 주말·공휴일.</li>
              <li><b>현장직</b>은 포괄연장(월 41.3시간)이 이미 월급에 들어 있어요 — <b>그걸 넘는 시간만</b> 기록하세요.</li>
              <li><b>급여 반영</b>: 💰 급여대장에서 그 달 대장을 만들 때 자동으로 불러와요(통상시급 × 시간 × 1배, 상시 5인 미만). 대장을 만든 뒤에 입력했으면 급여대장의 <b>[↻ 추가근무 다시 불러오기]</b>를 누르세요.</li>
              <li>근무한 <b>날짜가 속한 달</b>의 급여로 들어가요.</li>
            </ul>
          </HowTo>
          {/* 달 이동 */}
          <div className="flex items-center gap-2">
            <button onClick={() => { setMonth(shiftMonth(month, -1)); setFilterEmp(null) }}
              className="w-9 h-9 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50" aria-label="이전 달">◀</button>
            <input type="month" value={month} onChange={e => { if (e.target.value) { setMonth(e.target.value); setFilterEmp(null) } }}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-semibold bg-white" />
            <button onClick={() => { setMonth(shiftMonth(month, 1)); setFilterEmp(null) }}
              className="w-9 h-9 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50" aria-label="다음 달">▶</button>
            {month !== thisMonth() && (
              <button onClick={() => { setMonth(thisMonth()); setFilterEmp(null) }} className="text-xs text-green-700 hover:underline ml-1">이번 달</button>
            )}
          </div>

          {tableMissing ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-800">
              <p className="font-bold mb-1">DB 준비가 필요해요</p>
              <p>Supabase SQL Editor에서 <code className="bg-white px-1.5 py-0.5 rounded">db/employee_overtime.sql</code>을 한 번 실행하면 바로 쓸 수 있어요.</p>
            </div>
          ) : loading ? (
            <div className="text-center text-gray-400 py-16 text-sm">불러오는 중...</div>
          ) : (
            <>
              {/* 월 합계 카드 */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {([['합계', grand.total, 'text-gray-900'], ['연장', grand.연장, 'text-amber-700'], ['야간', grand.야간, 'text-indigo-700'], ['휴일', grand.휴일, 'text-red-700']] as const).map(([label, v, cls]) => (
                  <div key={label} className="bg-white rounded-xl border border-gray-200 px-4 py-3">
                    <p className="text-xs text-gray-400">{Number(mm)}월 {label}</p>
                    <p className={`text-2xl font-bold mt-0.5 ${cls}`}>{fmtH(v)}<span className="text-sm font-medium text-gray-400 ml-0.5">시간</span></p>
                  </div>
                ))}
              </div>

              {/* 직원별 합계 */}
              <section>
                <h2 className="text-sm font-bold text-gray-700 mb-3">직원별 합계 <span className="text-gray-400 font-normal">· {yy}년 {Number(mm)}월 · 이름을 누르면 그 직원 내역만 보여요</span></h2>
                {summary.length === 0 ? (
                  <div className="bg-white rounded-xl border border-gray-200 text-center py-10 text-gray-400 text-sm">이 달에 기록된 추가근무가 없어요</div>
                ) : (
                  <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
                    <table className="w-full whitespace-nowrap">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50">
                          <th className="text-left text-xs font-semibold text-gray-400 px-4 py-3">이름</th>
                          <th className="text-right text-xs font-semibold text-gray-400 px-4 py-3">연장</th>
                          <th className="text-right text-xs font-semibold text-gray-400 px-4 py-3">야간</th>
                          <th className="text-right text-xs font-semibold text-gray-400 px-4 py-3">휴일</th>
                          <th className="text-right text-xs font-semibold text-gray-400 px-4 py-3">합계</th>
                          <th className="text-right text-xs font-semibold text-gray-400 px-4 py-3">건수</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.map(s => (
                          <tr key={s.id} className={`border-b border-gray-50 hover:bg-gray-50 ${filterEmp === s.id ? 'bg-green-50' : ''}`}>
                            <td className="px-4 py-3 text-sm">
                              <button onClick={() => setFilterEmp(filterEmp === s.id ? null : s.id)}
                                className="text-green-700 hover:text-green-900 hover:underline font-semibold">{s.name}</button>
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-gray-700">{s.연장 ? fmtH(s.연장) : '-'}</td>
                            <td className="px-4 py-3 text-sm text-right text-gray-700">{s.야간 ? fmtH(s.야간) : '-'}</td>
                            <td className="px-4 py-3 text-sm text-right text-gray-700">{s.휴일 ? fmtH(s.휴일) : '-'}</td>
                            <td className="px-4 py-3 text-sm text-right font-bold text-gray-900">{fmtH(s.total)}</td>
                            <td className="px-4 py-3 text-sm text-right text-gray-400">{s.count}</td>
                          </tr>
                        ))}
                        <tr className="bg-gray-50 font-semibold">
                          <td className="px-4 py-3 text-sm text-gray-600">합계</td>
                          <td className="px-4 py-3 text-sm text-right">{fmtH(grand.연장)}</td>
                          <td className="px-4 py-3 text-sm text-right">{fmtH(grand.야간)}</td>
                          <td className="px-4 py-3 text-sm text-right">{fmtH(grand.휴일)}</td>
                          <td className="px-4 py-3 text-sm text-right text-gray-900">{fmtH(grand.total)}</td>
                          <td className="px-4 py-3 text-sm text-right text-gray-400">{records.length}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* 상세 내역 */}
              {records.length > 0 && (
                <section>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-bold text-gray-700">
                      상세 내역 {filterName && <span className="text-green-700">· {filterName}</span>}
                      <span className="text-gray-400 font-normal"> ({visible.length})</span>
                    </h2>
                    {filterEmp && <button onClick={() => setFilterEmp(null)} className="text-xs text-gray-500 hover:text-gray-800">전체 보기 ✕</button>}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {visible.map(r => (
                      <div key={r.id} className="bg-white border border-gray-200 rounded-lg px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                        <span className="font-medium text-gray-700 w-[92px]">{r.work_date.slice(5).replace('-', '/')} ({weekday(r.work_date)})</span>
                        <span className="font-semibold text-gray-900 w-16 truncate">{empById.get(r.employee_id)?.name || '-'}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${OT_COLOR[r.ot_type]}`}>{r.ot_type}</span>
                        <span className="font-bold text-gray-900">{fmtH(r.hours)}시간</span>
                        {r.start_time && r.end_time && <span className="text-xs text-gray-400">{r.start_time}~{r.end_time}</span>}
                        {r.project_name && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{r.project_name}</span>}
                        {r.memo && <span className="text-xs text-gray-500 flex-1 min-w-[80px] truncate">{r.memo}</span>}
                        <div className="ml-auto flex gap-3">
                          <button onClick={() => openEdit(r)} className="text-xs text-green-600 hover:text-green-800">수정</button>
                          <button onClick={() => handleDelete(r)} className="text-xs text-red-400 hover:text-red-600">삭제</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>

      {/* 입력/수정 모달 */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white">
              <h2 className="text-lg font-bold">{editingId ? '추가근무 수정' : '추가근무 입력'}</h2>
              <button onClick={() => { setShowForm(false); setEditingId(null) }} className="text-gray-400 text-2xl">&times;</button>
            </div>
            <form onSubmit={e => handleSave(e)} className="px-6 py-5 flex flex-col gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">직원 *</label>
                <select value={form.employee_id} onChange={e => setForm({ ...form, employee_id: e.target.value })} required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                  <option value="">선택하세요</option>
                  {(['상용직', '일용직'] as const).map(t => {
                    const list = selectable.filter(e => e.employment_type === t)
                    return list.length > 0 && (
                      <optgroup key={t} label={t}>
                        {list.map(e => <option key={e.id} value={e.id}>{e.name}{e.department ? ` (${e.department})` : ''}</option>)}
                      </optgroup>
                    )
                  })}
                </select>
                {employees.length === 0 && <p className="text-xs text-gray-400 mt-1">직원정보내역에 직원을 먼저 등록하세요.</p>}
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">날짜 *</label>
                <input type="date" value={form.work_date} onChange={e => setForm({ ...form, work_date: e.target.value })} required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">구분 *</label>
                <div className="grid grid-cols-3 gap-2">
                  {OT_TYPES.map(t => (
                    <button key={t} type="button" onClick={() => setForm({ ...form, ot_type: t })}
                      className={`py-2 rounded-lg text-sm font-medium border transition-colors ${
                        form.ot_type === t ? 'bg-green-600 text-white border-green-600' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}>
                      {t}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-1">{OT_HINT[form.ot_type]}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">시간 * <span className="text-xs font-normal text-gray-400">시작·종료를 넣으면 자동 계산</span></label>
                <div className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2">
                  <input type="time" value={form.start_time} onChange={e => setTime('start_time', e.target.value)} aria-label="시작 시각"
                    className="border border-gray-300 rounded-lg px-2 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                  <span className="text-gray-400">~</span>
                  <input type="time" value={form.end_time} onChange={e => setTime('end_time', e.target.value)} aria-label="종료 시각"
                    className="border border-gray-300 rounded-lg px-2 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                  <span />
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <input type="number" inputMode="decimal" step="0.5" min="0.5" max="24" value={form.hours} required
                    onChange={e => setForm({ ...form, hours: e.target.value })} placeholder="예: 2.5" aria-label="시간"
                    className="w-28 border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                  <span className="text-sm text-gray-500">시간</span>
                  <div className="flex gap-1 ml-auto">
                    {[1, 2, 3, 4, 8].map(h => (
                      <button key={h} type="button" onClick={() => setForm({ ...form, hours: String(h) })}
                        className="text-xs px-2 py-1 rounded-md border border-gray-200 text-gray-500 hover:border-green-500 hover:text-green-700">{h}h</button>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">현장</label>
                <input list="ot-projects" value={form.project_name} onChange={e => setForm({ ...form, project_name: e.target.value })}
                  placeholder="현장명 (선택)"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                <datalist id="ot-projects">
                  {projectNames.map(n => <option key={n} value={n} />)}
                </datalist>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">메모</label>
                <input value={form.memo} onChange={e => setForm({ ...form, memo: e.target.value })} placeholder="사유·작업 내용"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div className="flex gap-2 mt-1">
                <button type="button" onClick={() => { setShowForm(false); setEditingId(null) }}
                  className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm font-medium">취소</button>
                {!editingId && (
                  <button type="button" disabled={saving} onClick={e => handleSave(e, true)}
                    className="flex-1 border border-green-600 text-green-700 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
                    저장 후 다음 직원
                  </button>
                )}
                <button type="submit" disabled={saving}
                  className="flex-1 bg-green-600 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
                  {saving ? '저장 중...' : editingId ? '수정' : '저장'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
