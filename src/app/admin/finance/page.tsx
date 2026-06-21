'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase-browser'
import { FixedCost, Payroll, ProjectProfit, SalesRecord, Project, supabase } from '@/lib/supabase'

const TAB_LIST = ['고정지출', '급여내역', '현장별 이익', '매출매입'] as const
type Tab = typeof TAB_LIST[number]

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

  useEffect(() => {
    if (!authLoading) {
      if (!myProfile || myProfile.role !== 'admin') { router.push('/'); return }
      fetchAll()
    }
  }, [authLoading, myProfile])

  async function fetchAll() {
    setLoading(true)
    const sb = createClient()
    const [fc, pr, pp, sl, proj] = await Promise.all([
      sb.from('finance_fixed_costs').select('*').order('month', { ascending: false }),
      sb.from('finance_payroll').select('*').order('month', { ascending: false }),
      sb.from('finance_project_profit').select('*').order('month', { ascending: false }),
      sb.from('finance_sales').select('*').order('month', { ascending: false }),
      supabase.from('projects').select('*').order('name'),
    ])
    setFixedCosts(fc.data || [])
    setPayrolls(pr.data || [])
    setProfits(pp.data || [])
    setSales(sl.data || [])
    setProjects(proj.data || [])
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
        </div>
      </div>
    </div>
  )
}

// ───────────── 고정지출 ─────────────
function FixedCostTab({ list, onRefresh }: { list: FixedCost[]; onRefresh: () => void }) {
  const [showForm, setShowForm] = useState(false)
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
      <div className="flex justify-end mb-4">
        <button onClick={() => { setEditing(null); setForm({ month: '', title: '', amount: '', memo: '' }); setShowForm(true) }}
          className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700">+ 고정지출 추가</button>
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
    </div>
  )
}

// ───────────── 급여내역 ─────────────
function PayrollTab({ list, onRefresh }: { list: Payroll[]; onRefresh: () => void }) {
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Payroll | null>(null)
  const [form, setForm] = useState({ month: '', employee_name: '', amount: '', memo: '' })
  const [saving, setSaving] = useState(false)

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
      <div className="flex justify-end mb-4">
        <button onClick={() => { setEditing(null); setForm({ month: '', employee_name: '', amount: '', memo: '' }); setShowForm(true) }}
          className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700">+ 급여 추가</button>
      </div>
      {list.length === 0 ? (
        <EmptyState icon="💵" text="등록된 급여내역이 없어요" />
      ) : (
        <>
          <ChartCard title="월별 총 급여 추이" data={byMonth} />
          <SimpleTable
            cols={['월', '직원명', '금액', '메모']}
            rows={list.map(c => [c.month?.slice(0,7), c.employee_name, c.amount.toLocaleString() + '원', c.memo || '-'])}
            onEdit={i => { const c = list[i]; setEditing(c); setForm({ month: c.month?.slice(0,7) || '', employee_name: c.employee_name, amount: String(c.amount), memo: c.memo || '' }); setShowForm(true) }}
            onDelete={i => del(list[i])}
          />
        </>
      )}
      {showForm && (
        <FormModal title={editing ? '급여 수정' : '급여 추가'} onClose={() => setShowForm(false)} onSubmit={save} saving={saving}>
          <MonthInput value={form.month} onChange={v => setForm({ ...form, month: v })} />
          <TextInput label="직원명 *" required value={form.employee_name} onChange={v => setForm({ ...form, employee_name: v })} />
          <NumberInput label="금액 *" required value={form.amount} onChange={v => setForm({ ...form, amount: v })} />
          <TextInput label="메모" value={form.memo} onChange={v => setForm({ ...form, memo: v })} />
        </FormModal>
      )}
    </div>
  )
}

// ───────────── 현장별 이익 ─────────────
function ProfitTab({ list, projects, onRefresh }: { list: ProjectProfit[]; projects: Project[]; onRefresh: () => void }) {
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<ProjectProfit | null>(null)
  const [form, setForm] = useState({ project_id: '', month: '', revenue: '', cost: '', memo: '' })
  const [saving, setSaving] = useState(false)
  const [filterProject, setFilterProject] = useState('전체')

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!form.project_id || !form.month) return
    setSaving(true)
    const sb = createClient()
    const payload = { project_id: form.project_id, month: form.month + '-01', revenue: Number(form.revenue) || 0, cost: Number(form.cost) || 0, memo: form.memo }
    const { error } = editing
      ? await sb.from('finance_project_profit').update(payload).eq('id', editing.id)
      : await sb.from('finance_project_profit').insert([payload])
    if (error) { alert('저장 실패: ' + error.message); setSaving(false); return }
    setForm({ project_id: '', month: '', revenue: '', cost: '', memo: '' })
    setEditing(null); setShowForm(false); setSaving(false)
    onRefresh()
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
            cols={['현장', '월', '매출', '비용', '이익', '메모']}
            rows={filtered.map(c => [
              projectName(c.project_id), c.month?.slice(0,7),
              c.revenue.toLocaleString() + '원', c.cost.toLocaleString() + '원',
              (c.revenue - c.cost).toLocaleString() + '원', c.memo || '-'
            ])}
            onEdit={i => { const c = filtered[i]; setEditing(c); setForm({ project_id: c.project_id, month: c.month?.slice(0,7) || '', revenue: String(c.revenue), cost: String(c.cost), memo: c.memo || '' }); setShowForm(true) }}
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
                          if (name.endsWith('.pdf')) window.open(`https://docs.google.com/viewer?url=${encodeURIComponent(s.file_url)}`, '_blank')
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
            <label className="text-sm font-medium text-gray-700 block mb-1.5">자료 첨부</label>
            <input type="file" onChange={e => setFile(e.target.files?.[0] || null)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-green-50 file:text-green-700 file:text-xs" />
          </div>
          <TextInput label="메모" value={form.memo} onChange={v => setForm({ ...form, memo: v })} />
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

function SimpleTable({ cols, rows, onEdit, onDelete }: { cols: string[]; rows: (string | number)[][]; onEdit: (i: number) => void; onDelete: (i: number) => void }) {
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
