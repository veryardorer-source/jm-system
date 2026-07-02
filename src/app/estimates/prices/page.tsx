'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Sidebar from '@/components/Sidebar'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { TRADE_PRESETS, UNIT_LIST, fmt } from '@/lib/estimate'

type PriceRow = {
  id: string; trade: string | null; name: string; spec: string | null
  unit: string | null; mat_price: number; lab_price: number; exp_price: number; memo: string | null
}

const EMPTY = { trade: TRADE_PRESETS[2], name: '', spec: '', unit: 'EA', mat_price: '', lab_price: '', exp_price: '', memo: '' }

export default function PriceBookPage() {
  const { profile, loading: authLoading } = useAuth()
  const allowed = profile?.role === 'admin' || profile?.role === 'designer'
  const canWrite = profile?.role === 'admin'
  const [rows, setRows] = useState<PriceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [filterTrade, setFilterTrade] = useState('전체')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<typeof EMPTY>(EMPTY)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!allowed) return
    fetchAll()
  }, [allowed])

  async function fetchAll() {
    const { data } = await supabase.from('price_book').select('*').order('trade').order('name')
    setRows((data as PriceRow[]) || [])
    setLoading(false)
  }

  const trades = useMemo(() => Array.from(new Set(rows.map(r => r.trade).filter(Boolean))) as string[], [rows])
  const filtered = rows.filter(r => {
    const qOk = !q || r.name.includes(q) || (r.spec || '').includes(q)
    const tOk = filterTrade === '전체' || r.trade === filterTrade
    return qOk && tOk
  })

  function openAdd() { setEditingId(null); setForm(EMPTY); setShowForm(true) }
  function openEdit(r: PriceRow) {
    setEditingId(r.id)
    setForm({
      trade: r.trade || '', name: r.name, spec: r.spec || '', unit: r.unit || 'EA',
      mat_price: String(r.mat_price || ''), lab_price: String(r.lab_price || ''), exp_price: String(r.exp_price || ''),
      memo: r.memo || '',
    })
    setShowForm(true)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    const row = {
      trade: form.trade || null, name: form.name.trim(), spec: form.spec || null, unit: form.unit || null,
      mat_price: Number(form.mat_price) || 0, lab_price: Number(form.lab_price) || 0, exp_price: Number(form.exp_price) || 0,
      memo: form.memo || null, updated_at: new Date().toISOString(),
    }
    const { error } = editingId
      ? await supabase.from('price_book').update(row).eq('id', editingId)
      : await supabase.from('price_book').insert(row)
    setSaving(false)
    if (error) { alert('저장 실패: ' + error.message); return }
    setShowForm(false)
    fetchAll()
  }

  async function remove(r: PriceRow) {
    if (!confirm(`"${r.name}" 삭제할까요?`)) return
    await supabase.from('price_book').delete().eq('id', r.id)
    setRows(rows.filter(x => x.id !== r.id))
  }

  if (!authLoading && !allowed) {
    return (
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar />
        <main className="flex-1 p-8 flex items-center justify-center text-gray-400">접근 권한이 없습니다.</main>
      </div>
    )
  }

  const inputCls = 'border border-gray-200 rounded-lg px-2.5 py-2 text-sm w-full'

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 p-4 md:p-8 pb-24 md:pb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Link href="/estimates" className="text-gray-400 hover:text-gray-600 text-sm">← 견적서</Link>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900">자재 단가표</h1>
          </div>
          {canWrite && (
            <button onClick={openAdd}
              className="px-4 py-2 text-sm rounded-lg bg-green-600 text-white hover:bg-green-700">+ 품목 추가</button>
          )}
        </div>

        <div className="flex flex-wrap gap-2 mb-3">
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="품명·규격 검색"
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white w-48" />
          <select value={filterTrade} onChange={e => setFilterTrade(e.target.value)}
            className="border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white">
            <option>전체</option>
            {trades.map(t => <option key={t}>{t}</option>)}
          </select>
          <span className="text-sm text-gray-400 self-center">{filtered.length}개</span>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
          {loading ? (
            <div className="p-10 text-center text-gray-300">불러오는 중…</div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-gray-300">
              품목이 없습니다. {canWrite ? '"+ 품목 추가"로 자주 쓰는 자재를 등록하면 견적 작성 시 자동 완성됩니다.' : ''}
            </div>
          ) : (
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                  <th className="px-4 py-2.5">공종</th>
                  <th className="px-2 py-2.5">품명</th>
                  <th className="px-2 py-2.5">규격</th>
                  <th className="px-2 py-2.5">단위</th>
                  <th className="px-2 py-2.5 text-right">재료비</th>
                  <th className="px-2 py-2.5 text-right">노무비</th>
                  <th className="px-2 py-2.5 text-right">경비</th>
                  <th className="px-2 py-2.5 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-gray-500">{r.trade || '-'}</td>
                    <td className="px-2 py-2.5 font-medium text-gray-900">{r.name}</td>
                    <td className="px-2 py-2.5 text-gray-500">{r.spec || '-'}</td>
                    <td className="px-2 py-2.5 text-gray-500">{r.unit || '-'}</td>
                    <td className="px-2 py-2.5 text-right">{r.mat_price ? fmt(r.mat_price) : '-'}</td>
                    <td className="px-2 py-2.5 text-right">{r.lab_price ? fmt(r.lab_price) : '-'}</td>
                    <td className="px-2 py-2.5 text-right">{r.exp_price ? fmt(r.exp_price) : '-'}</td>
                    <td className="px-2 py-2.5 text-right">
                      {canWrite && (
                        <>
                          <button onClick={() => openEdit(r)} className="text-gray-300 hover:text-green-600 px-1">✎</button>
                          <button onClick={() => remove(r)} className="text-gray-300 hover:text-red-500 px-1">✕</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {!canWrite && <p className="text-[11px] text-gray-400 mt-2">단가 수정은 관리자만 가능합니다.</p>}

        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
            <div className="absolute inset-0 bg-black/40" />
            <form onSubmit={submit} onClick={e => e.stopPropagation()}
              className="relative bg-white rounded-2xl p-5 w-full max-w-md shadow-2xl">
              <h2 className="font-bold text-gray-900 mb-4">{editingId ? '품목 수정' : '품목 추가'}</h2>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] text-gray-400">공종</label>
                  <select className={inputCls} value={form.trade} onChange={e => setForm({ ...form, trade: e.target.value })}>
                    {TRADE_PRESETS.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-gray-400">단위</label>
                  <select className={inputCls} value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })}>
                    {UNIT_LIST.map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-[11px] text-gray-400">품명 *</label>
                  <input className={inputCls} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} autoFocus />
                </div>
                <div className="col-span-2">
                  <label className="text-[11px] text-gray-400">규격</label>
                  <input className={inputCls} value={form.spec} placeholder="900*1800*9T"
                    onChange={e => setForm({ ...form, spec: e.target.value })} />
                </div>
                <div>
                  <label className="text-[11px] text-gray-400">재료비 단가</label>
                  <input className={inputCls} inputMode="numeric" value={form.mat_price}
                    onChange={e => setForm({ ...form, mat_price: e.target.value.replace(/[^\d]/g, '') })} />
                </div>
                <div>
                  <label className="text-[11px] text-gray-400">노무비 단가</label>
                  <input className={inputCls} inputMode="numeric" value={form.lab_price}
                    onChange={e => setForm({ ...form, lab_price: e.target.value.replace(/[^\d]/g, '') })} />
                </div>
                <div>
                  <label className="text-[11px] text-gray-400">경비 단가</label>
                  <input className={inputCls} inputMode="numeric" value={form.exp_price}
                    onChange={e => setForm({ ...form, exp_price: e.target.value.replace(/[^\d]/g, '') })} />
                </div>
                <div>
                  <label className="text-[11px] text-gray-400">메모</label>
                  <input className={inputCls} value={form.memo} onChange={e => setForm({ ...form, memo: e.target.value })} />
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-600">취소</button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-2.5 rounded-lg bg-green-600 text-white text-sm hover:bg-green-700 disabled:opacity-50">
                  {saving ? '저장 중…' : '저장'}
                </button>
              </div>
            </form>
          </div>
        )}
      </main>
    </div>
  )
}
