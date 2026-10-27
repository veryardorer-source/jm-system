'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { toast } from '@/components/Toaster'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase-browser'
import { FixedCost, Payroll, ProjectProfit, Project, supabase } from '@/lib/supabase'
import { parseExcelRows, ParsedRow, parsePayrollLedger, PayrollLedger, parsePayrollLedgerFull, PayrollLedgerFull, parseBonusLedger, BonusLedger } from '@/lib/excel-parse'
import { storeMonthlyLedger } from '@/lib/payroll-store'
import FileDropInput from '@/components/FileDropInput'
import { openPdfTitled, resolveFileUrl, removeStoredFile, downloadUrl, SECURE_PREFIX } from '@/lib/media'
import { normalizePdfTitle } from '@/lib/pdf'
import { readQuoteAmounts, QuoteAmounts } from '@/lib/quote-parse'
import { readExpenseFile, ExpenseSheet } from '@/lib/expense-parse'
import SortSelect from '@/components/SortSelect'

const TAB_LIST = ['고정지출', '급여내역', '현장별 이익', '견적서'] as const // 매출매입 탭은 2026-10-27 제외(finance_sales 자료는 DB에 그대로)
type Tab = typeof TAB_LIST[number]

type Quote = { id: string; title: string; quote_date: string | null; amount: number; extra_amount: number | null; insurance: number | null; vat: number | null; net_profit: number | null; merged_into: string | null; confirmed?: boolean | null; confirmed_at?: string | null; memo: string | null; file_url: string | null; file_name: string | null; created_at: string }
type HqExpense = { year: number; amount: number; memo: string | null }

function TrendChart({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(...data.map(d => d.value), 1)
  if (data.length === 0) return <p className="text-xs text-gray-400 text-center py-8">자료가 없어요</p>
  return (
    <div className="flex items-end gap-2 h-40 overflow-x-auto pb-1">
      {data.map((d, i) => (
        <div key={i} className="flex flex-col items-center gap-1 flex-shrink-0" style={{ minWidth: '52px' }}>
          <span className="text-[10px] text-gray-500 whitespace-nowrap">{(d.value/10000).toFixed(0)}만</span>
          <div className={`w-8 rounded-t-md transition-all ${d.value < 0 ? 'bg-red-400' : 'bg-green-500'}`}
            style={{ height: `${Math.max((Math.abs(d.value) / max) * 110, 4)}px` }} />
          <span className="text-[10px] text-gray-400 whitespace-nowrap">{d.label}</span>
        </div>
      ))}
    </div>
  )
}

export default function FinancePage() {
  const router = useRouter()
  const { profile: myProfile, loading: authLoading } = useAuth()
  const [tab, setTab] = useState<Tab>('고정지출')
  const [loading, setLoading] = useState(true)

  const [fixedCosts, setFixedCosts] = useState<FixedCost[]>([])
  const [payrolls, setPayrolls] = useState<Payroll[]>([])
  const [profits, setProfits] = useState<ProjectProfit[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [hqExpenses, setHqExpenses] = useState<HqExpense[]>([])

  useEffect(() => {
    if (!authLoading) {
      if (!myProfile || myProfile.role !== 'admin') { router.push('/'); return }
      fetchAll()
    }
  }, [authLoading, myProfile, router])

  async function fetchAll() {
    setLoading(true)
    const sb = createClient()
    const [fc, pr, pp, proj, qt, hq] = await Promise.all([
      sb.from('finance_fixed_costs').select('*').order('month', { ascending: false }),
      sb.from('finance_payroll').select('*').order('month', { ascending: false }),
      sb.from('finance_project_profit').select('*').order('month', { ascending: false }),
      supabase.from('projects').select('*').order('name'),
      sb.from('finance_quotes').select('*').order('quote_date', { ascending: false, nullsFirst: false }),
      sb.from('finance_hq_expense').select('*'),
    ])
    setFixedCosts(fc.data || [])
    setPayrolls(pr.data || [])
    setProfits(pp.data || [])
    setProjects(proj.data || [])
    setQuotes(qt.data || [])
    setHqExpenses(hq.data || []) // 표가 아직 없으면(db/quote_profit.sql 미실행) 빈 목록
    setLoading(false)
  }

  if (authLoading || loading) return (
    <div className="flex flex-col h-screen">
      <Sidebar />
      <div className="flex-1 flex items-center justify-center text-gray-400">불러오는 중...</div>
    </div>
  )

  return (
    <div className="flex flex-col min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <header className="bg-white border-b border-gray-200 px-4 md:px-8 py-4 md:py-5">
          <h1 className="text-xl font-bold text-gray-900">경영관리</h1>
          <p className="text-sm text-gray-500 mt-0.5">관리자만 볼 수 있는 회사 재정 자료입니다</p>
        </header>
        <div className="bg-white border-b border-gray-200 px-4 md:px-8">
          <div className="flex gap-1 overflow-x-auto">
            {TAB_LIST.map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-5 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                  tab === t ? 'border-green-600 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}>
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-auto px-4 md:px-8 py-6 pb-20 md:pb-24">
          {tab === '고정지출' && <FixedCostTab list={fixedCosts} onRefresh={fetchAll} />}
          {tab === '급여내역' && <PayrollTab list={payrolls} onRefresh={fetchAll} />}
          {tab === '현장별 이익' && <ProfitTab list={profits} projects={projects} onRefresh={fetchAll} />}
          {tab === '견적서' && <QuoteTab list={quotes} hqExpenses={hqExpenses} fixedCosts={fixedCosts} onRefresh={fetchAll} />}
        </div>
      </div>
    </div>
  )
}

// ───────────── 고정지출 ─────────────
function FixedCostTab({ list, onRefresh }: { list: FixedCost[]; onRefresh: () => void }) {
  const [showForm, setShowForm] = useState(false)
  const [showBulk, setShowBulk] = useState(false)
  const [editing, setEditing] = useState<FixedCost | null>(null)
  const [form, setForm] = useState({ month: '', title: '', amount: '', memo: '' })
  const [saving, setSaving] = useState(false)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!form.month || !form.title) return
    setSaving(true)
    const sb = createClient()
    const payload = { month: form.month + '-01', title: form.title, amount: Number(form.amount) || 0, memo: form.memo }
    const { error } = editing
      ? await sb.from('finance_fixed_costs').update(payload).eq('id', editing.id)
      : await sb.from('finance_fixed_costs').insert([payload])
    if (error) { toast('저장 실패: ' + error.message); setSaving(false); return }
    setForm({ month: '', title: '', amount: '', memo: '' })
    setEditing(null); setShowForm(false); setSaving(false)
    onRefresh()
  }

  async function del(c: FixedCost) {
    if (!confirm(`"${c.title}" 항목을 삭제할까요?`)) return
    const sb = createClient()
    await sb.from('finance_fixed_costs').delete().eq('id', c.id)
    onRefresh()
  }

  const byMonth = Object.values(list.reduce((acc, c) => {
    const k = c.month?.slice(0, 7) || ''
    acc[k] = acc[k] || { label: k.slice(2).replace('-', '.'), value: 0, key: k }
    acc[k].value += c.amount
    return acc
  }, {} as Record<string, { label: string; value: number; key: string }>)).sort((a, b) => a.key.localeCompare(b.key))

  return (
    <div>
      <div className="flex justify-end gap-2 mb-4">
        <button onClick={() => setShowBulk(true)}
          className="border border-green-600 text-green-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-50">📊 월 지출 엑셀 올리기</button>
        <button onClick={() => { setEditing(null); setForm({ month: '', title: '', amount: '', memo: '' }); setShowForm(true) }}
          className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700">+ 직접 추가</button>
      </div>
      {list.length === 0 ? (
        <EmptyState icon="📋" text="등록된 고정지출이 없어요" />
      ) : (
        <>
          <ChartCard title="월별 고정지출 추이" data={byMonth} />
          <SimpleTable
            cols={['월', '항목', '금액', '메모']}
            rows={list.map(c => [c.month?.slice(0,7), c.title, c.amount.toLocaleString() + '원', c.memo || '-'])}
            onEdit={i => { const c = list[i]; setEditing(c); setForm({ month: c.month?.slice(0,7) || '', title: c.title, amount: String(c.amount), memo: c.memo || '' }); setShowForm(true) }}
            onDelete={i => del(list[i])}
          />
        </>
      )}
      {showForm && (
        <FormModal title={editing ? '고정지출 수정' : '고정지출 추가'} onClose={() => setShowForm(false)} onSubmit={save} saving={saving}>
          <MonthInput value={form.month} onChange={v => setForm({ ...form, month: v })} />
          <TextInput label="항목명 *" required value={form.title} onChange={v => setForm({ ...form, title: v })} placeholder="임대료, 보험료 등" />
          <NumberInput label="금액 *" required value={form.amount} onChange={v => setForm({ ...form, amount: v })} />
          <TextInput label="메모" value={form.memo} onChange={v => setForm({ ...form, memo: v })} />
        </FormModal>
      )}
      {showBulk && (
        <ExpenseUploadModal existing={list} onClose={() => setShowBulk(false)} onSaved={() => { setShowBulk(false); onRefresh() }} />
      )}
    </div>
  )
}

// 본사 월 지출 엑셀(경리나라 손익보고서 정리본) → 그 달 고정지출을 용도별로 교체 저장. 견적서 탭 '본사 총지출'이 이 합계를 쓴다.
const GPT_PROMPT = `경리나라 본사 손익보고서(2026년 ○월)를 보고, 첨부한 '본사_월지출_양식.xlsx' 양식대로 정리해 줘.
- 1행 제목: 2026년 ○월 본사 지출
- 4행 머리글(용도 | 지출액 | 건수 | 메모)은 그대로 두기
- 손익보고서의 '비용' 항목을 용도별로 한 줄씩, 지출액은 부가세 포함·취소/환불 차감 전 금액
- 매출(환불)·매입(할인) 줄은 넣지 않기, 마지막 줄은 '합계'`

function ExpenseUploadModal({ existing, onClose, onSaved }: { existing: FixedCost[]; onClose: () => void; onSaved: () => void }) {
  const [sheet, setSheet] = useState<ExpenseSheet | null>(null)
  const [fileName, setFileName] = useState('')
  const [month, setMonth] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function pick(f: File) {
    setError(''); setSheet(null); setFileName(f.name)
    const r = await readExpenseFile(f).catch(() => null)
    if (!r) { setError("표에서 '용도'와 '지출액'(또는 금액) 머리글을 찾지 못했어요. 아래 양식대로 정리된 파일인지 확인해 주세요."); return }
    setSheet(r); setMonth(r.month || '')
  }

  const same = existing.filter(c => c.month?.slice(0, 7) === month)
  const sameSum = same.reduce((t, c) => t + (c.amount || 0), 0)

  async function save() {
    if (!sheet || !month) return
    setSaving(true)
    const sb = createClient()
    // 같은 달은 새 내용으로 교체 — 다시 올려도 두 번 더해지지 않게
    const { error: delErr } = await sb.from('finance_fixed_costs').delete().eq('month', month + '-01')
    if (delErr) { toast('저장 실패: ' + delErr.message); setSaving(false); return }
    const { error: insErr } = await sb.from('finance_fixed_costs').insert(
      sheet.rows.map(r => ({ month: month + '-01', title: r.label, amount: r.amount, memo: '월지출 엑셀: ' + fileName })))
    setSaving(false)
    if (insErr) { toast('저장 실패: ' + insErr.message); return }
    toast(`${month} 지출 ${sheet.rows.length}개 용도 · ${sheet.total.toLocaleString()}원을 저장했어요`, 'ok')
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 sticky top-0 bg-white">
          <h2 className="text-lg font-bold">월 지출 엑셀 올리기</h2>
          <button onClick={onClose} className="text-gray-400 text-2xl">&times;</button>
        </div>
        <div className="px-6 py-5 flex flex-col gap-4">
          <FileDropInput onFile={pick} currentName={fileName || undefined} accept=".xlsx,.xls,.xlsm,.xlsb" hint="경리나라 월 지출 정리 엑셀" />
          {error && <p className="text-sm text-orange-600">{error}</p>}
          {sheet && <>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1.5">지출 달 * <span className="text-gray-400 font-normal">(파일 제목에서 찾았어요 — 다르면 고치세요)</span></label>
              <input type="month" value={month} onChange={e => setMonth(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <tbody>
                  {sheet.rows.map(r => (
                    <tr key={r.label} className="border-b border-gray-50">
                      <td className="px-3 py-1.5 text-gray-700">{r.label}</td>
                      <td className="px-3 py-1.5 text-right text-gray-800">{r.amount.toLocaleString()}원</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 font-semibold">
                    <td className="px-3 py-2">합계 ({sheet.rows.length}개 용도)</td>
                    <td className="px-3 py-2 text-right">{sheet.total.toLocaleString()}원</td>
                  </tr>
                </tbody>
              </table>
            </div>
            {!!sheet.fileTotal && (sheet.fileTotal === sheet.total
              ? <p className="text-xs text-green-700 -mt-2">✓ 파일의 합계 줄과 같아요</p>
              : <p className="text-xs text-orange-600 -mt-2">파일의 합계 줄({sheet.fileTotal.toLocaleString()}원)과 달라요 — 파일을 확인해 주세요</p>)}
            {same.length > 0 && <p className="text-xs text-orange-600">{month}에 이미 {same.length}건({sameSum.toLocaleString()}원)이 있어요. 저장하면 새 내용으로 바뀌어요.</p>}
            <button onClick={save} disabled={saving || !month}
              className="bg-green-600 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
              {saving ? '저장 중...' : !month ? '달을 골라 주세요' : `${month} 지출 저장`}
            </button>
          </>}
          <details className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
            <summary className="cursor-pointer font-medium text-gray-600">양식 · 지피티에게 부탁하는 말</summary>
            <p className="mt-2">지금 지피티가 만들어 주는 &apos;○월 지출요약&apos; 파일도 그대로 올리면 돼요. 새로 맞춘다면 아래 양식을 쓰세요.</p>
            <a href="/templates/본사_월지출_양식.xlsx" download className="inline-block mt-2 text-green-600 underline">📥 본사_월지출_양식.xlsx 받기</a>
            <pre className="mt-2 whitespace-pre-wrap bg-white border border-gray-200 rounded p-2 text-[11px] text-gray-700">{GPT_PROMPT}</pre>
            <button type="button" onClick={() => navigator.clipboard.writeText(GPT_PROMPT).then(() => toast('복사했어요', 'ok'))}
              className="mt-1 text-green-600 underline">부탁하는 말 복사</button>
          </details>
        </div>
      </div>
    </div>
  )
}

// ───────────── 급여내역 ─────────────
function PayrollTab({ list, onRefresh }: { list: Payroll[]; onRefresh: () => void }) {
  const [showForm, setShowForm] = useState(false)
  const [showBulk, setShowBulk] = useState(false)
  const [editing, setEditing] = useState<Payroll | null>(null)
  const [form, setForm] = useState({ month: '', employee_name: '', amount: '', memo: '' })
  const [saving, setSaving] = useState(false)
  const [view, setView] = useState<'month' | 'person' | 'ledger'>('month')
  const [showLedger, setShowLedger] = useState(false)
  const [ledgerRefresh, setLedgerRefresh] = useState(0)

  async function bulkSave(month: string, rows: ParsedRow[]) {
    const sb = createClient()
    const { error } = await sb.from('finance_payroll').insert(
      rows.map(r => ({ month: month + '-01', employee_name: r.label, amount: r.amount, memo: '' }))
    )
    if (error) { toast('저장 실패: ' + error.message); return }
    setShowBulk(false)
    onRefresh()
  }

  // 급여대장 업로드 → 그 달 데이터를 새 내용으로 교체 후 저장 (+ 전체 시트 원본도 보관)
  async function ledgerSave(data: PayrollLedger, full: PayrollLedgerFull | null) {
    const { error, warn } = await storeMonthlyLedger(createClient(), data, full)
    if (error) { toast(error); return }
    if (warn) toast(warn)
    setShowLedger(false)
    setLedgerRefresh(n => n + 1)
    onRefresh()
  }

  // 상여금 대장 저장 — 월 급여와 성격이 달라 '급여내역'에는 넣지 않고 대장으로만 보관
  async function bonusSave(b: BonusLedger, month: string) {
    const sb = createClient()
    const { error } = await sb.from('finance_payroll_ledger').upsert({
      month, kind: '상여금', title: b.title, headers: b.headers, rows: b.rows, total: b.total,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'month,kind' })
    if (error) {
      const hint = /kind|title|column|constraint|conflict/i.test(error.message)
        ? ' (관리자에게: db/bonus_ledger.sql 실행 필요)' : ''
      toast('상여금 대장 저장 실패: ' + error.message + hint, 'error')
      return
    }
    toast(`${month} 상여금 대장을 저장했어요 (${b.rows.length}명)`, 'ok')
    setShowLedger(false)
    setLedgerRefresh(n => n + 1)
    onRefresh()
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!form.month || !form.employee_name) return
    setSaving(true)
    const sb = createClient()
    const payload = { month: form.month + '-01', employee_name: form.employee_name, amount: Number(form.amount) || 0, memo: form.memo }
    const { error } = editing
      ? await sb.from('finance_payroll').update(payload).eq('id', editing.id)
      : await sb.from('finance_payroll').insert([payload])
    if (error) { toast('저장 실패: ' + error.message); setSaving(false); return }
    setForm({ month: '', employee_name: '', amount: '', memo: '' })
    setEditing(null); setShowForm(false); setSaving(false)
    onRefresh()
  }

  async function del(p: Payroll) {
    if (!confirm(`"${p.employee_name}" 급여 항목을 삭제할까요?`)) return
    const sb = createClient()
    await sb.from('finance_payroll').delete().eq('id', p.id)
    onRefresh()
  }

  const byMonth = Object.values(list.reduce((acc, c) => {
    const k = c.month?.slice(0, 7) || ''
    acc[k] = acc[k] || { label: k.slice(2).replace('-', '.'), value: 0, key: k }
    acc[k].value += c.amount
    return acc
  }, {} as Record<string, { label: string; value: number; key: string }>)).sort((a, b) => a.key.localeCompare(b.key))

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
          <button onClick={() => setView('month')} className={`px-4 py-2 font-medium ${view === 'month' ? 'bg-green-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>월별</button>
          <button onClick={() => setView('person')} className={`px-4 py-2 font-medium border-l border-gray-200 ${view === 'person' ? 'bg-green-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>개인별</button>
          <button onClick={() => setView('ledger')} className={`px-4 py-2 font-medium border-l border-gray-200 ${view === 'ledger' ? 'bg-green-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>급여대장</button>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowLedger(true)}
            className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700">📋 급여대장 업로드</button>
          <button onClick={() => setShowBulk(true)}
            className="border border-green-600 text-green-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-50">간단 엑셀</button>
          <button onClick={() => { setEditing(null); setForm({ month: '', employee_name: '', amount: '', memo: '' }); setShowForm(true) }}
            className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">+ 직접</button>
        </div>
      </div>
      {view === 'ledger' ? (
        <LedgerView refresh={ledgerRefresh} />
      ) : list.length === 0 ? (
        <EmptyState icon="💵" text="등록된 급여내역이 없어요. '급여대장 업로드'로 엑셀을 올려보세요." />
      ) : view === 'month' ? (
        <>
          <ChartCard title="월별 총 급여 추이 (급여합계 기준)" data={byMonth} />
          <SimpleTable
            cols={['월', '직원명', '급여합계', '메모(실지급 등)']}
            rows={list.map(c => [c.month?.slice(0,7), c.employee_name, c.amount.toLocaleString() + '원', c.memo || '-'])}
            onEdit={i => { const c = list[i]; setEditing(c); setForm({ month: c.month?.slice(0,7) || '', employee_name: c.employee_name, amount: String(c.amount), memo: c.memo || '' }); setShowForm(true) }}
            onDelete={i => del(list[i])}
          />
        </>
      ) : (
        <PayrollPivot list={list} />
      )}
      {showLedger && <LedgerUploadModal onClose={() => setShowLedger(false)} onSave={ledgerSave} onSaveBonus={bonusSave} />}
      {showForm && (
        <FormModal title={editing ? '급여 수정' : '급여 추가'} onClose={() => setShowForm(false)} onSubmit={save} saving={saving}>
          <MonthInput value={form.month} onChange={v => setForm({ ...form, month: v })} />
          <TextInput label="직원명 *" required value={form.employee_name} onChange={v => setForm({ ...form, employee_name: v })} />
          <NumberInput label="금액 *" required value={form.amount} onChange={v => setForm({ ...form, amount: v })} />
          <TextInput label="메모" value={form.memo} onChange={v => setForm({ ...form, memo: v })} />
        </FormModal>
      )}
      {showBulk && (
        <BulkImportModal title="급여내역 엑셀 일괄 추가" labelHeader="직원명" onClose={() => setShowBulk(false)} onSave={bulkSave} />
      )}
    </div>
  )
}

// 개인별 급여 변동 (직원 × 월 표) — 전월 대비 변동 강조. 기본은 실지급(공제 후).
function PayrollPivot({ list }: { list: Payroll[] }) {
  const [mode, setMode] = useState<'net' | 'gross'>('net')
  const months = Array.from(new Set(list.map(p => p.month?.slice(0, 7)).filter(Boolean))).sort() as string[]
  const names = Array.from(new Set(list.map(p => p.employee_name).filter(Boolean)))
  // 실지급: 급여대장 업로드 시 메모에 저장된 "실지급 X원"에서 추출. 없으면(직접 입력 건) 급여합계로 대체.
  const netOf = (p: Payroll) => {
    const m = (p.memo || '').match(/실지급\s*([\d,]+)\s*원/)
    return m ? Number(m[1].replace(/,/g, '')) : p.amount
  }
  const valOf = (p: Payroll) => mode === 'net' ? netOf(p) : p.amount
  const amt = (name: string, m: string) => {
    const p = list.find(x => x.employee_name === name && x.month?.slice(0, 7) === m)
    return p ? valOf(p) : undefined
  }
  if (months.length === 0) return <EmptyState icon="📈" text="자료가 없어요" />
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
      <div className="flex items-center justify-between px-4 pt-3 gap-2 flex-wrap">
        <p className="text-xs text-gray-400">직원별 월 {mode === 'net' ? '실지급액(공제 후)' : '급여합계(세전)'}. 전월과 다르면 색으로 표시돼요. (▲증가 ▼감소)</p>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs flex-shrink-0">
          <button onClick={() => setMode('net')} className={`px-3 py-1.5 font-medium ${mode === 'net' ? 'bg-green-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>실지급</button>
          <button onClick={() => setMode('gross')} className={`px-3 py-1.5 font-medium border-l border-gray-200 ${mode === 'gross' ? 'bg-green-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>세전(급여합계)</button>
        </div>
      </div>
      <table className="w-full whitespace-nowrap text-sm mt-2">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            <th className="text-left text-xs font-semibold text-gray-400 px-4 py-2 sticky left-0 bg-gray-50">직원</th>
            {months.map(m => <th key={m} className="text-right text-xs font-semibold text-gray-400 px-4 py-2">{m}</th>)}
          </tr>
        </thead>
        <tbody>
          {names.map(name => (
            <tr key={name} className="border-b border-gray-50 hover:bg-gray-50">
              <td className="px-4 py-2 font-medium text-gray-800 sticky left-0 bg-white">{name}</td>
              {months.map((m, i) => {
                const v = amt(name, m)
                const prev = i > 0 ? amt(name, months[i - 1]) : undefined
                const changed = v != null && prev != null && v !== prev
                const up = changed && (v as number) > (prev as number)
                return (
                  <td key={m} className={`px-4 py-2 text-right ${v == null ? 'text-gray-300' : changed ? (up ? 'text-green-600 font-semibold' : 'text-red-500 font-semibold') : 'text-gray-700'}`}>
                    {v == null ? '-' : `${v.toLocaleString()}${changed ? (up ? ' ▲' : ' ▼') : ''}`}
                  </td>
                )
              })}
            </tr>
          ))}
          <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
            <td className="px-4 py-2 text-gray-700 sticky left-0 bg-gray-50">월 합계</td>
            {months.map(m => {
              const total = list.filter(p => p.month?.slice(0, 7) === m).reduce((s, p) => s + valOf(p), 0)
              return <td key={m} className="px-4 py-2 text-right text-gray-900">{total.toLocaleString()}</td>
            })}
          </tr>
        </tbody>
      </table>
    </div>
  )
}

// ── 급여대장 전체 보기 (수당·공제 모든 항목) ──
type LedgerRec = { month: string; kind?: string | null; title?: string | null; headers: string[]; rows: string[][]; total: string[] | null }
// 같은 달에 급여대장과 상여금대장이 함께 있을 수 있어 '월+종류'로 구분
const ledgerKey = (l: LedgerRec) => `${l.month}|${l.kind || '급여'}`
const ledgerLabel = (l: LedgerRec) =>
  (l.kind === '상여금') ? `${l.month} 상여금${l.title ? ` · ${l.title}` : ''}` : `${l.month} 급여대장`
const DEDUCT_KEYS = ['건강보험', '장기요양', '국민연금', '고용보험', '소득세', '주민세', '공제', '두리누리', '정산']
function LedgerView({ refresh }: { refresh: number }) {
  const [ledgers, setLedgers] = useState<LedgerRec[]>([])
  const [sel, setSel] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    let on = true
    const sb = createClient()
    sb.from('finance_payroll_ledger').select('*').order('month', { ascending: false }).then(({ data, error }) => {
      if (!on) return
      setLoading(false)
      if (error) { setLoadError(error.message); return }
      const list = (data || []) as LedgerRec[]
      setLedgers(list)
      setSel(s => s && list.some(l => ledgerKey(l) === s) ? s : (list[0] ? ledgerKey(list[0]) : ''))
    })
    return () => { on = false }
  }, [refresh])

  if (loading) return <EmptyState icon="⏳" text="불러오는 중..." />
  if (loadError) return <EmptyState icon="⚠️" text={`급여대장 테이블을 읽지 못했어요 — db/payroll_ledger.sql 실행이 필요할 수 있어요. (${loadError})`} />
  if (ledgers.length === 0) return <EmptyState icon="📋" text="저장된 급여대장이 없어요. '📋 급여대장 업로드'로 엑셀을 올리면 전체 시트(수당·공제 포함)가 여기 보관돼요." />

  const cur = ledgers.find(l => ledgerKey(l) === sel) || ledgers[0]
  const isNum = (v: string) => /^-?[\d,.\s]+$/.test(v || '') || v === '-'
  const colClass = (h: string) => {
    const k = h.replace(/\s/g, '')
    if (k.includes('차감지급')) return 'text-green-700 font-bold bg-green-50'
    if (k.includes('공제합계')) return 'text-red-600 font-bold bg-red-50'
    if (DEDUCT_KEYS.some(d => k.includes(d))) return 'text-red-500'
    if (k.includes('급여합계') || k.includes('지급총액')) return 'font-semibold text-gray-900'
    return 'text-gray-700'
  }
  return (
    <div>
      <div className="flex gap-1.5 mb-3 flex-wrap">
        {ledgers.map(l => (
          <button key={ledgerKey(l)} onClick={() => setSel(ledgerKey(l))}
            className={`text-xs px-3 py-1.5 rounded-full border font-medium ${sel === ledgerKey(l) ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-500 border-gray-300 hover:border-green-400'} ${l.kind === '상여금' && sel !== ledgerKey(l) ? 'text-amber-600 border-amber-300' : ''}`}>
            {ledgerLabel(l)}
          </button>
        ))}
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <p className="text-xs text-gray-400 px-4 pt-3">
          {cur.kind === '상여금'
            ? <>{cur.month} 상여금 대장{cur.title ? ` · ${cur.title}` : ''} · 총 {cur.rows.length}명</>
            : <>{cur.month} 급여대장 원본 · <span className="text-red-500">빨강=공제 항목</span> · <span className="text-green-700 font-medium">초록=차감지급액(실지급)</span></>}
        </p>
        <table className="w-full whitespace-nowrap text-sm mt-2">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              {cur.headers.map((h, i) => (
                <th key={i} className={`text-xs font-semibold px-3 py-2 ${i === 0 ? 'text-left sticky left-0 bg-gray-50' : 'text-right'} ${DEDUCT_KEYS.some(d => h.replace(/\s/g, '').includes(d)) ? 'text-red-400' : 'text-gray-400'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cur.rows.map((row, r) => (
              <tr key={r} className="border-b border-gray-50 hover:bg-gray-50">
                {row.map((v, c) => (
                  <td key={c} className={`px-3 py-2 ${c === 0 ? 'text-left font-medium sticky left-0 bg-white' : 'text-right'} ${c === 0 ? 'text-gray-800' : colClass(cur.headers[c])}`}>
                    {v || '-'}
                  </td>
                ))}
              </tr>
            ))}
            {cur.total && (
              <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                {cur.total.map((v, c) => (
                  <td key={c} className={`px-3 py-2 ${c === 0 ? 'text-left sticky left-0 bg-gray-50 text-gray-700' : 'text-right'} ${c === 0 ? '' : colClass(cur.headers[c])}`}>
                    {c === 0 ? '총 합계' : (isNum(v) ? v : v) || '-'}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// 급여대장 엑셀 업로드 (해당 시트 자동 인식 → 미리보기 → 저장)
function LedgerUploadModal({ onClose, onSave, onSaveBonus }: { onClose: () => void; onSave: (d: PayrollLedger, full: PayrollLedgerFull | null) => Promise<void>; onSaveBonus: (b: BonusLedger, month: string) => Promise<void> }) {
  const [data, setData] = useState<PayrollLedger | null>(null)
  const [bonus, setBonus] = useState<BonusLedger | null>(null) // 상여금 대장으로 인식된 경우
  const [full, setFull] = useState<PayrollLedgerFull | null>(null)
  const [month, setMonth] = useState('') // 'YYYY-MM' (자동 인식 또는 직접 선택)
  const [parsing, setParsing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleFile(file: File | null) {
    if (!file) return
    setParsing(true); setError(''); setData(null); setFull(null); setBonus(null)
    const parsed = await parsePayrollLedger(file).catch(() => null)
    const parsedFull = await parsePayrollLedgerFull(file).catch(() => null)
    if (!parsed) {
      // 급여대장 양식이 아니면 상여금 대장인지 확인
      const b = await parseBonusLedger(file).catch(() => null)
      setParsing(false)
      if (b) { setBonus(b); if (b.month) setMonth(b.month); return }
      setError('파일을 읽지 못했어요. 급여대장은 "급여대장" 시트에 성명·급여합계 열이, 상여금 대장은 성명·상여금액 열이 있어야 해요.')
      return
    }
    setParsing(false)
    if (!parsed) { setError('급여대장 시트에서 성명/급여합계를 찾지 못했어요. 파일에 "급여대장" 시트와 성명·급여합계 열이 있는지 확인해주세요.'); return }
    setData(parsed)
    setFull(parsedFull)
    // 월은 자동 입력하지 않음 — 사용자가 직접 선택 (잘못된 달로 저장 방지)
  }
  async function handleSave() {
    if (bonus && month) { setSaving(true); await onSaveBonus(bonus, month); setSaving(false); return }
    if (!data || !month) return
    setSaving(true)
    await onSave({ month, rows: data.rows }, full ? { ...full, month } : null)
    setSaving(false)
  }
  const total = data?.rows.reduce((s, r) => s + r.gross, 0) || 0

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 sticky top-0 bg-white">
          <h2 className="text-lg font-bold">급여대장 업로드</h2>
          <button onClick={onClose} className="text-gray-400 text-2xl">&times;</button>
        </div>
        <div className="px-6 py-5 flex flex-col gap-4">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1.5">급여대장 엑셀 파일 *</label>
            <input type="file" accept=".xlsx,.xls" onChange={e => handleFile(e.target.files?.[0] || null)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-green-50 file:text-green-700 file:text-xs" />
            <p className="text-xs text-gray-400 mt-1"><b>급여대장</b>과 <b>상여금 대장</b> 모두 올릴 수 있어요 — 양식을 자동으로 구분합니다. 파일 선택 후 <b>어느 달인지 확인</b>하고 저장하세요.</p>
          </div>
          {parsing && <p className="text-sm text-gray-400">분석 중...</p>}
          {error && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
          {data && (
            <>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1.5">급여 월 * <span className="text-amber-600 font-normal">— 어느 달 급여인지 직접 선택하세요</span></label>
              <input type="month" value={month} onChange={e => setMonth(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-green-50 px-3 py-2 text-sm text-green-800 flex justify-between">
                <span><b>{month || '월 선택 필요'}</b> · {data.rows.length}명</span>
                <span className="font-semibold">합계 {total.toLocaleString()}원</span>
              </div>
              <div className="max-h-56 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0"><tr>
                    <th className="text-left text-xs font-semibold text-gray-400 px-3 py-2">성명</th>
                    <th className="text-right text-xs font-semibold text-gray-400 px-3 py-2">급여합계</th>
                    <th className="text-right text-xs font-semibold text-gray-400 px-3 py-2">실지급</th>
                  </tr></thead>
                  <tbody>
                    {data.rows.map((r, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="px-3 py-1.5">{r.name}</td>
                        <td className="px-3 py-1.5 text-right">{r.gross.toLocaleString()}</td>
                        <td className="px-3 py-1.5 text-right text-gray-500">{r.net.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            {full && (
              <p className="text-xs text-green-700 bg-green-50 px-3 py-2 rounded-lg">
                ✓ 전체 시트 {full.headers.length}개 항목(수당·공제 포함)도 함께 저장돼요 — 급여내역의 <b>급여대장</b> 보기에서 확인
              </p>
            )}
            </>
          )}
          {bonus && (
            <>
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg">
                🎁 <b>상여금 대장</b>으로 인식했어요{bonus.title ? ` · ${bonus.title}` : ''} — 월 급여와 별도로 보관돼요.
              </p>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">상여금 월 * <span className="text-amber-600 font-normal">— 어느 달 상여금인지 확인하세요</span></label>
                <input type="month" value={month} onChange={e => setMonth(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-amber-50 px-3 py-2 text-sm text-amber-800 flex justify-between">
                  <span><b>{month || '월 선택 필요'}</b> · {bonus.rows.length}명</span>
                  <span className="font-semibold">합계 {bonus.total ? bonus.total[bonus.total.length - 1] : '-'}원</span>
                </div>
                <div className="max-h-56 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0"><tr>
                      {bonus.headers.map((h, i) => (
                        <th key={i} className={`text-xs font-semibold text-gray-400 px-3 py-2 ${i === bonus.headers.length - 1 ? 'text-right' : 'text-left'}`}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {bonus.rows.map((r, i) => (
                        <tr key={i} className="border-t border-gray-100">
                          {r.map((v, c) => (
                            <td key={c} className={`px-3 py-1.5 ${c === r.length - 1 ? 'text-right' : ''}`}>{v || '-'}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
          <div className="flex gap-3 mt-1">
            <button onClick={onClose} className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm font-medium">취소</button>
            <button onClick={handleSave} disabled={saving || (!data && !bonus) || !month}
              className="flex-1 bg-green-600 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
              {saving ? '저장 중...' : !month ? '월 선택 필요' : bonus ? `${month} 상여금 저장` : `${month} 급여 저장`}
            </button>
          </div>
          {data && month && <p className="text-xs text-gray-400 -mt-2">※ 같은 달을 다시 올리면 그 달 급여가 새 내용으로 교체됩니다.</p>}
        </div>
      </div>
    </div>
  )
}

// ───────────── 현장별 이익 ─────────────
function ProfitTab({ list, projects, onRefresh }: { list: ProjectProfit[]; projects: Project[]; onRefresh: () => void }) {
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<ProjectProfit | null>(null)
  const [form, setForm] = useState({ project_id: '', month: '', revenue: '', cost: '', memo: '' })
  const [profitFile, setProfitFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [filterProject, setFilterProject] = useState('전체')

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!form.project_id || !form.month) return
    setSaving(true)
    const sb = createClient()
    // 손익표 파일(엑셀/PDF) 첨부
    let file_url = editing?.file_url || '', file_name = editing?.file_name || ''
    if (profitFile) {
      const ext = profitFile.name.split('.').pop() || 'bin'
      const path = `finance/profit/${Date.now()}.${ext}`
      // 민감 파일은 잠금 보관함(secure)에 — 열 때마다 1시간 서명 주소 발급
      const { error: upErr } = await sb.storage.from('secure').upload(path, profitFile, { contentType: profitFile.type || 'application/octet-stream', upsert: true })
      if (upErr) { toast('파일 업로드 실패: ' + upErr.message + (/bucket/i.test(upErr.message) ? ' (관리자에게: db/secure_bucket.sql 실행 필요)' : '')); setSaving(false); return }
      file_url = SECURE_PREFIX + path
      file_name = profitFile.name
    }
    const payload = { project_id: form.project_id, month: form.month + '-01', revenue: Number(form.revenue) || 0, cost: Number(form.cost) || 0, memo: form.memo, file_url, file_name }
    const { error } = editing
      ? await sb.from('finance_project_profit').update(payload).eq('id', editing.id)
      : await sb.from('finance_project_profit').insert([payload])
    if (error) { toast('저장 실패: ' + error.message); setSaving(false); return }
    setForm({ project_id: '', month: '', revenue: '', cost: '', memo: '' })
    setProfitFile(null)
    setEditing(null); setShowForm(false); setSaving(false)
    onRefresh()
  }

  async function openFile(p: ProjectProfit) {
    if (!p.file_url) return
    // 잠금 보관함 파일이면 1시간짜리 서명 주소로 바꿔서 연다
    let url: string
    try { url = await resolveFileUrl(p.file_url) } catch (e) { toast((e as Error).message, 'error'); return }
    const name = (p.file_name || p.file_url).toLowerCase()
    if (/\.(xlsx|xls|xlsb|xlsm|doc|docx|ppt|pptx)$/.test(name)) window.open(`https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(url)}`, '_blank')
    else if (name.endsWith('.pdf')) openPdfTitled(url, p.file_name || '')
    else downloadUrl(url, p.file_name || '') // 표시 불가 형식은 제 이름으로 다운로드
  }

  async function del(p: ProjectProfit) {
    if (!confirm('이 항목을 삭제할까요?')) return
    const sb = createClient()
    if (p.file_url) await removeStoredFile(p.file_url) // 첨부 파일도 함께 정리
    await sb.from('finance_project_profit').delete().eq('id', p.id)
    onRefresh()
  }

  const projectName = (id: string) => projects.find(p => p.id === id)?.name || '(삭제된 현장)'
  const filtered = filterProject === '전체' ? list : list.filter(p => p.project_id === filterProject)

  const byMonth = Object.values(filtered.reduce((acc, c) => {
    const k = c.month?.slice(0, 7) || ''
    acc[k] = acc[k] || { label: k.slice(2).replace('-', '.'), value: 0, key: k }
    acc[k].value += (c.revenue - c.cost)
    return acc
  }, {} as Record<string, { label: string; value: number; key: string }>)).sort((a, b) => a.key.localeCompare(b.key))

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-2">
        <select value={filterProject} onChange={e => setFilterProject(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
          <option value="전체">전체 현장</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button onClick={() => { setEditing(null); setForm({ project_id: '', month: '', revenue: '', cost: '', memo: '' }); setShowForm(true) }}
          className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700">+ 이익 자료 추가</button>
      </div>
      {filtered.length === 0 ? (
        <EmptyState icon="📈" text="등록된 이익 자료가 없어요" />
      ) : (
        <>
          <ChartCard title="월별 이익(매출-비용) 추이" data={byMonth} />
          <SimpleTable
            cols={['현장', '월', '매출', '비용', '이익', '첨부', '메모']}
            rows={filtered.map(c => [
              projectName(c.project_id), c.month?.slice(0,7),
              c.revenue.toLocaleString() + '원', c.cost.toLocaleString() + '원',
              (c.revenue - c.cost).toLocaleString() + '원',
              c.file_url
                ? <button key="f" onClick={() => openFile(c)} className="text-xs text-blue-500 hover:text-blue-700 underline max-w-[160px] truncate inline-block align-middle" title={c.file_name || ''}>📎 {c.file_name || '열기'}</button>
                : '-',
              c.memo || '-'
            ])}
            onEdit={i => { const c = filtered[i]; setEditing(c); setProfitFile(null); setForm({ project_id: c.project_id, month: c.month?.slice(0,7) || '', revenue: String(c.revenue), cost: String(c.cost), memo: c.memo || '' }); setShowForm(true) }}
            onDelete={i => del(filtered[i])}
          />
        </>
      )}
      {showForm && (
        <FormModal title={editing ? '이익 자료 수정' : '이익 자료 추가'} onClose={() => setShowForm(false)} onSubmit={save} saving={saving}>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1.5">현장 *</label>
            <select required value={form.project_id} onChange={e => setForm({ ...form, project_id: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
              <option value="">선택하세요</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <MonthInput value={form.month} onChange={v => setForm({ ...form, month: v })} />
          <div className="grid grid-cols-2 gap-3">
            <NumberInput label="매출 *" required value={form.revenue} onChange={v => setForm({ ...form, revenue: v })} />
            <NumberInput label="비용 *" required value={form.cost} onChange={v => setForm({ ...form, cost: v })} />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1.5">손익표 첨부 <span className="text-gray-400 font-normal">(엑셀·PDF — 열기는 표에서 📎 클릭)</span></label>
            <FileDropInput onFile={f => setProfitFile(f)} currentName={profitFile?.name || (editing?.file_name || undefined)} hint="엑셀(xlsb 포함)·PDF" />
          </div>
          <TextInput label="메모" value={form.memo} onChange={v => setForm({ ...form, memo: v })} />
        </FormModal>
      )}
    </div>
  )
}

// ───────────── 견적서 ─────────────
// 연도 기준 — 견적일 → 현장명 앞 날짜(260824_) → 등록일 순
function quoteYear(q: Quote): number {
  if (q.quote_date) return Number(q.quote_date.slice(0, 4))
  const m = q.title.match(/^(\d{2})(\d{2})(\d{2})(?!\d)/)
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) return 2000 + Number(m[1])
  return Number((q.created_at || '').slice(0, 4)) || new Date().getFullYear()
}
const won = (n: number) => n.toLocaleString() + '원'
const pct = (a: number, b: number) => b > 0 ? Math.round(a / b * 100) + '%' : '-'
// 현장별 % = 순이익 ÷ 공급가(공사+추가 − 부가세, 부가세 미입력이면 ÷1.1) — 기존 공사경력 엑셀과 같은 기준
const supplyOf = (q: Quote) => { const total = (q.amount || 0) + (q.extra_amount || 0); return q.vat ? total - q.vat : Math.round(total / 1.1) }

function QuoteTab({ list, hqExpenses, fixedCosts, onRefresh }: { list: Quote[]; hqExpenses: HqExpense[]; fixedCosts: FixedCost[]; onRefresh: () => void }) {
  const [sort, setSort] = useState('date_asc') // 기본: 날짜 순서대로(공사경력 엑셀과 같게)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Quote | null>(null)
  const emptyForm = { title: '', quote_date: '', amount: '', extra_amount: '', vat: '', insurance: '', net_profit: '', merged_into: '', confirmed: false }
  const [form, setForm] = useState(emptyForm)
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const years = Array.from(new Set([new Date().getFullYear(), ...list.map(quoteYear), ...hqExpenses.map(h => h.year)])).sort((a, b) => b - a)
  const [year, setYear] = useState(new Date().getFullYear())
  const [showHq, setShowHq] = useState(false)
  const [hqForm, setHqForm] = useState({ amount: '', memo: '' })
  const [readNote, setReadNote] = useState<{ text: string; ok: boolean } | null>(null)
  const [showBulkRead, setShowBulkRead] = useState(false)

  // 견적서·계약서를 고르면 공사금액·부가세·고용산재를 읽어 칸에 채움(저장 전 확인·수정 가능)
  async function pickFile(f: File | null) {
    setFile(f); setReadNote(null)
    if (!f) return
    if (!form.title.trim()) setForm(prev => ({ ...prev, title: f.name.replace(/\.[^.]+$/, '') }))
    setReadNote({ text: '파일에서 금액을 읽는 중…', ok: true })
    const r = await readQuoteAmounts(f)
    if (!r) { setReadNote({ text: '이 파일에서는 금액을 읽지 못했어요(스캔·사진·한글 파일 등). 직접 입력해 주세요.', ok: false }); return }
    setForm(prev => ({
      ...prev,
      amount: r.amount != null ? String(r.amount) : prev.amount,
      vat: r.vat != null ? String(r.vat) : prev.vat,
      insurance: r.insurance != null ? String(r.insurance) : prev.insurance,
    }))
    const parts = [`공사금액 ${won(r.amount || 0)}`, r.vat != null && `부가세 ${won(r.vat)}${r.vatEstimated ? '(금액÷11로 계산)' : ''}`, r.insurance != null && `고용산재 ${won(r.insurance)}`].filter(Boolean)
    setReadNote({ text: `${r.source}에서 읽었어요 — ${parts.join(' · ')}${r.nego ? ' (특기사항의 네고 금액)' : ''}${r.source === '계약서' ? ' · 고용산재는 계약서에 없어 직접 입력' : ''}. 맞는지 확인 후 저장하세요.`, ok: true })
  }

  const dbHint = (msg: string) => /confirmed/i.test(msg) ? ' (관리자에게: db/quote_confirm.sql 실행 필요)' : /column|schema cache|finance_hq_expense/i.test(msg) ? ' (관리자에게: db/quote_profit.sql 다시 실행 필요)' : ''

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) return
    setSaving(true)
    const sb = createClient()
    let file_url = editing?.file_url || '', file_name = editing?.file_name || ''
    if (file) {
      const upFile = /\.pdf$/i.test(file.name) ? await normalizePdfTitle(file, form.title.trim() || file.name) : file // PDF 속성 제목 교정
      const ext = file.name.split('.').pop() || 'bin'
      const path = `finance/quotes/${Date.now()}.${ext}`
      const { error: upErr } = await sb.storage.from('secure').upload(path, upFile, { contentType: upFile.type || 'application/octet-stream', upsert: true })
      if (upErr) { toast('파일 업로드 실패: ' + upErr.message + (/bucket/i.test(upErr.message) ? ' (관리자에게: db/secure_bucket.sql 실행 필요)' : '')); setSaving(false); return }
      file_url = SECURE_PREFIX + path
      file_name = file.name
    }
    const payload = {
      title: form.title.trim(), quote_date: form.quote_date || null,
      amount: Number(form.amount) || 0, extra_amount: Number(form.extra_amount) || 0,
      vat: Number(form.vat) || 0, insurance: Number(form.insurance) || 0,
      // 합산된 견적서는 순이익을 비움(A 쪽에만 A+B 순이익) · 그 외엔 비우면 미입력(합계에서 제외)
      net_profit: form.merged_into || form.net_profit === '' ? null : Number(form.net_profit) || 0,
      merged_into: form.merged_into || null,
      // 2단계 확인 — 켤 때 시각 기록, 이미 확인된 건 시각 유지
      confirmed: form.confirmed,
      confirmed_at: form.confirmed ? (editing?.confirmed ? editing.confirmed_at : new Date().toISOString()) : null,
      file_url, file_name,
    }
    const { error } = editing
      ? await sb.from('finance_quotes').update(payload).eq('id', editing.id)
      : await sb.from('finance_quotes').insert([payload])
    if (error) { toast('저장 실패: ' + error.message + dbHint(error.message)); setSaving(false); return }
    setForm(emptyForm); setFile(null)
    setEditing(null); setShowForm(false); setSaving(false)
    onRefresh()
  }

  // 2단계 확인 — 계약서와 금액을 맞춰 본 견적서에 표시(다시 누르면 확인 취소)
  async function toggleConfirm(q: Quote) {
    if (q.confirmed && !confirm(`"${q.title}" 확인 표시를 취소할까요?`)) return
    const on = !q.confirmed
    const { error } = await createClient().from('finance_quotes')
      .update({ confirmed: on, confirmed_at: on ? new Date().toISOString() : null }).eq('id', q.id)
    if (error) { toast('저장 실패: ' + error.message + dbHint(error.message), 'error'); return }
    onRefresh()
  }

  async function saveHq(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const { error } = await createClient().from('finance_hq_expense')
      .upsert({ year, amount: Number(hqForm.amount) || 0, memo: hqForm.memo, updated_at: new Date().toISOString() })
    setSaving(false)
    if (error) { toast('저장 실패: ' + error.message + dbHint(error.message)); return }
    setShowHq(false)
    onRefresh()
  }

  async function del(q: Quote) {
    if (!confirm(`"${q.title}" 견적서를 삭제할까요?`)) return
    const sb = createClient()
    if (q.file_url) await removeStoredFile(q.file_url)
    await sb.from('finance_quotes').delete().eq('id', q.id)
    onRefresh()
  }

  async function openFile(q: Quote) {
    if (!q.file_url) return
    // 잠금 보관함 파일이면 1시간짜리 서명 주소로 바꿔서 연다
    let url: string
    try { url = await resolveFileUrl(q.file_url) } catch (e) { toast((e as Error).message, 'error'); return }
    const name = q.file_name?.toLowerCase() || ''
    if (/\.(xlsx|xls|doc|docx|ppt|pptx)$/.test(name)) {
      // 엑셀·워드·PPT → 마이크로소프트 오피스 온라인 뷰어(다운로드 없이 미리보기)
      window.open(`https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(url)}`, '_blank')
    } else if (name.endsWith('.pdf')) {
      openPdfTitled(url, q.file_name || '')
    } else {
      window.open(url, '_blank')
    }
  }

  // 선택한 연도 견적서만
  const yearList = list.filter(q => quoteYear(q) === year)
  const sum = (f: (q: Quote) => number) => yearList.reduce((s, q) => s + f(q), 0)
  const baseSum = sum(q => q.amount || 0)
  const extraSum = sum(q => q.extra_amount || 0)
  const totalSum = baseSum + extraSum
  const profitSum = sum(q => q.net_profit || 0)
  const noProfit = yearList.filter(q => q.net_profit == null && !q.merged_into).length
  // 합산 묶음 — A에 합쳐진 B들. A의 %는 A+B 공급가 기준(손익표를 A+B 하나로 만든 경우)
  const mergedOf = (id: string) => list.filter(x => x.merged_into === id)
  const titleOf = (id: string) => list.find(x => x.id === id)?.title || '(삭제된 견적서)'
  const groupSupply = (q: Quote) => supplyOf(q) + mergedOf(q.id).reduce((t, x) => t + supplyOf(x), 0)
  // 합산 대상 후보 — 자기 자신·이미 다른 곳에 합쳐진 견적서 제외(한 단계만)
  const mergeTargets = list.filter(x => x.id !== editing?.id && !x.merged_into)
  const editingHasMerged = !!editing && mergedOf(editing.id).length > 0
  // 본사 총지출 — 고정지출 탭에 올린 그 해 월 지출 합(있으면 자동), 없으면 직접 입력한 금액
  const hq = hqExpenses.find(h => h.year === year)
  const fcYear = fixedCosts.filter(c => c.month?.startsWith(String(year)))
  const fcMonths = Array.from(new Set(fcYear.map(c => Number(c.month.slice(5, 7))))).sort((a, b) => a - b)
  const fcMissing = fcMonths.length ? Array.from({ length: fcMonths[fcMonths.length - 1] }, (_, i) => i + 1).filter(m => !fcMonths.includes(m)) : []
  const hqAuto = fcYear.length > 0
  const hqAmount = hqAuto ? fcYear.reduce((t, c) => t + (c.amount || 0), 0) : hq ? hq.amount : null
  const realProfit = profitSum - (hqAmount || 0)

  // 정렬 — 날짜(견적일 → 현장명 앞 날짜 260824_ → 등록일)/현장명/금액. 같은 날짜는 현장명순
  const dateOf = (q: Quote) => {
    if (q.quote_date) return q.quote_date
    const m = q.title.match(/^(\d{2})(\d{2})(\d{2})(?!\d)/)
    if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) return `20${m[1]}-${m[2]}-${m[3]}`
    return (q.created_at || '').slice(0, 10)
  }
  const byName = (a: Quote, b: Quote) => (a.title || '').localeCompare(b.title || '', 'ko', { numeric: true })
  const plain = [...yearList].sort((a, b) => {
    if (sort === 'date_asc') return dateOf(a).localeCompare(dateOf(b)) || byName(a, b)
    if (sort === 'name') return byName(a, b)
    if (sort === 'amount_desc') return (b.amount || 0) - (a.amount || 0)
    if (sort === 'amount_asc') return (a.amount || 0) - (b.amount || 0)
    return dateOf(b).localeCompare(dateOf(a)) || byName(a, b)
  })

  // 날짜순일 때 추가 견적은 본 견적 바로 아래 — 현장명(또는 파일명)에 '추가'가 있으면 이름이 가장 닮은 앞선 본 견적에 붙인다
  const isExtra = (q: Quote) => /추가/.test(q.title) || /추가/.test(q.file_name || '')
  const core = (s: string) => s.replace(/^\d{6}_?/, '').replace(/\s/g, '').replace(/\(?추가\)?.*$/, '')
  const parentOf = new Map<string, string>()
  for (const x of yearList.filter(isExtra)) {
    const c = core(x.title)
    let best: Quote | null = null, bestScore = 2 // 3글자 이상 겹쳐야
    for (const p of yearList) {
      if (p.id === x.id || isExtra(p) || dateOf(p) > dateOf(x)) continue
      const pc = core(p.title)
      let n = 0; while (n < c.length && c[n] === pc[n]) n++
      const score = Math.max(n, c && pc.includes(c) ? c.length : 0)
      if (score > bestScore || (score === bestScore && best && dateOf(p) > dateOf(best))) { best = p; bestScore = score }
    }
    if (best) parentOf.set(x.id, best.id)
  }
  const sorted = !sort.startsWith('date') ? plain : plain.filter(q => !parentOf.has(q.id)).flatMap(p => [p,
    ...yearList.filter(x => parentOf.get(x.id) === p.id).sort((a, b) => dateOf(a).localeCompare(dateOf(b)) || byName(a, b))])

  const numCell = (n: number | null | undefined) => n ? won(n) : <span className="text-gray-300">-</span>

  return (
    <div>
      <div className="flex justify-between items-center mb-4 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
            {years.map(y => <option key={y} value={y}>{y}년</option>)}
          </select>
          <SortSelect value={sort} onChange={setSort} options={[
            { value: 'date_desc', label: '최신순' },
            { value: 'date_asc', label: '오래된순' },
            { value: 'name', label: '현장명순' },
            { value: 'amount_desc', label: '금액 높은순' },
            { value: 'amount_asc', label: '금액 낮은순' },
          ]} />
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowBulkRead(true)}
            className="border border-green-600 text-green-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-50">📄 올려 둔 파일에서 한 번에 읽기</button>
          <button onClick={() => { setEditing(null); setForm(emptyForm); setFile(null); setReadNote(null); setShowForm(true) }}
            className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700">+ 추가</button>
        </div>
      </div>

      {/* 연간 합계 — 공사경력 엑셀 상단 요약과 같은 순서 */}
      <div className="bg-white rounded-xl border border-gray-200 px-4 md:px-6 py-5 mb-4">
        <p className="text-sm font-semibold text-gray-700 mb-3">{year}년 합계 <span className="text-xs font-normal text-gray-400">· 견적서 {yearList.length}건</span></p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3 text-sm">
          <SumItem label="본 공사 금액" value={won(baseSum)} />
          <SumItem label="추가 공사 금액" value={won(extraSum)} />
          <SumItem label="합계" value={won(totalSum)} strong sub={`계약 확인 ${yearList.filter(q => q.confirmed).length}/${yearList.length}건`} />
          <SumItem label="공사 순이익" value={won(profitSum)} sub={pct(profitSum, totalSum) + (noProfit ? ` · 미입력 ${noProfit}건` : '')} />
          <div>
            <p className="text-xs text-gray-400">본사 총지출</p>
            {hqAuto ? <>
              <p className="font-semibold text-gray-800">{won(hqAmount || 0)}</p>
              <p className="text-[11px] text-gray-400">고정지출 {fcMonths.length === fcMonths[fcMonths.length - 1] ? `1~${fcMonths[fcMonths.length - 1]}월` : fcMonths.join('·') + '월'} 합 (자동)</p>
              {fcMissing.length > 0 && <p className="text-[11px] text-orange-500">빠진 달: {fcMissing.join('·')}월</p>}
            </> : <>
              <button onClick={() => { setHqForm({ amount: hq ? String(hq.amount) : '', memo: hq?.memo || '' }); setShowHq(true) }}
                className="font-semibold text-gray-800 hover:text-green-700 text-left">
                {hq ? won(hq.amount) : <span className="text-green-600 text-xs font-medium">+ 입력하기</span>}
                {hq && <span className="text-xs text-green-500 ml-1.5 font-normal">수정</span>}
              </button>
              <p className="text-[11px] text-gray-400 truncate">{hq?.memo || '고정지출 탭에 월 지출 엑셀을 올리면 자동으로 채워져요'}</p>
            </>}
          </div>
          <div className="bg-green-50 rounded-lg px-3 py-2 -mx-1">
            <p className="text-xs text-green-700 font-medium">실제 순이익</p>
            <p className={`font-bold ${realProfit < 0 ? 'text-red-500' : 'text-green-800'}`}>{won(realProfit)}</p>
            <p className="text-[11px] text-green-700">{pct(realProfit, totalSum)}{hqAmount == null && ' · 본사 총지출 미입력'}</p>
          </div>
          <SumItem label="부가세 합" value={won(sum(q => q.vat || 0))} />
          <SumItem label="고용산재 합" value={won(sum(q => q.insurance || 0))} />
        </div>
        <p className="text-[11px] text-gray-400 mt-3">실제 순이익 = 공사 순이익 합 − 본사 총지출 · %는 합계(본+추가) 대비</p>
      </div>

      <p className="text-xs text-gray-400 mb-3">1단계: 견적서를 올리면 금액이 자동으로 들어가요(네고 금액 포함). 2단계: 계약서와 맞춰 보고 [확인하기] — 계약서로 금액을 고쳤으면 수정에서 고친 뒤 확인. 현장별 %는 공급가(부가세 제외) 대비예요.</p>
      {yearList.length === 0 ? (
        <EmptyState icon="📄" text={`${year}년 견적서가 없어요`} />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden overflow-x-auto">
          <table className="w-full whitespace-nowrap">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left text-xs font-semibold text-gray-400 px-6 py-3">현장명</th>
                <th className="text-center text-xs font-semibold text-gray-400 px-3 py-3">계약 확인</th>
                <th className="text-right text-xs font-semibold text-gray-400 px-4 py-3">공사 금액</th>
                <th className="text-right text-xs font-semibold text-gray-400 px-4 py-3">추가 공사</th>
                <th className="text-right text-xs font-semibold text-gray-400 px-4 py-3">부가세</th>
                <th className="text-right text-xs font-semibold text-gray-400 px-4 py-3">고용산재</th>
                <th className="text-right text-xs font-semibold text-gray-400 px-4 py-3">순이익</th>
                <th className="text-right text-xs font-semibold text-gray-400 px-4 py-3">%</th>
                <th className="text-left text-xs font-semibold text-gray-400 px-4 py-3">첨부파일</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(q => (
                <tr key={q.id} className="border-b border-gray-50 hover:bg-gray-50 align-top">
                  <td className="px-6 py-3 text-sm font-medium text-gray-800">
                    {sort.startsWith('date') && parentOf.has(q.id) && <span className="text-gray-400 mr-1">└</span>}{q.title}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {q.confirmed
                      ? <button onClick={() => toggleConfirm(q)} title={q.confirmed_at ? `확인 ${new Date(q.confirmed_at).toLocaleDateString('ko-KR')} · 누르면 취소` : '누르면 취소'}
                          className="text-xs text-gray-400 hover:text-gray-600">✓ 확인됨</button>
                      : <button onClick={() => toggleConfirm(q)} title="계약서와 금액을 맞춰 봤으면 누르세요"
                          className="text-xs px-2.5 py-1 rounded-full border border-orange-300 text-orange-600 bg-orange-50 hover:bg-orange-100">확인하기</button>}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-semibold text-gray-800">{numCell(q.amount)}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-700">{numCell(q.extra_amount)}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-700">{numCell(q.vat)}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-700">{numCell(q.insurance)}</td>
                  <td className="px-4 py-3 text-sm text-right font-semibold text-gray-800">
                    {q.merged_into
                      ? <span className="text-xs font-normal text-gray-500 max-w-[200px] truncate inline-block align-middle" title={titleOf(q.merged_into)}>→ {titleOf(q.merged_into)}에 합산</span>
                      : q.net_profit == null ? <span className="text-gray-300">-</span> : won(q.net_profit)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-gray-500">
                    {q.net_profit != null && !q.merged_into && <>
                      {pct(q.net_profit, groupSupply(q))}
                      {mergedOf(q.id).length > 0 && <span className="block text-[10px] text-gray-400">합산 {mergedOf(q.id).length + 1}건 기준</span>}
                    </>}
                  </td>
                  <td className="px-4 py-3">
                    {q.file_url ? (
                      <button onClick={() => openFile(q)} className="text-sm text-green-600 hover:underline text-left max-w-[260px] truncate inline-block align-middle" title={q.file_name || ''}>📎 {q.file_name}</button>
                    ) : <span className="text-xs text-gray-300">-</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => {
                        setEditing(q)
                        const s = (n: number | null) => n ? String(n) : ''
                        setForm({ title: q.title, quote_date: q.quote_date || '', amount: s(q.amount), extra_amount: s(q.extra_amount), vat: s(q.vat), insurance: s(q.insurance), net_profit: q.net_profit == null ? '' : String(q.net_profit), merged_into: q.merged_into || '', confirmed: !!q.confirmed })
                        setFile(null); setReadNote(null); setShowForm(true)
                      }} className="text-xs text-green-500 hover:text-green-700">수정</button>
                      <button onClick={() => del(q)} className="text-xs text-red-400 hover:text-red-600">삭제</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {showForm && (
        <FormModal title={editing ? '견적서 수정' : '견적서·계약 추가'} onClose={() => setShowForm(false)} onSubmit={save} saving={saving}>
          <TextInput label="현장명 *" required value={form.title} onChange={v => setForm({ ...form, title: v })} placeholder="예) 260824_롯데캐슬 미용실" />
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1.5">
              견적서 또는 계약서 {editing?.file_name ? <span className="text-gray-400 font-normal">(변경 시에만 · 현재: {editing.file_name})</span> : <span className="text-gray-400 font-normal">(없으면 비워두고 금액만 입력)</span>}
            </label>
            <FileDropInput onFile={pickFile} currentName={file?.name} hint="PDF·엑셀 — 공사금액·부가세·고용산재 자동 입력" />
            {readNote && <p className={`text-[11px] mt-1.5 ${readNote.ok ? 'text-green-700' : 'text-orange-600'}`}>{readNote.text}</p>}
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1.5">견적일 <span className="text-gray-400 font-normal">(연도 합계 기준 · 비우면 현장명 앞 날짜)</span></label>
            <input type="date" value={form.quote_date} onChange={e => setForm({ ...form, quote_date: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <NumberInput label="공사 금액" value={form.amount} onChange={v => setForm({ ...form, amount: v })} />
            <NumberInput label="추가 공사 금액" value={form.extra_amount} onChange={v => setForm({ ...form, extra_amount: v })} />
            <NumberInput label="부가세" value={form.vat} onChange={v => setForm({ ...form, vat: v })} />
            <NumberInput label="고용산재 금액" value={form.insurance} onChange={v => setForm({ ...form, insurance: v })} />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 -mt-1">
            <input type="checkbox" checked={form.confirmed} onChange={e => setForm({ ...form, confirmed: e.target.checked })} />
            계약서와 금액 확인함 <span className="text-[11px] text-gray-400">(2단계 — 견적서 자동 반영 뒤 계약서와 맞춰 봤으면 체크)</span>
          </label>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1.5">손익 계산</label>
            <select value={form.merged_into} disabled={editingHasMerged} onChange={e => setForm({ ...form, merged_into: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-50">
              <option value="">이 견적서 따로 계산</option>
              {mergeTargets.map(x => <option key={x.id} value={x.id}>{x.title}에 합산</option>)}
            </select>
            <p className="text-[11px] text-gray-400 mt-1">
              {editingHasMerged
                ? `다른 견적서 ${mergedOf(editing!.id).length}건이 이 견적서에 합산돼 있어요 — 순이익은 합친 금액으로 적어요.`
                : '손익표를 다른 견적서와 하나로 만들었으면 그 견적서를 고르세요. 순이익·%는 그쪽에 합쳐서 보여요.'}
            </p>
          </div>
          {!form.merged_into && (
            <div>
              <NumberInput label={editingHasMerged ? '순이익 금액 (합산)' : '순이익 금액'} value={form.net_profit} onChange={v => setForm({ ...form, net_profit: v })} />
              <p className="text-[11px] text-gray-400 mt-1">손익 엑셀의 순이익을 옮겨 적어요. 아직 모르면 비워두세요(합계에서 빠짐).</p>
            </div>
          )}
        </FormModal>
      )}
      {showBulkRead && <BulkReadModal quotes={yearList} year={year} onClose={() => setShowBulkRead(false)} onDone={() => { setShowBulkRead(false); onRefresh() }} />}
      {showHq && (
        <FormModal title={`${year}년 본사 총지출`} onClose={() => setShowHq(false)} onSubmit={saveHq} saving={saving}>
          <NumberInput label="본사 총지출 금액 *" required value={hqForm.amount} onChange={v => setHqForm({ ...hqForm, amount: v })} />
          <TextInput label="메모" value={hqForm.memo} onChange={v => setHqForm({ ...hqForm, memo: v })} placeholder="예) 경리나라 본사 손익 1~9월 기준" />
          <p className="text-[11px] text-gray-400 -mt-2">새로 정리할 때마다 이 금액을 고쳐 쓰면 실제 순이익이 바로 다시 계산돼요.</p>
        </FormModal>
      )}
    </div>
  )
}

// 올려 둔 견적서·계약서 파일을 한꺼번에 다시 읽어 빈 칸(공사금액·부가세·고용산재)을 채운다.
// 이미 적어 둔 공사금액과 다르게 읽히면(네고로 고친 금액 등) 표시만 하고, 체크했을 때만 바꾼다.
type BulkRow = {
  q: Quote
  status: 'wait' | 'ok' | 'fail' | 'nofile'
  r?: QuoteAmounts
  fill: { amount?: number; vat?: number; insurance?: number } // 비어 있어 채울 값
  diffAmount?: number                                          // 기존 공사금액과 다르게 읽힌 금액
  apply: boolean
  replaceAmount: boolean
}

function BulkReadModal({ quotes, year, onClose, onDone }: { quotes: Quote[]; year: number; onClose: () => void; onDone: () => void }) {
  const [rows, setRows] = useState<BulkRow[]>(() => quotes.map(q => ({ q, status: q.file_url ? 'wait' : 'nofile', fill: {}, apply: false, replaceAmount: false })))
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(0)
  const [saving, setSaving] = useState(false)
  const targets = rows.filter(x => x.q.file_url).length

  async function readAll() {
    setRunning(true); setDone(0)
    for (let i = 0; i < rows.length; i++) {
      const q = rows[i].q
      if (!q.file_url) continue
      let r: QuoteAmounts | null = null
      try {
        const url = await resolveFileUrl(q.file_url)
        const blob = await (await fetch(url)).blob()
        r = await readQuoteAmounts(new File([blob], q.file_name || 'file'))
      } catch { r = null }
      const fill: BulkRow['fill'] = {}
      let diffAmount: number | undefined
      if (r) {
        // 계약서와 확인한 견적서(2단계)는 공사금액을 다시 바꾸자고 하지 않음
        if (r.amount != null) { if (!q.amount) fill.amount = r.amount; else if (q.amount !== r.amount && !q.confirmed) diffAmount = r.amount }
        if (r.vat != null && !q.vat) fill.vat = r.vat
        if (r.insurance != null && !q.insurance) fill.insurance = r.insurance
      }
      const row: BulkRow = { q, status: r ? 'ok' : 'fail', r: r || undefined, fill, diffAmount, apply: Object.keys(fill).length > 0, replaceAmount: false }
      setRows(prev => prev.map((x, j) => j === i ? row : x))
      setDone(d => d + 1)
    }
    setRunning(false)
  }

  const toSave = rows.filter(x => (x.apply && Object.keys(x.fill).length > 0) || (x.replaceAmount && x.diffAmount != null))

  async function apply() {
    setSaving(true)
    const sb = createClient()
    let fail = 0, firstError = ''
    for (const x of toSave) {
      const payload: Record<string, number> = x.apply ? { ...x.fill } : {}
      // 공사금액을 바꾸면 부가세도 그 금액 기준으로
      if (x.replaceAmount && x.diffAmount != null) { payload.amount = x.diffAmount; if (x.r?.vat != null) payload.vat = x.r.vat }
      const { error } = await sb.from('finance_quotes').update(payload).eq('id', x.q.id)
      if (error) { fail++; firstError = firstError || error.message }
    }
    setSaving(false)
    if (fail) {
      // 실패 이유를 그대로 보여 줌 — 새 칸이 없으면(SQL 미적용·스키마 캐시) 안내 붙임
      const hint = /column|schema cache/i.test(firstError) ? ' → Supabase SQL Editor에서 db/quote_profit.sql을 다시 실행해 주세요' : ''
      toast(`${toSave.length - fail}건 저장, ${fail}건 실패: ${firstError}${hint}`, 'error')
      if (fail === toSave.length) return // 전부 실패면 창을 닫지 않음
    } else toast(`${toSave.length}건을 채웠어요`, 'ok')
    onDone()
  }

  const set = (id: string, patch: Partial<BulkRow>) => setRows(prev => prev.map(x => x.q.id === id ? { ...x, ...patch } : x))
  const cellNew = (cur: number | null, v?: number) => v != null
    ? <span className="text-green-700 font-medium">{v.toLocaleString()}</span>
    : cur ? <span className="text-gray-400">{cur.toLocaleString()}</span> : <span className="text-gray-300">-</span>
  const failed = rows.filter(x => x.status === 'fail')
  const noFile = rows.filter(x => x.status === 'nofile')

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-4xl shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <h2 className="text-lg font-bold">{year}년 견적서 한 번에 읽기</h2>
          <button onClick={onClose} className="text-gray-400 text-2xl">&times;</button>
        </div>
        <div className="px-6 py-4 flex flex-col gap-3 overflow-y-auto">
          <p className="text-xs text-gray-500">첨부 파일이 있는 {targets}건을 읽어 <b>비어 있는 칸만</b> 채워요(초록 글씨). 이미 적어 둔 공사금액과 다르게 읽힌 줄은 주황색 — 체크해야만 바뀌어요. [적용]을 눌러야 저장돼요.</p>
          {!running && done === 0 && (
            <button onClick={readAll} disabled={targets === 0} className="self-start bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">파일 {targets}건 읽기 시작</button>
          )}
          {(running || done > 0) && <p className="text-sm text-gray-700">{running ? `읽는 중… ${done}/${targets}` : `다 읽었어요 — ${done}건`}</p>}
          {done > 0 && (
            <div className="border border-gray-200 rounded-lg overflow-x-auto">
              <table className="w-full text-sm whitespace-nowrap">
                <thead>
                  <tr className="bg-gray-50 text-xs text-gray-400">
                    <th className="px-3 py-2 text-left">채우기</th>
                    <th className="px-3 py-2 text-left">현장명</th>
                    <th className="px-3 py-2 text-right">공사 금액</th>
                    <th className="px-3 py-2 text-right">부가세</th>
                    <th className="px-3 py-2 text-right">고용산재</th>
                    <th className="px-3 py-2 text-left">읽은 곳</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.filter(x => x.status === 'ok').map(x => (
                    <tr key={x.q.id} className="border-t border-gray-50 align-top">
                      <td className="px-3 py-2">
                        {Object.keys(x.fill).length > 0
                          ? <input type="checkbox" checked={x.apply} onChange={e => set(x.q.id, { apply: e.target.checked })} />
                          : <span className="text-[11px] text-gray-300">채울 칸 없음</span>}
                      </td>
                      <td className="px-3 py-2 text-gray-800 max-w-[220px] truncate" title={x.q.title}>{x.q.title}</td>
                      <td className="px-3 py-2 text-right">
                        {cellNew(x.q.amount, x.fill.amount)}
                        {x.diffAmount != null && (
                          <label className="block text-[11px] text-orange-600 mt-0.5">
                            <input type="checkbox" className="mr-1 align-middle" checked={x.replaceAmount} onChange={e => set(x.q.id, { replaceAmount: e.target.checked })} />
                            파일은 {x.diffAmount.toLocaleString()}{x.r?.nego ? '(네고)' : ''} — 바꾸기
                          </label>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">{cellNew(x.q.vat, x.fill.vat)}{x.fill.vat != null && x.r?.vatEstimated && <span className="text-[10px] text-gray-400"> (계산)</span>}</td>
                      <td className="px-3 py-2 text-right">{cellNew(x.q.insurance, x.fill.insurance)}</td>
                      <td className="px-3 py-2 text-xs text-gray-500">{x.r?.source}{x.r?.nego ? ' · 네고' : ''}{x.q.confirmed ? ' · ✓ 확인됨' : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!running && done > 0 && (failed.length > 0 || noFile.length > 0) && (
            <div className="text-xs text-orange-600 bg-orange-50 rounded-lg px-3 py-2">
              {failed.length > 0 && <p>못 읽은 파일 {failed.length}건(스캔·사진·다른 양식) — 직접 입력: {failed.map(x => x.q.title).join(', ')}</p>}
              {noFile.length > 0 && <p className="mt-1">첨부 파일 없음 {noFile.length}건: {noFile.map(x => x.q.title).join(', ')}</p>}
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <button onClick={onClose} className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm font-medium">닫기</button>
          <button onClick={apply} disabled={running || saving || toSave.length === 0}
            className="flex-1 bg-green-600 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
            {saving ? '저장 중...' : `적용 (${toSave.length}건)`}
          </button>
        </div>
      </div>
    </div>
  )
}

function SumItem({ label, value, sub, strong }: { label: string; value: string; sub?: string; strong?: boolean }) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className={strong ? 'font-bold text-gray-900' : 'font-semibold text-gray-800'}>{value}</p>
      {sub && <p className="text-[11px] text-gray-400">{sub}</p>}
    </div>
  )
}

// ───────────── 공용 컴포넌트 ─────────────
function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 text-center py-16 text-gray-400">
      <p className="text-3xl mb-2">{icon}</p><p>{text}</p>
    </div>
  )
}

function ChartCard({ title, data }: { title: string; data: { label: string; value: number }[] }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-4 py-5 mb-4">
      <p className="text-sm font-semibold text-gray-700 mb-4">{title}</p>
      <TrendChart data={data} />
    </div>
  )
}

function SimpleTable({ cols, rows, onEdit, onDelete }: { cols: string[]; rows: ReactNode[][]; onEdit: (i: number) => void; onDelete: (i: number) => void }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden overflow-x-auto">
      <table className="w-full whitespace-nowrap">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            {cols.map(c => <th key={c} className="text-left text-xs font-semibold text-gray-400 px-4 py-3">{c}</th>)}
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
              {row.map((cell, j) => <td key={j} className="px-4 py-3 text-sm text-gray-700">{cell}</td>)}
              <td className="px-4 py-3">
                <div className="flex items-center gap-2 justify-end">
                  <button onClick={() => onEdit(i)} className="text-xs text-green-500 hover:text-green-700">수정</button>
                  <button onClick={() => onDelete(i)} className="text-xs text-red-400 hover:text-red-600">삭제</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function FormModal({ title, onClose, onSubmit, saving, children }: { title: string; onClose: () => void; onSubmit: (e: React.FormEvent) => void; saving: boolean; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 sticky top-0 bg-white">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="text-gray-400 text-2xl">&times;</button>
        </div>
        <form onSubmit={onSubmit} className="px-6 py-5 flex flex-col gap-4">
          {children}
          <div className="flex gap-3 mt-2">
            <button type="button" onClick={onClose} className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm font-medium">취소</button>
            <button type="submit" disabled={saving} className="flex-1 bg-green-600 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function BulkImportModal({ title, labelHeader, onClose, onSave }: {
  title: string
  labelHeader: string
  onClose: () => void
  onSave: (month: string, rows: ParsedRow[]) => Promise<void>
}) {
  const [month, setMonth] = useState('')
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [parsing, setParsing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleFile(file: File | null) {
    if (!file) return
    setParsing(true); setError(''); setRows([])
    const parsed = await parseExcelRows(file).catch(() => null)
    setParsing(false)
    if (!parsed) { setError('엑셀에서 항목/금액 컬럼을 찾지 못했어요. 파일에 이름·금액 같은 헤더가 있는지 확인해주세요.'); return }
    setRows(parsed)
  }

  function updateRow(i: number, field: 'label' | 'amount', value: string) {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: field === 'amount' ? Number(value) || 0 : value } : r))
  }

  function removeRow(i: number) {
    setRows(prev => prev.filter((_, idx) => idx !== i))
  }

  async function handleSave() {
    if (!month || rows.length === 0) return
    setSaving(true)
    await onSave(month, rows)
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 sticky top-0 bg-white">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="text-gray-400 text-2xl">&times;</button>
        </div>
        <div className="px-6 py-5 flex flex-col gap-4">
          <MonthInput value={month} onChange={setMonth} />
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1.5">엑셀 파일 *</label>
            <input type="file" accept=".xlsx,.xls" onChange={e => handleFile(e.target.files?.[0] || null)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-green-50 file:text-green-700 file:text-xs" />
            <p className="text-xs text-gray-400 mt-1">파일에 &quot;{labelHeader}&quot;와 &quot;금액&quot; 같은 헤더가 있으면 자동으로 인식해요</p>
          </div>
          {parsing && <p className="text-sm text-gray-400">분석 중...</p>}
          {error && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
          {rows.length > 0 && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="text-left text-xs font-semibold text-gray-400 px-3 py-2">{labelHeader}</th>
                      <th className="text-right text-xs font-semibold text-gray-400 px-3 py-2">금액</th>
                      <th className="px-2 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="px-3 py-1.5">
                          <input value={r.label} onChange={e => updateRow(i, 'label', e.target.value)}
                            className="w-full border-0 focus:ring-1 focus:ring-green-400 rounded px-1 text-sm" />
                        </td>
                        <td className="px-3 py-1.5">
                          <input type="number" value={r.amount} onChange={e => updateRow(i, 'amount', e.target.value)}
                            className="w-full text-right border-0 focus:ring-1 focus:ring-green-400 rounded px-1 text-sm" />
                        </td>
                        <td className="px-2 py-1.5">
                          <button onClick={() => removeRow(i)} className="text-red-400 hover:text-red-600 text-xs">×</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="bg-gray-50 px-3 py-2 text-xs text-gray-500 flex justify-between border-t border-gray-200">
                <span>{rows.length}건 인식됨</span>
                <span className="font-semibold text-gray-700">합계 {rows.reduce((s, r) => s + r.amount, 0).toLocaleString()}원</span>
              </div>
            </div>
          )}
          <div className="flex gap-3 mt-2">
            <button onClick={onClose} className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm font-medium">취소</button>
            <button onClick={handleSave} disabled={saving || rows.length === 0 || !month}
              className="flex-1 bg-green-600 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
              {saving ? '저장 중...' : `${rows.length}건 일괄 저장`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function MonthInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-sm font-medium text-gray-700 block mb-1.5">월 *</label>
      <input required type="month" value={value} onChange={e => onChange(e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
    </div>
  )
}

function TextInput({ label, value, onChange, required, placeholder }: { label: string; value: string; onChange: (v: string) => void; required?: boolean; placeholder?: string }) {
  return (
    <div>
      <label className="text-sm font-medium text-gray-700 block mb-1.5">{label}</label>
      <input required={required} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
    </div>
  )
}

function NumberInput({ label, value, onChange, required }: { label: string; value: string; onChange: (v: string) => void; required?: boolean }) {
  return (
    <div>
      <label className="text-sm font-medium text-gray-700 block mb-1.5">{label}</label>
      <input required={required} type="number" value={value} onChange={e => onChange(e.target.value)} placeholder="0"
        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
    </div>
  )
}
