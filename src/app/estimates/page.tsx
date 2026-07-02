'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Sidebar from '@/components/Sidebar'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import {
  Estimate, DEFAULT_RATES, CATEGORY_LIST, STATUS_LIST, PY_PRICE_STATS,
  calcGapji, fmt, newSection,
} from '@/lib/estimate'

const STATUS_COLOR: Record<string, string> = {
  '작성중': 'bg-yellow-50 text-yellow-700',
  '제출': 'bg-blue-50 text-blue-600',
  '계약': 'bg-green-50 text-green-700',
  '완료': 'bg-gray-100 text-gray-500',
}

function manwon(n: number) {
  if (n >= 100000000) return `${(n / 100000000).toFixed(n % 100000000 === 0 ? 0 : 1)}억`
  return `${Math.round(n / 10000).toLocaleString()}만원`
}

export default function EstimatesPage() {
  const router = useRouter()
  const { profile, loading: authLoading } = useAuth()
  const allowed = profile?.role === 'admin' || profile?.role === 'designer'
  const [rows, setRows] = useState<Estimate[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [filterStatus, setFilterStatus] = useState('전체')
  const [creating, setCreating] = useState(false)
  // 개략견적 계산기
  const [quickCat, setQuickCat] = useState('학원/교습소')
  const [quickPy, setQuickPy] = useState('')

  useEffect(() => {
    if (!allowed) return
    supabase.from('estimates')
      .select('*')
      .order('updated_at', { ascending: false })
      .then(({ data }) => { setRows((data as Estimate[]) || []); setLoading(false) })
  }, [allowed])

  const filtered = useMemo(() => rows.filter(e => {
    const qOk = !q || e.title.includes(q) || (e.customer || '').includes(q)
    const sOk = filterStatus === '전체' || e.status === filterStatus
    return qOk && sOk
  }), [rows, q, filterStatus])

  const quick = useMemo(() => {
    const py = Number(quickPy)
    const s = PY_PRICE_STATS[quickCat]
    if (!py || !s) return null
    return { mid: s.median * py, lo: s.min * py, hi: s.max * py }
  }, [quickCat, quickPy])

  async function createEstimate(from?: Estimate) {
    if (creating) return
    setCreating(true)
    const base = from ? {
      title: from.title + ' (복사)',
      work_name: from.work_name,
      customer: from.customer,
      category: from.category,
      area_py: from.area_py,
      note: from.note,
      sections: from.sections,
      rates: from.rates,
      nego: 0,
    } : {
      title: '새 견적',
      sections: [newSection('가설작업')],
      rates: DEFAULT_RATES,
    }
    const { data, error } = await supabase.from('estimates')
      .insert({ ...base, status: '작성중', created_by: profile?.id })
      .select('id').single()
    setCreating(false)
    if (error) { alert('생성 실패: ' + error.message); return }
    router.push(`/estimates/${data.id}`)
  }

  async function remove(e: Estimate) {
    if (!confirm(`"${e.title}" 견적을 삭제할까요?`)) return
    await supabase.from('estimates').delete().eq('id', e.id)
    setRows(rows.filter(r => r.id !== e.id))
  }

  if (!authLoading && !allowed) {
    return (
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar />
        <main className="flex-1 p-8 flex items-center justify-center text-gray-400">
          접근 권한이 없습니다. (관리자/디자인팀 전용)
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 p-4 md:p-8 pb-24 md:pb-8 overflow-x-hidden">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">견적서</h1>
          <div className="flex gap-2">
            <Link href="/estimates/prices"
              className="px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50">
              단가표
            </Link>
            <button onClick={() => createEstimate()} disabled={creating}
              className="px-4 py-2 text-sm rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">
              + 새 견적
            </button>
          </div>
        </div>

        {/* 개략견적 계산기 */}
        <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-gray-700 mr-1">⚡ 개략견적</span>
            <select value={quickCat} onChange={e => setQuickCat(e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm">
              {Object.keys(PY_PRICE_STATS).map(c => <option key={c}>{c}</option>)}
            </select>
            <input value={quickPy} onChange={e => setQuickPy(e.target.value.replace(/[^\d.]/g, ''))}
              placeholder="평수" inputMode="decimal"
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm w-20" />
            <span className="text-sm text-gray-500">평 →</span>
            {quick ? (
              <span className="text-sm">
                <b className="text-green-700">{manwon(quick.mid)}</b>
                <span className="text-gray-400 ml-2">(범위 {manwon(quick.lo)} ~ {manwon(quick.hi)} · VAT 포함)</span>
              </span>
            ) : (
              <span className="text-sm text-gray-300">평수를 입력하세요</span>
            )}
          </div>
          <p className="text-[11px] text-gray-400 mt-1.5">2024~2026 계약 실적 {'중앙값·범위'} 기준. 마감 수준에 따라 달라질 수 있음.</p>
        </div>

        {/* 필터 */}
        <div className="flex flex-wrap gap-2 mb-3">
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="현장명·고객 검색"
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white w-48" />
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white">
            <option>전체</option>
            {STATUS_LIST.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>

        {/* 목록 */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="p-10 text-center text-gray-300">불러오는 중…</div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-gray-300">견적서가 없습니다. {'"'}+ 새 견적{'"'}으로 시작하세요.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                  <th className="px-4 py-2.5">현장명</th>
                  <th className="px-2 py-2.5 hidden md:table-cell">업종</th>
                  <th className="px-2 py-2.5 hidden md:table-cell">평수</th>
                  <th className="px-2 py-2.5 text-right">합계(VAT포함)</th>
                  <th className="px-2 py-2.5">상태</th>
                  <th className="px-2 py-2.5 hidden md:table-cell">작성일</th>
                  <th className="px-2 py-2.5 w-24"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(e => {
                  const total = calcGapji(e.sections || [], e.rates || DEFAULT_RATES, e.nego || 0).grandTotal
                  return (
                    <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
                      onClick={() => router.push(`/estimates/${e.id}`)}>
                      <td className="px-4 py-3 font-medium text-gray-900">{e.title}</td>
                      <td className="px-2 py-3 text-gray-500 hidden md:table-cell">{e.category || '-'}</td>
                      <td className="px-2 py-3 text-gray-500 hidden md:table-cell">{e.area_py ? `${e.area_py}평` : '-'}</td>
                      <td className="px-2 py-3 text-right font-medium">{total ? fmt(total) : '-'}</td>
                      <td className="px-2 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_COLOR[e.status] || 'bg-gray-100 text-gray-500'}`}>
                          {e.status}
                        </span>
                      </td>
                      <td className="px-2 py-3 text-gray-400 hidden md:table-cell">{e.est_date}</td>
                      <td className="px-2 py-3 text-right" onClick={ev => ev.stopPropagation()}>
                        <button onClick={() => createEstimate(e)} title="복제"
                          className="text-gray-300 hover:text-green-600 px-1">⧉</button>
                        <button onClick={() => remove(e)} title="삭제"
                          className="text-gray-300 hover:text-red-500 px-1">✕</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
        <p className="text-[11px] text-gray-400 mt-2">업종: {CATEGORY_LIST.join(' · ')}</p>
      </main>
    </div>
  )
}
