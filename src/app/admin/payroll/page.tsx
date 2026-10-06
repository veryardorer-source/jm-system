'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from '@/components/Toaster'
import Sidebar from '@/components/Sidebar'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase-browser'
import { Employee } from '@/lib/supabase'
import {
  COMPANY, WORK_TYPES, WORK_TYPE_LIST, calcPay, PayInput, PayResult,
  birthFromRrn, ageAt, daysInMonth, daysWorkedIn, probationIn, SMALL_BUSINESS, extraOtMultiplier, JOB_GROUPS, jobGroup, BASE_HOURS,
} from '@/lib/payroll'
import { storeMonthlyLedger } from '@/lib/payroll-store'

// 급여대장 — 노무사 양식 계산식(src/lib/payroll.ts)으로 매달 자동 생성. 관리자 전용.
type Setting = {
  employee_id: string
  work_type: string
  position: string | null
  monthly_pay: number
  meal: number
  car: number
  position_allowance: number
  dependents: number
  employment_insurance: boolean
  health_ins: number
  care_ins: number
  pension: number
  probation_end: string | null
  probation_rate: number
}
type Item = Omit<Setting, 'probation_end' | 'probation_rate'> & {
  id: string
  month: string
  employee_id: string | null
  employee_name: string
  sort: number
  pay_rate: number
  rate_days: number | null
  rate_note: string | null
  days_worked: number | null
  extra_ot_hours: number
  night_hours: number
  holiday_hours: number
  small_business: boolean
  bonus: number
  health_adj: number
  care_adj: number
  attendance_deduction: number
  attendance_note: string | null
  duri: number
  memo: string | null
}

// 숫자 입력칸 정의 — [키, 라벨, 도움말]
const PAY_FIELDS: [keyof Setting & keyof Item, string, string?][] = [
  ['monthly_pay', '월지급액(세전)', '연봉 ÷ 12 — 식대·차량·연장·직책수당 포함 총액'],
  ['meal', '식대', '비과세'],
  ['car', '차량유지비', '비과세'],
  ['position_allowance', '직책수당'],
]
const INS_FIELDS: [keyof Setting & keyof Item, string][] = [
  ['health_ins', '건강보험'], ['care_ins', '장기요양'], ['pension', '국민연금'],
]

const POSITION_RANK = ['대표', '이사', '부장', '차장', '과장', '대리', '주임', '사원']
const rank = (p: string | null) => { const i = POSITION_RANK.indexOf(p || ''); return i < 0 ? 99 : i }

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
const fmt = (n: number) => n.toLocaleString('ko-KR')
const fmtZ = (n: number) => (n ? fmt(n) : '-')
const toNum = (s: string | number | null | undefined) => {
  const n = Number(String(s ?? '').replace(/[,\s원]/g, ''))
  return Number.isFinite(n) ? n : 0
}

function toInput(it: Item, emp: Employee | undefined, month: string): PayInput {
  const [y, m] = month.split('-').map(Number)
  return {
    work_type: it.work_type, monthly_pay: Number(it.monthly_pay), meal: Number(it.meal), car: Number(it.car),
    position_allowance: Number(it.position_allowance), dependents: Number(it.dependents),
    employment_insurance: it.employment_insurance,
    age: ageAt(birthFromRrn(emp?.resident_number), new Date(y, m, 0)),
    pay_rate: Number(it.pay_rate), rate_days: it.rate_days ?? null, days_worked: it.days_worked, month_days: daysInMonth(month),
    extra_ot_hours: Number(it.extra_ot_hours), night_hours: Number(it.night_hours || 0), holiday_hours: Number(it.holiday_hours || 0),
    small_business: it.small_business ?? SMALL_BUSINESS, bonus: Number(it.bonus),
    health_ins: Number(it.health_ins), care_ins: Number(it.care_ins), pension: Number(it.pension),
    health_adj: Number(it.health_adj), care_adj: Number(it.care_adj),
    attendance_deduction: Number(it.attendance_deduction),
  }
}

// 표 칸 — 노무사 양식 급여대장 순서 (생년월일 등 신상 칸은 엑셀에만)
const COLS: [string, (r: PayResult, it: Item) => number][] = [
  ['기본급', r => r.base], ['식대', r => r.meal], ['차량유지비', r => r.car], ['연장근로', r => r.ot],
  // '연장추가수당'은 엑셀 양식 칸 이름 유지 — 추가근무(연장·야간·휴일) 수당
  ['연장추가수당', r => r.extraOt], ['직책수당', r => r.position], ['상여금', r => r.bonus],
  ['급여합계', r => r.gross], ['과세합계', r => r.taxable],
  ['건강보험', r => r.health], ['장기요양', r => r.care], ['국민연금', r => r.pension], ['고용보험', r => r.empIns],
  ['소득세', r => r.incomeTax], ['주민세', r => r.localTax], ['근태공제', r => r.attendance],
  ['건강정산', r => r.healthAdj], ['장기요양정산', r => r.careAdj],
  ['공제합계', r => r.deductions], ['두리누리', (_r, it) => Number(it.duri)], ['차감지급액', r => r.net],
]
const BOLD = new Set(['급여합계', '공제합계', '차감지급액'])

export default function AdminPayrollPage() {
  const router = useRouter()
  const { profile, loading: authLoading } = useAuth()
  const [month, setMonth] = useState(thisMonth())
  const [employees, setEmployees] = useState<Employee[]>([])
  const [settings, setSettings] = useState<Map<string, Setting>>(new Map())
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [tableMissing, setTableMissing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [editItem, setEditItem] = useState<Item | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [editSetting, setEditSetting] = useState<{ emp: Employee; s: Setting } | null>(null)
  const [showAdd, setShowAdd] = useState(false)

  // 관리자 등급 + 급여 열람자 명단(대표·이사)에 있어야 함 — DB(RLS)도 같은 기준으로 막혀 있음
  const [viewer, setViewer] = useState<boolean | null>(null)
  const isAdmin = profile?.role === 'admin' && viewer === true
  useEffect(() => {
    if (authLoading) return
    if (profile?.role !== 'admin') { router.push('/'); return }
    let on = true
    createClient().rpc('is_payroll_viewer').then(({ data }) => {
      if (!on) return
      setViewer(data === true)
      if (data !== true) router.push('/')
    })
    return () => { on = false }
  }, [authLoading, profile?.role, router])

  const loadBase = useCallback(async () => {
    const sb = createClient()
    const [{ data: emps }, { data: sets, error }] = await Promise.all([
      sb.from('employees').select('*').order('name'),
      sb.from('employee_pay_settings').select('*'),
    ])
    setEmployees(emps || [])
    if (error) {
      const missing = error.code === '42P01' || error.code === 'PGRST205'
      setTableMissing(missing)
      if (!missing) toast('급여 기준 불러오기 실패: ' + error.message)
    }
    setSettings(new Map((sets || []).map(s => [s.employee_id, s as Setting])))
  }, [])

  const loadItems = useCallback(async () => {
    const { data, error } = await createClient().from('payroll_items').select('*')
      .eq('month', month).order('sort').order('employee_name')
    if (error) {
      const missing = error.code === '42P01' || error.code === 'PGRST205'
      setTableMissing(missing)
      if (!missing) toast('급여대장 불러오기 실패: ' + error.message)
      setItems([])
    } else setItems((data || []) as Item[])
    setLoading(false)
  }, [month])

  useEffect(() => {
    if (!isAdmin) return
    let on = true
    Promise.resolve().then(() => { if (on) loadBase() })
    return () => { on = false }
  }, [isAdmin, loadBase])
  useEffect(() => {
    if (!isAdmin) return
    let on = true
    Promise.resolve().then(() => { if (on) loadItems() })
    return () => { on = false }
  }, [isAdmin, loadItems])

  const empById = useMemo(() => new Map(employees.map(e => [e.id, e])), [employees])
  const year = Number(month.slice(0, 4))
  const rows = useMemo(() => items.map(it => ({
    it, r: calcPay(toInput(it, it.employee_id ? empById.get(it.employee_id) : undefined, month), year),
  })), [items, empById, month, year])
  const totals = useMemo(() => COLS.map(([, f]) => rows.reduce((s, { it, r }) => s + f(r, it), 0)), [rows])

  // 이 달 대장 대상: 상용직 + 급여 기준 있음 + 그 달에 재직한 사람
  function eligible(e: Employee) {
    const first = `${month}-01`, last = `${month}-${String(daysInMonth(month)).padStart(2, '0')}`
    const s = settings.get(e.id)
    if (!s || !(s.monthly_pay > 0) || e.employment_type !== '상용직') return false
    if (e.hire_date && e.hire_date > last) return false
    if (e.resign_date && e.resign_date < first) return false
    return true
  }

  // 그 달 추가근무 기록(⏱️ 추가근무 메뉴)을 직원별·구분별로 합산
  async function overtimeSums() {
    const { data, error } = await createClient().from('employee_overtime').select('employee_id, ot_type, hours')
      .gte('work_date', `${month}-01`).lt('work_date', `${shiftMonth(month, 1)}-01`)
    if (error) { toast('추가근무 불러오기 실패: ' + error.message); return null }
    const m = new Map<string, { extra_ot_hours: number; night_hours: number; holiday_hours: number }>()
    for (const r of data || []) {
      const v = m.get(r.employee_id) || { extra_ot_hours: 0, night_hours: 0, holiday_hours: 0 }
      const k = r.ot_type === '야간' ? 'night_hours' : r.ot_type === '휴일' ? 'holiday_hours' : 'extra_ot_hours'
      v[k] = Math.round((v[k] + Number(r.hours)) * 100) / 100
      m.set(r.employee_id, v)
    }
    return m
  }
  const NO_OT = { extra_ot_hours: 0, night_hours: 0, holiday_hours: 0 }

  async function reloadOvertime() {
    if (!confirm('추가근무 메뉴의 이 달 기록으로 연장·야간·휴일 시간을 다시 채울까요?\n(직접 고친 시간은 기록 값으로 바뀌어요)')) return
    const ot = await overtimeSums()
    if (!ot) return
    setBusy(true)
    const sb = createClient()
    for (const it of items) {
      if (!it.employee_id) continue
      const { error } = await sb.from('payroll_items').update({ ...(ot.get(it.employee_id) || NO_OT), updated_at: new Date().toISOString() }).eq('id', it.id)
      if (error) { setBusy(false); toast('반영 실패: ' + error.message); return }
    }
    setBusy(false)
    toast('추가근무 시간을 반영했어요')
    loadItems()
  }

  function itemFrom(e: Employee, s: Setting, sort: number) {
    const prob = probationIn(month, e.hire_date || null, e.resign_date || null, s.probation_end)
    return {
      month, employee_id: e.id, employee_name: e.name, sort,
      position: s.position, work_type: s.work_type,
      monthly_pay: s.monthly_pay, meal: s.meal, car: s.car, position_allowance: s.position_allowance,
      dependents: s.dependents, employment_insurance: s.employment_insurance,
      health_ins: s.health_ins, care_ins: s.care_ins, pension: s.pension,
      pay_rate: prob === 'none' ? 1 : Number(s.probation_rate), rate_note: prob === 'none' ? null : '수습',
      rate_days: typeof prob === 'number' ? prob : null,
      days_worked: daysWorkedIn(month, e.hire_date || null, e.resign_date || null),
      small_business: SMALL_BUSINESS,
    }
  }

  async function generate() {
    const targets = employees.filter(eligible)
      .sort((a, b) => JOB_GROUPS.indexOf(jobGroup(settings.get(a.id)!.work_type)) - JOB_GROUPS.indexOf(jobGroup(settings.get(b.id)!.work_type))
        || rank(settings.get(a.id)!.position) - rank(settings.get(b.id)!.position)
        || (a.hire_date || '').localeCompare(b.hire_date || ''))
    if (targets.length === 0) { toast('급여 기준이 등록된 재직 직원이 없어요. [직원 급여 기준]에서 먼저 입력하세요.'); return }
    setBusy(true)
    const ot = await overtimeSums()
    if (!ot) { setBusy(false); return }
    const { error } = await createClient().from('payroll_items')
      .insert(targets.map((e, i) => ({ ...itemFrom(e, settings.get(e.id)!, i + 1), ...(ot.get(e.id) || NO_OT) })))
    setBusy(false)
    if (error) { toast('만들기 실패: ' + error.message); return }
    toast(`${Number(month.slice(5))}월 급여대장을 만들었어요 (${targets.length}명)`)
    loadItems()
  }

  async function addEmployee(e: Employee) {
    const s = settings.get(e.id)
    if (!s) { toast('이 직원은 급여 기준이 없어요. 먼저 [직원 급여 기준]에서 입력하세요.'); return }
    const ot = await overtimeSums()
    if (!ot) return
    const { error } = await createClient().from('payroll_items')
      .insert([{ ...itemFrom(e, s, items.length + 1), ...(ot.get(e.id) || NO_OT) }])
    if (error) { toast('추가 실패: ' + error.message); return }
    setShowAdd(false)
    loadItems()
  }

  async function saveItem(it: Item) {
    const { id, ...rest } = it
    const { error } = await createClient().from('payroll_items')
      .update({ ...rest, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) { toast('저장 실패: ' + error.message); return }
    setEditItem(null)
    loadItems()
  }

  async function deleteItem(it: Item) {
    if (!confirm(`${it.employee_name} 님을 ${Number(month.slice(5))}월 급여대장에서 뺄까요?`)) return
    const { error } = await createClient().from('payroll_items').delete().eq('id', it.id)
    if (error) { toast('삭제 실패: ' + error.message); return }
    setEditItem(null)
    loadItems()
  }

  async function deleteMonth() {
    if (!confirm(`${month} 급여대장을 통째로 지울까요?\n(경영관리에 저장해 둔 대장은 그대로 남아요)`)) return
    const { error } = await createClient().from('payroll_items').delete().eq('month', month)
    if (error) { toast('삭제 실패: ' + error.message); return }
    loadItems()
  }

  async function saveSetting(s: Setting) {
    const { error } = await createClient().from('employee_pay_settings')
      .upsert({ ...s, updated_at: new Date().toISOString() }, { onConflict: 'employee_id' })
    if (error) { toast('저장 실패: ' + error.message); return }
    toast('급여 기준을 저장했어요 — 다음에 만드는 달부터 적용돼요')
    setEditSetting(null)
    loadBase()
  }

  // 엑셀 양식(급여대장 시트)과 같은 칸 구성
  function sheetRows() {
    const [y, m] = month.split('-').map(Number)
    const headers = ['연번', '성명', '생년월일', '피부양자', '입사일', '만나이', ...COLS.map(c => c[0])]
    const body = rows.map(({ it, r }, i) => {
      const emp = it.employee_id ? empById.get(it.employee_id) : undefined
      const birth = birthFromRrn(emp?.resident_number)
      return [i + 1, it.employee_name, birth || '', Number(it.dependents), emp?.hire_date || '',
        ageAt(birth, new Date(y, m, 0)) ?? '', ...COLS.map(([, f]) => f(r, it))]
    })
    const total = ['총 합계', '', '', '', '', '', ...totals]
    return { headers, body, total }
  }

  async function exportExcel() {
    if (rows.length === 0) return
    const XLSX = await import('xlsx')
    const [y, m] = month.split('-').map(Number)
    const { headers, body, total } = sheetRows()
    const aoa = [
      [`${y}년 ${m}월 급여대장`],
      [`회사명: ${COMPANY.name}`, '', '', '', '', '', '', '', `지급일: ${COMPANY.payDay}`],
      [],
      headers, ...body, total,
    ]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    // 금액 칸 천 단위 쉼표
    const range = XLSX.utils.decode_range(ws['!ref']!)
    for (let R = 4; R <= range.e.r; R++) for (let C = 6; C <= range.e.c; C++) {
      const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })]
      if (cell && typeof cell.v === 'number') cell.z = '#,##0'
    }
    ws['!cols'] = headers.map((h, i) => ({ wch: i < 2 ? 8 : i < 6 ? 11 : Math.max(10, h.length * 2) }))
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '급여대장')
    XLSX.writeFile(wb, `${String(m).padStart(2, '0')}월 급여대장_${y}.xlsx`)
  }

  // 경영관리 > 급여내역에 저장 (그 달 기존 급여내역은 이 대장으로 교체)
  async function storeToFinance() {
    if (rows.length === 0) return
    if (!confirm(`${month} 급여대장을 경영관리 > 급여내역에 저장할까요?\n그 달에 이미 올린 급여내역·급여대장은 이 내용으로 바뀌어요.`)) return
    const { headers, body, total } = sheetRows()
    const cut = 1 // 성명부터 (경영관리 보기 형식)
    const s = (v: string | number) => typeof v === 'number' ? fmt(v) : String(v)
    setBusy(true)
    const { error, warn } = await storeMonthlyLedger(createClient(),
      { month, rows: rows.map(({ it, r }) => ({ name: it.employee_name, base: r.base, gross: r.gross, net: r.net })) },
      { month, headers: headers.slice(cut), rows: body.map(b => b.slice(cut).map(s)), total: total.slice(cut).map(s) },
    )
    setBusy(false)
    if (error) { toast(error); return }
    toast(warn || '경영관리 > 급여내역에 저장했어요')
  }

  if (authLoading || !isAdmin) return (
    <div className="flex h-screen"><Sidebar /><div className="flex-1 flex items-center justify-center text-gray-400">불러오는 중...</div></div>
  )

  const [yy, mm] = month.split('-')
  const notInMonth = employees.filter(e => e.is_active && !items.some(it => it.employee_id === e.id))
  const allWarnings = rows.flatMap(({ it, r }) => r.warnings.map(w => `${it.employee_name}: ${w}`))

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-gray-200 px-4 md:px-8 py-4 md:py-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-gray-900">급여대장</h1>
              <p className="text-sm text-gray-500 mt-0.5">노무사 급여대장 양식 계산식으로 매달 자동 계산합니다.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setShowSettings(true)} disabled={tableMissing}
                className="border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-40">
                직원 급여 기준
              </button>
              <button onClick={exportExcel} disabled={rows.length === 0}
                className="border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-40">
                엑셀 저장
              </button>
              <button onClick={storeToFinance} disabled={rows.length === 0 || busy}
                className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-40">
                경영관리에 저장
              </button>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-auto px-4 md:px-8 py-6 pb-24 flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setMonth(shiftMonth(month, -1))} aria-label="이전 달"
              className="w-9 h-9 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50">◀</button>
            <input type="month" value={month} onChange={e => e.target.value && setMonth(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-semibold bg-white" />
            <button onClick={() => setMonth(shiftMonth(month, 1))} aria-label="다음 달"
              className="w-9 h-9 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50">▶</button>
            {month !== thisMonth() && <button onClick={() => setMonth(thisMonth())} className="text-xs text-green-700 hover:underline ml-1">이번 달</button>}
            <span className="text-xs text-gray-400 ml-auto">지급일 {COMPANY.payDay}</span>
          </div>

          {tableMissing ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-800">
              <p className="font-bold mb-1">DB 준비가 필요해요</p>
              <p>Supabase SQL Editor에서 <code className="bg-white px-1.5 py-0.5 rounded">db/payroll.sql</code>을 한 번 실행하면 바로 쓸 수 있어요.</p>
            </div>
          ) : loading ? (
            <div className="text-center text-gray-400 py-16 text-sm">불러오는 중...</div>
          ) : items.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 text-center py-12 px-4">
              <p className="text-gray-500 text-sm mb-1">{yy}년 {Number(mm)}월 급여대장이 아직 없어요</p>
              <p className="text-gray-400 text-xs mb-5">
                급여 기준이 등록된 재직 직원 {employees.filter(eligible).length}명으로 만들어요. 수습·중도 입사·퇴사는 자동 반영돼요.
              </p>
              <button onClick={generate} disabled={busy}
                className="bg-green-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                {busy ? '만드는 중...' : `${Number(mm)}월 급여대장 만들기`}
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {([['인원', rows.length, '명'], ['급여 합계', totals[7], '원'], ['공제 합계', totals[18], '원'], ['차감지급액', totals[20], '원']] as const).map(([l, v, u]) => (
                  <div key={l} className="bg-white rounded-xl border border-gray-200 px-4 py-3">
                    <p className="text-xs text-gray-400">{l}</p>
                    <p className="text-xl font-bold text-gray-900 mt-0.5">{fmt(v)}<span className="text-sm font-medium text-gray-400 ml-0.5">{u}</span></p>
                  </div>
                ))}
              </div>

              <section>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-sm font-bold text-gray-700">{yy}년 {Number(mm)}월 <span className="text-gray-400 font-normal">· 이름을 누르면 수정</span></h2>
                  <div className="flex gap-3">
                    <button onClick={reloadOvertime} disabled={busy} className="text-xs text-green-700 hover:underline disabled:opacity-40">↻ 추가근무 다시 불러오기</button>
                    <button onClick={() => setShowAdd(true)} className="text-xs text-green-700 hover:underline">+ 직원 추가</button>
                    <button onClick={deleteMonth} className="text-xs text-red-400 hover:text-red-600">이 달 대장 지우기</button>
                  </div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
                  <table className="w-full whitespace-nowrap text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="sticky left-0 bg-gray-50 text-left text-xs font-semibold text-gray-500 px-3 py-2.5">성명</th>
                        {COLS.map(([h]) => <th key={h} className="text-right text-xs font-semibold text-gray-400 px-3 py-2.5">{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(({ it, r }) => (
                        <tr key={it.id} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="sticky left-0 bg-white px-3 py-2.5">
                            <button onClick={() => setEditItem(it)} className="text-green-700 hover:underline font-semibold">{it.employee_name}</button>
                            <span className="block text-[11px] text-gray-400">
                              {jobGroup(it.work_type)} · {it.position || ''} {it.work_type}
                              {Number(it.pay_rate) !== 1 && <span className="text-amber-600"> · {it.rate_note || '지급률'} {Math.round(Number(it.pay_rate) * 100)}%{it.rate_days !== null && it.rate_days !== undefined ? ` ${it.rate_days}일` : ''}</span>}
                              {it.days_worked !== null && <span className="text-amber-600"> · {it.days_worked}/{daysInMonth(month)}일</span>}
                              {r.extraHours > 0 && <span className="text-indigo-600"> · 추가 {r.extraHours}h</span>}
                              {r.warnings.length > 0 && <span className="text-red-500"> · ⚠</span>}
                            </span>
                          </td>
                          {COLS.map(([h, f]) => (
                            <td key={h} className={`px-3 py-2.5 text-right ${BOLD.has(h) ? 'font-bold text-gray-900' : 'text-gray-700'}`}>{fmtZ(f(r, it))}</td>
                          ))}
                        </tr>
                      ))}
                      <tr className="bg-gray-50 font-semibold">
                        <td className="sticky left-0 bg-gray-50 px-3 py-2.5 text-gray-600">총 합계</td>
                        {totals.map((v, i) => <td key={i} className="px-3 py-2.5 text-right text-gray-900">{fmt(v)}</td>)}
                      </tr>
                    </tbody>
                  </table>
                </div>
                {allWarnings.length > 0 && (
                  <ul className="mt-3 text-xs text-red-600 flex flex-col gap-0.5">{allWarnings.map(w => <li key={w}>⚠ {w}</li>)}</ul>
                )}
                <p className="text-xs text-gray-400 mt-3 leading-relaxed">
                  추가근무(연장·야간·휴일)는 ⏱️ 추가근무 기록을 불러와 통상시급 × 시간 × {extraOtMultiplier(SMALL_BUSINESS)}배{SMALL_BUSINESS ? '(5인 미만 — 가산 없음)' : ''}로 계산해요. 포괄연장은 계약대로 1.5배.
                  소득세는 간이세액표(공제대상가족 수 기준), 주민세는 소득세의 10%, 고용보험은 과세합계의 0.9%(10원 미만 절사)로 자동 계산돼요.
                  건강·장기요양·국민연금은 공단 고지액을 그대로 써요.
                </p>
              </section>
            </>
          )}
        </div>
      </div>

      {editItem && (
        <ItemModal item={editItem} emp={editItem.employee_id ? empById.get(editItem.employee_id) : undefined} month={month}
          onClose={() => setEditItem(null)} onSave={saveItem} onDelete={deleteItem}
          onReload={() => {
            const e = editItem.employee_id ? empById.get(editItem.employee_id) : undefined
            const s = editItem.employee_id ? settings.get(editItem.employee_id) : undefined
            if (!e || !s) { toast('급여 기준이 없어 불러올 수 없어요'); return null }
            return { ...editItem, ...itemFrom(e, s, editItem.sort) }
          }} />
      )}

      {showAdd && (
        <Modal title="급여대장에 직원 추가" onClose={() => setShowAdd(false)}>
          <div className="px-6 py-4 flex flex-col gap-1.5">
            {notInMonth.length === 0 && <p className="text-sm text-gray-400 py-4 text-center">추가할 재직 직원이 없어요</p>}
            {notInMonth.map(e => (
              <button key={e.id} onClick={() => addEmployee(e)}
                className="flex items-center justify-between border border-gray-200 rounded-lg px-4 py-2.5 text-sm hover:border-green-500">
                <span className="font-medium">{e.name} <span className="text-gray-400 text-xs">{e.employment_type}</span></span>
                <span className="text-xs text-gray-400">{settings.has(e.id) ? '추가' : '급여 기준 없음'}</span>
              </button>
            ))}
          </div>
        </Modal>
      )}

      {showSettings && !editSetting && (
        <Modal title="직원 급여 기준" onClose={() => setShowSettings(false)} wide>
          <div className="px-6 py-4 flex flex-col gap-4">
            <p className="text-xs text-gray-500">새 달 급여대장을 만들 때 쓰는 기본값이에요. 바꿔도 이미 만든 달은 그대로예요(그 달 대장에 복사돼 있음).</p>

            {/* 노무사 자료 첫 페이지 '급여셋팅' — 근무구분별 근로조건 */}
            <div className="border border-gray-200 rounded-xl overflow-x-auto">
              <table className="w-full whitespace-nowrap text-xs">
                <thead>
                  <tr className="bg-gray-50 text-gray-500">
                    <th className="text-left px-3 py-2">직군</th><th className="text-left px-3 py-2">근무구분</th>
                    <th className="text-left px-3 py-2">근무시간</th><th className="text-left px-3 py-2">휴게</th>
                    <th className="text-left px-3 py-2">근로일</th><th className="text-left px-3 py-2">휴일</th>
                    <th className="text-right px-3 py-2">기본</th><th className="text-right px-3 py-2">포괄연장</th>
                  </tr>
                </thead>
                <tbody>
                  {JOB_GROUPS.flatMap(g => WORK_TYPE_LIST.filter(w => jobGroup(w) === g).map((w, i) => {
                    const t = WORK_TYPES[w]
                    return (
                      <tr key={w} className="border-t border-gray-100">
                        <td className="px-3 py-1.5 font-semibold text-gray-700">{i === 0 ? g : ''}</td>
                        <td className="px-3 py-1.5">{w}</td><td className="px-3 py-1.5">{t.time}</td><td className="px-3 py-1.5">{t.rest}</td>
                        <td className="px-3 py-1.5">{t.days}</td><td className="px-3 py-1.5">{t.off}</td>
                        <td className="px-3 py-1.5 text-right">{BASE_HOURS}h</td>
                        <td className="px-3 py-1.5 text-right">{t.inclusiveOt ? `${t.inclusiveOt}h ×1.5` : '-'}</td>
                      </tr>
                    )
                  }))}
                </tbody>
              </table>
            </div>

            {(() => {
              const row = (e: Employee) => {
                const s = settings.get(e.id)
                return (
                  <button key={e.id} onClick={() => setEditSetting({ emp: e, s: s || defaultSetting(e.id) })}
                    className="flex flex-wrap items-center gap-x-3 gap-y-0.5 border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-left hover:border-green-500">
                    <span className="font-semibold w-20">{e.name}</span>
                    {s ? (
                      <>
                        <span className="text-gray-500 text-xs">{s.position || '-'} · {s.work_type}</span>
                        <span className="text-gray-900 font-medium">월 {fmt(Number(s.monthly_pay))}원</span>
                        <span className="text-gray-400 text-xs">가족 {s.dependents}명{s.employment_insurance ? '' : ' · 고용보험 X'}{s.probation_end ? ` · 수습 ~${s.probation_end}` : ''}</span>
                      </>
                    ) : <span className="text-amber-600 text-xs">급여 기준 미입력 — 눌러서 입력</span>}
                    <span className="ml-auto text-xs text-gray-400">{e.is_active ? e.employment_type : '퇴사 · 기준 보관'}</span>
                  </button>
                )
              }
              const withSet = employees.filter(e => settings.has(e.id))
              const missing = employees.filter(e => e.is_active && !settings.has(e.id) && e.employment_type === '상용직')
              const daily = employees.filter(e => e.is_active && !settings.has(e.id) && e.employment_type !== '상용직')
              return (
                <>
                  {JOB_GROUPS.map(g => {
                    const list = withSet.filter(e => jobGroup(settings.get(e.id)!.work_type) === g)
                      .sort((a, b) => Number(b.is_active) - Number(a.is_active) || rank(settings.get(a.id)!.position) - rank(settings.get(b.id)!.position))
                    return (
                      <section key={g} className="flex flex-col gap-1.5">
                        <h3 className="text-sm font-bold text-gray-700">{g} <span className="text-gray-400 font-normal">({list.filter(e => e.is_active).length}명{list.some(e => !e.is_active) ? ` · 퇴사 ${list.filter(e => !e.is_active).length}` : ''})</span></h3>
                        {list.length === 0 ? <p className="text-xs text-gray-400">없음</p> : list.map(row)}
                      </section>
                    )
                  })}
                  {missing.length > 0 && (
                    <section className="flex flex-col gap-1.5">
                      <h3 className="text-sm font-bold text-amber-700">급여 기준 미입력 <span className="font-normal">({missing.length}명) — 근무구분을 정하면 사무직/현장직으로 들어가요</span></h3>
                      {missing.map(row)}
                    </section>
                  )}
                  {daily.length > 0 && (
                    <details className="text-sm">
                      <summary className="cursor-pointer text-gray-500 text-xs">일용직 {daily.length}명 (노무사 급여대장 대상 아님)</summary>
                      <div className="flex flex-col gap-1.5 mt-2">{daily.map(row)}</div>
                    </details>
                  )}
                </>
              )
            })()}
          </div>
        </Modal>
      )}

      {editSetting && (
        <SettingModal emp={editSetting.emp} initial={editSetting.s}
          others={employees.filter(e => e.id !== editSetting.emp.id && settings.has(e.id)).map(e => ({ name: e.name, s: settings.get(e.id)! }))}
          onClose={() => setEditSetting(null)} onSave={saveSetting} />
      )}
    </div>
  )
}

function defaultSetting(employee_id: string): Setting {
  return {
    employee_id, work_type: '본사', position: '사원', monthly_pay: 0, meal: 200000, car: 0, position_allowance: 0,
    dependents: 1, employment_insurance: true, health_ins: 0, care_ins: 0, pension: 0, probation_end: null, probation_rate: 0.9,
  }
}

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className={`bg-white rounded-2xl w-full ${wide ? 'max-w-2xl' : 'max-w-md'} shadow-xl max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="text-gray-400 text-2xl" aria-label="닫기">&times;</button>
        </div>
        {children}
      </div>
    </div>
  )
}

const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500'

function NumField({ label, value, onChange, hint, step }: { label: string; value: number; onChange: (n: number) => void; hint?: string; step?: string }) {
  const [text, setText] = useState(value ? fmt(value) : '')
  return (
    <div>
      <label className="text-xs font-medium text-gray-600 block mb-1">{label}{hint && <span className="text-gray-400 font-normal"> · {hint}</span>}</label>
      <input inputMode={step ? 'decimal' : 'numeric'} value={text} aria-label={label}
        onChange={e => {
          const raw = e.target.value
          setText(raw)
          onChange(step ? Number(raw.replace(/[^0-9.\-]/g, '')) || 0 : toNum(raw))
        }}
        onBlur={() => !step && setText(toNum(text) ? fmt(toNum(text)) : '')}
        className={inputCls + ' text-right'} />
    </div>
  )
}

function CommonFields<T extends Setting | Item>({ f, set }: { f: T; set: (patch: Partial<T>) => void }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">근무구분</label>
          <select value={f.work_type} onChange={e => set({ work_type: e.target.value } as Partial<T>)} className={inputCls}>
            {WORK_TYPE_LIST.map(w => <option key={w} value={w}>{w}</option>)}
          </select>
          <p className="text-[11px] text-gray-400 mt-1">
            {WORK_TYPES[f.work_type as keyof typeof WORK_TYPES]?.time} · 포괄연장 {WORK_TYPES[f.work_type as keyof typeof WORK_TYPES]?.inclusiveOt || 0}시간
          </p>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">직책</label>
          <input value={f.position || ''} onChange={e => set({ position: e.target.value } as Partial<T>)} className={inputCls} placeholder="사원" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {PAY_FIELDS.map(([k, l, h]) => (
          <NumField key={k} label={l} hint={h && k !== 'monthly_pay' ? h : undefined} value={Number(f[k])} onChange={n => set({ [k]: n } as Partial<T>)} />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 items-end">
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">공제대상가족 수 <span className="text-gray-400 font-normal">· 본인 포함</span></label>
          <select value={f.dependents} onChange={e => set({ dependents: Number(e.target.value) } as Partial<T>)} className={inputCls}>
            {Array.from({ length: 11 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}명</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700 pb-2">
          <input type="checkbox" checked={f.employment_insurance} onChange={e => set({ employment_insurance: e.target.checked } as Partial<T>)} className="w-4 h-4 accent-green-600" />
          고용보험 가입 <span className="text-xs text-gray-400">(대표·임원 X)</span>
        </label>
      </div>
      <div>
        <p className="text-xs font-medium text-gray-600 mb-1">4대보험 공단 고지액</p>
        <div className="grid grid-cols-3 gap-2">
          {INS_FIELDS.map(([k, l]) => <NumField key={k} label={l} value={Number(f[k])} onChange={n => set({ [k]: n } as Partial<T>)} />)}
        </div>
      </div>
    </>
  )
}

function SettingModal({ emp, initial, others, onClose, onSave }: {
  emp: Employee; initial: Setting; others: { name: string; s: Setting }[]; onClose: () => void; onSave: (s: Setting) => void
}) {
  const [f, setF] = useState<Setting>(initial)
  const [ver, setVer] = useState(0) // 불러오기 후 입력칸 새로 그리기
  const set = (p: Partial<Setting>) => setF(prev => ({ ...prev, ...p }))
  // 신규 입사자: 같은 자리 직원(예: 퇴사한 디자이너)의 급여 조건만 복사 — 가족 수·4대보험 고지액·수습은 사람마다 달라 제외
  function copyFrom(o: Setting) {
    setF(prev => ({
      ...prev, work_type: o.work_type, position: o.position, monthly_pay: Number(o.monthly_pay),
      meal: Number(o.meal), car: Number(o.car), position_allowance: Number(o.position_allowance),
    }))
    setVer(v => v + 1)
  }
  return (
    <Modal title={`${emp.name} · 급여 기준`} onClose={onClose}>
      <form key={ver} onSubmit={e => { e.preventDefault(); onSave(f) }} className="px-6 py-5 flex flex-col gap-4">
        {others.length > 0 && (
          <select value="" onChange={e => { const o = others.find(x => x.name === e.target.value); if (o) copyFrom(o.s) }}
            aria-label="다른 직원 기준 불러오기" className={inputCls + ' text-gray-500'}>
            <option value="">↺ 다른 직원 기준 불러오기 (급여 조건만)</option>
            {others.map(o => <option key={o.name} value={o.name}>{o.name} — {o.s.position || '-'} · {o.s.work_type} · 월 {fmt(Number(o.s.monthly_pay))}원</option>)}
          </select>
        )}
        <CommonFields f={f} set={set} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">수습 종료일 <span className="text-gray-400 font-normal">· 이 날까지 지급률 적용</span></label>
            <input type="date" value={f.probation_end || ''} onChange={e => set({ probation_end: e.target.value || null })} className={inputCls} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">수습 지급률(%)</label>
            <input inputMode="numeric" value={Math.round(Number(f.probation_rate) * 100)} aria-label="수습 지급률"
              onChange={e => set({ probation_rate: Math.min(100, toNum(e.target.value)) / 100 })} className={inputCls + ' text-right'} />
          </div>
        </div>
        <div className="flex gap-2 mt-1">
          <button type="button" onClick={onClose} className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm font-medium">취소</button>
          <button type="submit" className="flex-1 bg-green-600 text-white py-2.5 rounded-lg text-sm font-medium">저장</button>
        </div>
      </form>
    </Modal>
  )
}

function ItemModal({ item, emp, month, onClose, onSave, onDelete, onReload }: {
  item: Item; emp: Employee | undefined; month: string
  onClose: () => void; onSave: (it: Item) => void; onDelete: (it: Item) => void; onReload: () => Item | null
}) {
  const [f, setF] = useState<Item>(item)
  const [ver, setVer] = useState(0) // 기본값 다시 불러오기 시 입력칸 초기화용
  // 그 달 근태 기록(직원정보내역에서 입력) — 근태 공제 금액 넣을 때 참고
  const [atts, setAtts] = useState<{ att_date: string; att_type: string; memo: string | null }[] | null>(null)
  useEffect(() => {
    if (!item.employee_id) return
    let on = true
    createClient().from('employee_attendance').select('att_date, att_type, memo').eq('employee_id', item.employee_id)
      .gte('att_date', `${month}-01`).lt('att_date', `${shiftMonth(month, 1)}-01`).order('att_date')
      .then(({ data }) => { if (on) setAtts(data || []) })
    return () => { on = false }
  }, [item.employee_id, month])
  const set = (p: Partial<Item>) => setF(prev => ({ ...prev, ...p }))
  const r = calcPay(toInput(f, emp, month), Number(month.slice(0, 4)))
  const md = daysInMonth(month)
  return (
    <Modal title={`${item.employee_name} · ${Number(month.slice(5))}월 급여`} onClose={onClose}>
      <form key={ver} onSubmit={e => { e.preventDefault(); onSave(f) }} className="px-6 py-5 flex flex-col gap-4">
        <div className="bg-green-50 border border-green-100 rounded-xl px-4 py-3 grid grid-cols-3 gap-2 text-center">
          <div><p className="text-[11px] text-gray-500">급여합계</p><p className="font-bold">{fmt(r.gross)}</p></div>
          <div><p className="text-[11px] text-gray-500">공제합계</p><p className="font-bold">{fmt(r.deductions)}</p></div>
          <div><p className="text-[11px] text-gray-500">차감지급액</p><p className="font-bold text-green-700">{fmt(r.net)}</p></div>
          <p className="col-span-3 text-[11px] text-gray-500">
            통상시급 {fmt(Math.round(r.hourly))}원 · 기본급 {fmt(r.base)} · 연장근로 {fmt(r.ot)} · 소득세 {fmt(r.incomeTax)} · 고용보험 {fmt(r.empIns)}
          </p>
          {r.warnings.map(w => <p key={w} className="col-span-3 text-[11px] text-red-600">⚠ {w}</p>)}
        </div>

        <p className="text-xs font-bold text-gray-700 -mb-2">이번 달 변동</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 grid grid-cols-3 gap-2">
            <NumField label="연장" hint="포괄 외" step="0.5" value={Number(f.extra_ot_hours)} onChange={n => set({ extra_ot_hours: n })} />
            <NumField label="야간" step="0.5" value={Number(f.night_hours || 0)} onChange={n => set({ night_hours: n })} />
            <NumField label="휴일" step="0.5" value={Number(f.holiday_hours || 0)} onChange={n => set({ holiday_hours: n })} />
            <p className="col-span-3 text-[11px] text-gray-500 -mt-1">
              추가근무 {r.extraHours}시간 × 통상시급 × {extraOtMultiplier(f.small_business ?? SMALL_BUSINESS)}배 = <b>{fmt(r.extraOt)}원</b>
              <label className="ml-2 inline-flex items-center gap-1">
                <input type="checkbox" checked={f.small_business ?? SMALL_BUSINESS} onChange={e => set({ small_business: e.target.checked })} className="accent-green-600" />
                5인 미만(가산 없음)
              </label>
            </p>
          </div>
          <NumField label="상여금" value={Number(f.bonus)} onChange={n => set({ bonus: n })} />
          {atts && atts.length > 0 && (
            <div className="col-span-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 text-[11px] text-amber-800">
              <b>이 달 근태 기록</b> · {atts.map(a => `${a.att_date.slice(5).replace('-', '/')} ${a.att_type}${a.memo ? `(${a.memo})` : ''}`).join(', ')}
            </div>
          )}
          <NumField label="근태 공제" hint="지각·결근" value={Number(f.attendance_deduction)} onChange={n => set({ attendance_deduction: n })} />
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">근태 공제 사유</label>
            <input value={f.attendance_note || ''} onChange={e => set({ attendance_note: e.target.value })} className={inputCls} placeholder="예: 결근 1일" />
          </div>
          <NumField label="건강보험 정산" hint="환급은 −" value={Number(f.health_adj)} onChange={n => set({ health_adj: n })} />
          <NumField label="장기요양 정산" value={Number(f.care_adj)} onChange={n => set({ care_adj: n })} />
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">지급률(%) <span className="text-gray-400 font-normal">· 수습 90</span></label>
            <div className="flex gap-1.5">
              <input inputMode="numeric" value={Math.round(Number(f.pay_rate) * 100)} aria-label="지급률"
                onChange={e => set({ pay_rate: Math.min(100, toNum(e.target.value)) / 100 })} className={inputCls + ' text-right'} />
              <input value={f.rate_note || ''} onChange={e => set({ rate_note: e.target.value || null })} placeholder="사유" className={inputCls} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">지급률 적용 일수 <span className="text-gray-400 font-normal">· 수습이 달 중간에 끝날 때</span></label>
            <input inputMode="numeric" value={f.rate_days ?? ''} placeholder="근무한 날 전부" aria-label="지급률 적용 일수"
              onChange={e => set({ rate_days: e.target.value.trim() === '' ? null : Math.min(md, toNum(e.target.value)) })}
              className={inputCls + ' text-right'} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">근무일수 <span className="text-gray-400 font-normal">· 중도 입·퇴사 (/{md}일)</span></label>
            <input inputMode="numeric" value={f.days_worked ?? ''} placeholder="한 달 전부" aria-label="근무일수"
              onChange={e => set({ days_worked: e.target.value.trim() === '' ? null : Math.min(md, toNum(e.target.value)) })}
              className={inputCls + ' text-right'} />
          </div>
          <NumField label="두리누리 지원액" hint="참고" value={Number(f.duri)} onChange={n => set({ duri: n })} />
        </div>

        <details className="border-t border-gray-100 pt-3">
          <summary className="text-xs font-bold text-gray-700 cursor-pointer">급여 기준 (이 달만 바꾸기)</summary>
          <div className="flex flex-col gap-4 mt-3"><CommonFields f={f} set={set} /></div>
          <button type="button" onClick={() => { const n = onReload(); if (n) { setF(n); setVer(v => v + 1) } }}
            className="mt-3 text-xs text-green-700 hover:underline">↺ 직원 급여 기준에서 다시 불러오기</button>
        </details>

        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">메모</label>
          <input value={f.memo || ''} onChange={e => set({ memo: e.target.value })} className={inputCls} />
        </div>

        <div className="flex gap-2 mt-1">
          <button type="button" onClick={() => onDelete(item)} className="border border-red-200 text-red-500 px-4 py-2.5 rounded-lg text-sm">빼기</button>
          <button type="button" onClick={onClose} className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm font-medium">취소</button>
          <button type="submit" className="flex-1 bg-green-600 text-white py-2.5 rounded-lg text-sm font-medium">저장</button>
        </div>
      </form>
    </Modal>
  )
}
