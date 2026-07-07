'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase-browser'
import { FixedCost, Payroll, ProjectProfit, SalesRecord, Project, supabase } from '@/lib/supabase'
import { parseExcelRows, parseExcelTotal, ParsedRow, parsePayrollLedger, PayrollLedger, parsePayrollLedgerFull, PayrollLedgerFull } from '@/lib/excel-parse'
import FileDropInput from '@/components/FileDropInput'

const TAB_LIST = ['고정지출', '급여내역', '현장별 이익', '매출매입', '견적서'] as const
type Tab = typeof TAB_LIST[number]

type Quote = { id: string; title: string; quote_date: string | null; amount: number; memo: string | null; file_url: string | null; file_name: string | null; created_at: string }

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
  const [sales, setSales] = useState<SalesRecord[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [quotes, setQuotes] = useState<Quote[]>([])

  useEffect(() => {
    if (!authLoading) {
      if (!myProfile || myProfile.role !== 'admin') { router.push('/'); return }
      fetchAll()
    }
  }, [authLoading, myProfile])

  async function fetchAll() {
    setLoading(true)
    const sb = createClient()
    const [fc, pr, pp, sl, proj, qt] = await Promise.all([
      sb.from('finance_fixed_costs').select('*').order('month', { ascending: false }),
      sb.from('finance_payroll').select('*').order('month', { ascending: false }),
      sb.from('finance_project_profit').select('*').order('month', { ascending: false }),
      sb.from('finance_sales').select('*').order('month', { ascending: false }),
      supabase.from('projects').select('*').order('name'),
      sb.from('finance_quotes').select('*').order('quote_date', { ascending: false, nullsFirst: false }),
    ])
    setFixedCosts(fc.data || [])
    setPayrolls(pr.data || [])
    setProfits(pp.data || [])
    setSales(sl.data || [])
    setProjects(proj.data || [])
    setQuotes(qt.data || [])
    setLoading(false)
  }

  if (authLoading || loading) return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex items-center justify-center text-gray-400">불러오는 중...</div>
    </div>
  )

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <header className="bg-white border-b border-gray-200 px-4 md:px-8 py-4 md:py-5">
          <h1 className="text-xl font-bold text-gray-900">재정관리</h1>
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
        <div className="flex-1 overflow-auto px-4 md:px-8 py-6 pb-20 md:pb-6">
          {tab === '고정지출' && <FixedCostTab list={fixedCosts} onRefresh={fetchAll} />}
          {tab === '급여내역' && <PayrollTab list={payrolls} onRefresh={fetchAll} />}
          {tab === '현장별 이익' && <ProfitTab list={profits} projects={projects} onRefresh={fetchAll} />}
          {tab === '매출매입' && <SalesTab list={sales} onRefresh={fetchAll} />}
          {tab === '견적서' && <QuoteTab list={quotes} onRefresh={fetchAll} />}
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

  async function bulkSave(month: string, rows: ParsedRow[]) {
    const sb = createClient()
    const { error } = await sb.from('finance_fixed_costs').insert(
      rows.map(r => ({ month: month + '-01', title: r.label, amount: r.amount, memo: '' }))
    )
    if (error) { alert('저장 실패: ' + error.message); return }
    setShowBulk(false)
    onRefresh()
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!form.month || !form.title) return
    setSaving(true)
    const sb = createClient()
    const payload = { month: form.month + '-01', title: form.title, amount: Number(form.amount) || 0, memo: form.memo }
    const { error } = editing
      ? await sb.from('finance_fixed_costs').update(payload).eq('id', editing.id)
      : await sb.from('finance_fixed_costs').insert([payload])
    if (error) { alert('저장 실패: ' + error.message); setSaving(false); return }
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
          className="border border-green-600 text-green-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-50">📊 엑셀로 일괄 추가</button>
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
        <BulkImportModal title="고정지출 엑셀 일괄 추가" labelHeader="항목명" onClose={() => setShowBulk(false)} onSave={bulkSave} />
      )}
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
    if (error) { alert('저장 실패: ' + error.message); return }
    setShowBulk(false)
    onRefresh()
  }

  // 급여대장 업로드 → 그 달 데이터를 새 내용으로 교체 후 저장 (+ 전체 시트 원본도 보관)
  async function ledgerSave(data: PayrollLedger, full: PayrollLedgerFull | null) {
    const sb = createClient()
    const monthKey = data.month + '-01'
    // 같은 달 기존 것 전부 삭제 후 교체 — 삭제 실패 시 중단(중복 방지)
    const { error: delErr } = await sb.from('finance_payroll').delete()
      .gte('month', data.month + '-01').lte('month', data.month + '-31')
    if (delErr) { alert('기존 자료 삭제 실패(중복 방지를 위해 중단): ' + delErr.message); return }
    const { error } = await sb.from('finance_payroll').insert(
      data.rows.map(r => ({
        month: monthKey,
        employee_name: r.name,
        amount: r.gross,
        memo: `실지급 ${r.net.toLocaleString()}원${r.base ? ` · 기본급 ${r.base.toLocaleString()}` : ''}`,
      }))
    )
    if (error) { alert('저장 실패: ' + error.message); return }
    // 전체 시트(수당·공제 항목 포함) 저장 — '급여대장' 보기에서 사용
    if (full) {
      const { error: le } = await sb.from('finance_payroll_ledger').upsert({
        month: data.month, headers: full.headers, rows: full.rows, total: full.total, updated_at: new Date().toISOString(),
      }, { onConflict: 'month' })
      if (le) alert('요약은 저장됐지만 전체 시트 저장에 실패했어요.\n(관리자에게: db/payroll_ledger.sql 실행 필요)\n' + le.message)
    }
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
    if (error) { alert('저장 실패: ' + error.message); setSaving(false); return }
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
      {showLedger && <LedgerUploadModal onClose={() => setShowLedger(false)} onSave={ledgerSave} />}
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
type LedgerRec = { month: string; headers: string[]; rows: string[][]; total: string[] | null }
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
      setSel(s => s && list.some(l => l.month === s) ? s : (list[0]?.month || ''))
    })
    return () => { on = false }
  }, [refresh])

  if (loading) return <EmptyState icon="⏳" text="불러오는 중..." />
  if (loadError) return <EmptyState icon="⚠️" text={`급여대장 테이블을 읽지 못했어요 — db/payroll_ledger.sql 실행이 필요할 수 있어요. (${loadError})`} />
  if (ledgers.length === 0) return <EmptyState icon="📋" text="저장된 급여대장이 없어요. '📋 급여대장 업로드'로 엑셀을 올리면 전체 시트(수당·공제 포함)가 여기 보관돼요." />

  const cur = ledgers.find(l => l.month === sel) || ledgers[0]
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
          <button key={l.month} onClick={() => setSel(l.month)}
            className={`text-xs px-3 py-1.5 rounded-full border font-medium ${sel === l.month ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-500 border-gray-300 hover:border-green-400'}`}>
            {l.month}
          </button>
        ))}
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <p className="text-xs text-gray-400 px-4 pt-3">
          {cur.month} 급여대장 원본 · <span className="text-red-500">빨강=공제 항목</span> · <span className="text-green-700 font-medium">초록=차감지급액(실지급)</span>
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
function LedgerUploadModal({ onClose, onSave }: { onClose: () => void; onSave: (d: PayrollLedger, full: PayrollLedgerFull | null) => Promise<void> }) {
  const [data, setData] = useState<PayrollLedger | null>(null)
  const [full, setFull] = useState<PayrollLedgerFull | null>(null)
  const [month, setMonth] = useState('') // 'YYYY-MM' (자동 인식 또는 직접 선택)
  const [parsing, setParsing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleFile(file: File | null) {
    if (!file) return
    setParsing(true); setError(''); setData(null); setFull(null)
    const parsed = await parsePayrollLedger(file).catch(() => null)
    const parsedFull = await parsePayrollLedgerFull(file).catch(() => null)
    setParsing(false)
    if (!parsed) { setError('급여대장 시트에서 성명/급여합계를 찾지 못했어요. 파일에 "급여대장" 시트와 성명·급여합계 열이 있는지 확인해주세요.'); return }
    setData(parsed)
    setFull(parsedFull)
    // 월은 자동 입력하지 않음 — 사용자가 직접 선택 (잘못된 달로 저장 방지)
  }
  async function handleSave() {
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
            <p className="text-xs text-gray-400 mt-1">여러 시트 중 <b>&quot;급여대장&quot;</b> 시트를 자동으로 읽어요. 파일 선택 후 <b>어느 달 급여인지 직접 선택</b>하고 저장하세요.</p>
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
          <div className="flex gap-3 mt-1">
            <button onClick={onClose} className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm font-medium">취소</button>
            <button onClick={handleSave} disabled={saving || !data || !month}
              className="flex-1 bg-green-600 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
              {saving ? '저장 중...' : month ? `${month} 급여 저장` : '월 선택 필요'}
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
      const { error: upErr } = await sb.storage.from('uploads').upload(path, profitFile, { contentType: profitFile.type || 'application/octet-stream', upsert: true })
      if (upErr) { alert('파일 업로드 실패: ' + upErr.message); setSaving(false); return }
      file_url = sb.storage.from('uploads').getPublicUrl(path).data.publicUrl
      file_name = profitFile.name
    }
    const payload = { project_id: form.project_id, month: form.month + '-01', revenue: Number(form.revenue) || 0, cost: Number(form.cost) || 0, memo: form.memo, file_url, file_name }
    const { error } = editing
      ? await sb.from('finance_project_profit').update(payload).eq('id', editing.id)
      : await sb.from('finance_project_profit').insert([payload])
    if (error) { alert('저장 실패: ' + error.message); setSaving(false); return }
    setForm({ project_id: '', month: '', revenue: '', cost: '', memo: '' })
    setProfitFile(null)
    setEditing(null); setShowForm(false); setSaving(false)
    onRefresh()
  }

  function openFile(p: ProjectProfit) {
    if (!p.file_url) return
    const name = (p.file_name || p.file_url).toLowerCase()
    if (/\.(xlsx|xls|xlsb|xlsm|doc|docx|ppt|pptx)$/.test(name)) window.open(`https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(p.file_url)}`, '_blank')
    else if (name.endsWith('.pdf')) window.open(`https://docs.google.com/viewer?url=${encodeURIComponent(p.file_url)}`, '_blank')
    else window.open(p.file_url, '_blank')
  }

  async function del(p: ProjectProfit) {
    if (!confirm('이 항목을 삭제할까요?')) return
    const sb = createClient()
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

// ───────────── 매출매입 ─────────────
function SalesTab({ list, onRefresh }: { list: SalesRecord[]; onRefresh: () => void }) {
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<SalesRecord | null>(null)
  const [form, setForm] = useState({ month: '', type: '매출' as '매출' | '매입', amount: '', memo: '' })
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!form.month) return
    setSaving(true)
    const sb = createClient()
    let file_url = editing?.file_url || '', file_name = editing?.file_name || ''
    if (file) {
      const ext = file.name.split('.').pop() || 'bin'
      const path = `finance/sales/${Date.now()}.${ext}`
      const { error: upErr } = await sb.storage.from('uploads').upload(path, file, { contentType: file.type, upsert: true })
      if (upErr) { alert('파일 업로드 실패: ' + upErr.message); setSaving(false); return }
      const { data } = sb.storage.from('uploads').getPublicUrl(path)
      file_url = data.publicUrl
      file_name = file.name
    }
    const payload = { month: form.month + '-01', type: form.type, amount: Number(form.amount) || 0, memo: form.memo, file_url, file_name }
    const { error } = editing
      ? await sb.from('finance_sales').update(payload).eq('id', editing.id)
      : await sb.from('finance_sales').insert([payload])
    if (error) { alert('저장 실패: ' + error.message); setSaving(false); return }
    setForm({ month: '', type: '매출', amount: '', memo: '' }); setFile(null)
    setEditing(null); setShowForm(false); setSaving(false)
    onRefresh()
  }

  async function del(s: SalesRecord) {
    if (!confirm('이 항목을 삭제할까요?')) return
    const sb = createClient()
    if (s.file_url) { const path = s.file_url.split('/uploads/')[1]; if (path) await sb.storage.from('uploads').remove([path]) }
    await sb.from('finance_sales').delete().eq('id', s.id)
    onRefresh()
  }

  const byMonth = Object.values(list.reduce((acc, c) => {
    const k = c.month?.slice(0, 7) || ''
    acc[k] = acc[k] || { label: k.slice(2).replace('-', '.'), value: 0, key: k }
    acc[k].value += c.type === '매출' ? c.amount : -c.amount
    return acc
  }, {} as Record<string, { label: string; value: number; key: string }>)).sort((a, b) => a.key.localeCompare(b.key))

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={() => { setEditing(null); setForm({ month: '', type: '매출', amount: '', memo: '' }); setFile(null); setShowForm(true) }}
          className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700">+ 매출/매입 자료 추가</button>
      </div>
      {list.length === 0 ? (
        <EmptyState icon="🧾" text="등록된 매출매입 자료가 없어요" />
      ) : (
        <>
          <ChartCard title="월별 순매출(매출-매입) 추이" data={byMonth} />
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left text-xs font-semibold text-gray-400 px-6 py-3">월</th>
                  <th className="text-left text-xs font-semibold text-gray-400 px-4 py-3">구분</th>
                  <th className="text-right text-xs font-semibold text-gray-400 px-4 py-3">금액</th>
                  <th className="text-left text-xs font-semibold text-gray-400 px-4 py-3">첨부</th>
                  <th className="text-left text-xs font-semibold text-gray-400 px-4 py-3">메모</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {list.map(s => (
                  <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-6 py-3 text-sm font-medium text-gray-800">{s.month?.slice(0,7)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${s.type === '매출' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>{s.type}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-semibold text-gray-800">{s.amount.toLocaleString()}원</td>
                    <td className="px-4 py-3">
                      {s.file_url ? (
                        <button onClick={() => {
                          const name = s.file_name?.toLowerCase() || ''
                          if (/\.(xlsx|xls|doc|docx|ppt|pptx)$/.test(name)) window.open(`https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(s.file_url)}`, '_blank')
                          else if (name.endsWith('.pdf')) window.open(`https://docs.google.com/viewer?url=${encodeURIComponent(s.file_url)}`, '_blank')
                          else window.open(s.file_url, '_blank')
                        }} className="text-xs text-green-600 hover:underline truncate max-w-[140px] inline-block">📎 {s.file_name}</button>
                      ) : <span className="text-xs text-gray-300">-</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">{s.memo || '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        <button onClick={() => { setEditing(s); setForm({ month: s.month?.slice(0,7) || '', type: s.type, amount: String(s.amount), memo: s.memo || '' }); setFile(null); setShowForm(true) }}
                          className="text-xs text-green-500 hover:text-green-700">수정</button>
                        <button onClick={() => del(s)} className="text-xs text-red-400 hover:text-red-600">삭제</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {showForm && (
        <FormModal title={editing ? '매출매입 자료 수정' : '매출매입 자료 추가'} onClose={() => setShowForm(false)} onSubmit={save} saving={saving}>
          <div className="grid grid-cols-2 gap-2">
            {(['매출', '매입'] as const).map(t => (
              <button key={t} type="button" onClick={() => setForm({ ...form, type: t })}
                className={`py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                  form.type === t ? 'bg-green-600 text-white border-green-600' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                }`}>{t}</button>
            ))}
          </div>
          <MonthInput value={form.month} onChange={v => setForm({ ...form, month: v })} />
          <NumberInput label="금액 *" required value={form.amount} onChange={v => setForm({ ...form, amount: v })} />
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1.5">자료 첨부 <span className="text-gray-400 font-normal">(엑셀이면 금액 자동 인식)</span></label>
            <FileDropInput currentName={file?.name} hint="엑셀·PDF·사진 등"
              onFile={async f => {
                setFile(f)
                if (/\.(xlsx|xls)$/i.test(f.name)) {
                  const total = await parseExcelTotal(f).catch(() => null)
                  if (total) setForm(prev => ({ ...prev, amount: String(total) }))
                }
              }} />
          </div>
          <TextInput label="메모" value={form.memo} onChange={v => setForm({ ...form, memo: v })} />
        </FormModal>
      )}
    </div>
  )
}

// ───────────── 견적서 ─────────────
function QuoteTab({ list, onRefresh }: { list: Quote[]; onRefresh: () => void }) {
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Quote | null>(null)
  const [form, setForm] = useState({ title: '', amount: '' })
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) return
    setSaving(true)
    const sb = createClient()
    let file_url = editing?.file_url || '', file_name = editing?.file_name || ''
    if (file) {
      const ext = file.name.split('.').pop() || 'bin'
      const path = `finance/quotes/${Date.now()}.${ext}`
      const { error: upErr } = await sb.storage.from('uploads').upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: true })
      if (upErr) { alert('파일 업로드 실패: ' + upErr.message); setSaving(false); return }
      file_url = sb.storage.from('uploads').getPublicUrl(path).data.publicUrl
      file_name = file.name
    }
    const payload = { title: form.title.trim(), amount: Number(form.amount) || 0, file_url, file_name }
    const { error } = editing
      ? await sb.from('finance_quotes').update(payload).eq('id', editing.id)
      : await sb.from('finance_quotes').insert([payload])
    if (error) { alert('저장 실패: ' + error.message); setSaving(false); return }
    setForm({ title: '', amount: '' }); setFile(null)
    setEditing(null); setShowForm(false); setSaving(false)
    onRefresh()
  }

  async function del(q: Quote) {
    if (!confirm(`"${q.title}" 견적서를 삭제할까요?`)) return
    const sb = createClient()
    if (q.file_url) { const path = q.file_url.split('/uploads/')[1]; if (path) await sb.storage.from('uploads').remove([path]) }
    await sb.from('finance_quotes').delete().eq('id', q.id)
    onRefresh()
  }

  function openFile(q: Quote) {
    if (!q.file_url) return
    const name = q.file_name?.toLowerCase() || ''
    if (/\.(xlsx|xls|doc|docx|ppt|pptx)$/.test(name)) {
      // 엑셀·워드·PPT → 마이크로소프트 오피스 온라인 뷰어(다운로드 없이 미리보기)
      window.open(`https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(q.file_url)}`, '_blank')
    } else {
      // PDF·사진 등은 브라우저에서 바로 열림
      window.open(q.file_url, '_blank')
    }
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={() => { setEditing(null); setForm({ title: '', amount: '' }); setFile(null); setShowForm(true) }}
          className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700">+ 견적서 추가</button>
      </div>
      <p className="text-xs text-gray-400 mb-3">이 프로그램 이전에 만든 견적서(PDF·엑셀·사진)도 파일로 올려두면 여기서 모아볼 수 있어요.</p>
      {list.length === 0 ? (
        <EmptyState icon="📄" text="등록된 견적서가 없어요" />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left text-xs font-semibold text-gray-400 px-6 py-3">현장명</th>
                <th className="text-right text-xs font-semibold text-gray-400 px-4 py-3 whitespace-nowrap">금액</th>
                <th className="text-left text-xs font-semibold text-gray-400 px-4 py-3">첨부파일</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {list.map(q => (
                <tr key={q.id} className="border-b border-gray-50 hover:bg-gray-50 align-top">
                  <td className="px-6 py-3 text-sm font-medium text-gray-800">{q.title}</td>
                  <td className="px-4 py-3 text-sm text-right font-semibold text-gray-800 whitespace-nowrap">{q.amount ? q.amount.toLocaleString() + '원' : '-'}</td>
                  <td className="px-4 py-3">
                    {q.file_url ? (
                      <button onClick={() => openFile(q)} className="text-sm text-green-600 hover:underline text-left break-all">📎 {q.file_name}</button>
                    ) : <span className="text-xs text-gray-300">-</span>}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => { setEditing(q); setForm({ title: q.title, amount: String(q.amount || '') }); setFile(null); setShowForm(true) }}
                        className="text-xs text-green-500 hover:text-green-700">수정</button>
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
        <FormModal title={editing ? '견적서 수정' : '견적서 추가'} onClose={() => setShowForm(false)} onSubmit={save} saving={saving}>
          <TextInput label="현장명 *" required value={form.title} onChange={v => setForm({ ...form, title: v })} placeholder="예) 롯데캐슬 미용실" />
          <NumberInput label="금액" value={form.amount} onChange={v => setForm({ ...form, amount: v })} />
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1.5">
              첨부파일 {editing?.file_name ? <span className="text-gray-400 font-normal">(변경 시에만 · 현재: {editing.file_name})</span> : <span className="text-gray-400 font-normal">(PDF·엑셀·사진)</span>}
            </label>
            <FileDropInput onFile={f => setFile(f)} currentName={file?.name} hint="PDF·엑셀·사진 등" />
          </div>
        </FormModal>
      )}
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
