'use client'

import { useEffect, useMemo, useRef, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Sidebar from '@/components/Sidebar'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import {
  Estimate, EstimateSection, EstimateItem, DEFAULT_RATES, EMPTY_ITEM,
  TRADE_PRESETS, CATEGORY_LIST, STATUS_LIST, UNIT_LIST,
  calcGapji, sectionSubtotal, itemAmounts, toKoreanAmount, fmt, newSection,
} from '@/lib/estimate'
import { downloadEstimateExcel } from '@/lib/estimate-excel'

type PriceRow = { id: string; trade: string | null; name: string; spec: string | null; unit: string | null; mat_price: number; lab_price: number; exp_price: number }

function NumInput({ value, onChange, className = '', decimal = false }: {
  value: number; onChange: (n: number) => void; className?: string; decimal?: boolean
}) {
  const [text, setText] = useState(value ? String(value) : '')
  useEffect(() => { setText(value ? String(value) : '') }, [value])
  return (
    <input
      value={text}
      inputMode={decimal ? 'decimal' : 'numeric'}
      onChange={e => {
        const t = e.target.value.replace(decimal ? /[^\d.]/g : /[^\d]/g, '')
        setText(t)
        onChange(Number(t) || 0)
      }}
      onBlur={() => setText(value ? String(value) : '')}
      className={`w-full px-1.5 py-1 text-right border border-transparent hover:border-gray-200 focus:border-green-400 rounded outline-none bg-transparent ${className}`}
    />
  )
}

export default function EstimateEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { profile, loading: authLoading } = useAuth()
  const allowed = profile?.role === 'admin' || profile?.role === 'designer'

  const [est, setEst] = useState<Estimate | null>(null)
  const [prices, setPrices] = useState<PriceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({})
  const [addTrade, setAddTrade] = useState(TRADE_PRESETS[0])
  const estRef = useRef<Estimate | null>(null)
  estRef.current = est

  useEffect(() => {
    if (!allowed) return
    Promise.all([
      supabase.from('estimates').select('*').eq('id', id).single(),
      supabase.from('price_book').select('*').order('trade').order('name'),
    ]).then(([{ data: e }, { data: p }]) => {
      if (e) {
        setEst({ ...e, sections: e.sections || [], rates: { ...DEFAULT_RATES, ...(e.rates || {}) } } as Estimate)
      }
      setPrices((p as PriceRow[]) || [])
      setLoading(false)
    })
  }, [id, allowed])

  // 이탈 경고
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault() } }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  const gapji = useMemo(
    () => est ? calcGapji(est.sections, est.rates, est.nego) : null,
    [est],
  )

  function patch(p: Partial<Estimate>) {
    setEst(prev => prev ? { ...prev, ...p } : prev)
    setDirty(true)
  }
  function patchSection(si: number, sec: EstimateSection) {
    if (!est) return
    const sections = est.sections.map((s, i) => i === si ? sec : s)
    patch({ sections })
  }
  function patchItem(si: number, ii: number, p: Partial<EstimateItem>) {
    if (!est) return
    const sec = est.sections[si]
    const items = sec.items.map((it, i) => i === ii ? { ...it, ...p } : it)
    patchSection(si, { ...sec, items })
  }

  // 단가표 품명 자동 채움
  function onItemName(si: number, ii: number, name: string) {
    const hit = prices.find(p => p.name === name)
    if (hit) {
      patchItem(si, ii, {
        name,
        spec: hit.spec || '',
        unit: hit.unit || 'EA',
        mat: Number(hit.mat_price) || 0,
        lab: Number(hit.lab_price) || 0,
        exp: Number(hit.exp_price) || 0,
      })
    } else {
      patchItem(si, ii, { name })
    }
  }

  async function save() {
    const e = estRef.current
    if (!e || saving) return
    setSaving(true)
    const { error } = await supabase.from('estimates').update({
      title: e.title, work_name: e.work_name, customer: e.customer,
      category: e.category, area_py: e.area_py, status: e.status,
      est_date: e.est_date, note: e.note,
      sections: e.sections, rates: e.rates, nego: e.nego,
    }).eq('id', e.id)
    setSaving(false)
    if (error) { alert('저장 실패: ' + error.message); return }
    setDirty(false)
  }

  async function excel() {
    if (!est) return
    if (dirty) await save()
    await downloadEstimateExcel(estRef.current!)
  }

  if (!authLoading && !allowed) {
    return (
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar />
        <main className="flex-1 p-8 flex items-center justify-center text-gray-400">접근 권한이 없습니다.</main>
      </div>
    )
  }
  if (loading || !est || !gapji) {
    return (
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar />
        <main className="flex-1 p-8 flex items-center justify-center text-gray-300">불러오는 중…</main>
      </div>
    )
  }

  const inputCls = 'border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white w-full'

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 p-4 md:p-6 pb-32 md:pb-6 overflow-x-hidden">
        {/* 상단 바 */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <Link href="/estimates" className="text-gray-400 hover:text-gray-600 text-sm">← 목록</Link>
          <h1 className="text-lg md:text-xl font-bold text-gray-900 flex-1 truncate">{est.title}</h1>
          <button onClick={excel}
            className="px-3 py-2 text-sm rounded-lg border border-green-600 text-green-700 hover:bg-green-50">
            ⬇ 엑셀
          </button>
          <button onClick={save} disabled={saving || !dirty}
            className={`px-4 py-2 text-sm rounded-lg text-white ${dirty ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-300'}`}>
            {saving ? '저장 중…' : dirty ? '저장' : '저장됨'}
          </button>
        </div>

        <div className="grid lg:grid-cols-[1fr_320px] gap-4 items-start">
          <div className="min-w-0">
            {/* 현장 정보 */}
            <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                <div className="col-span-2">
                  <label className="text-[11px] text-gray-400">현장명</label>
                  <input className={inputCls} value={est.title} onChange={e => patch({ title: e.target.value })} />
                </div>
                <div className="col-span-2">
                  <label className="text-[11px] text-gray-400">공사명 (표지·갑지 표기)</label>
                  <input className={inputCls} value={est.work_name || ''} placeholder={`${est.title} 인테리어`}
                    onChange={e => patch({ work_name: e.target.value })} />
                </div>
                <div>
                  <label className="text-[11px] text-gray-400">수신</label>
                  <input className={inputCls} value={est.customer || ''} placeholder="대표님"
                    onChange={e => patch({ customer: e.target.value })} />
                </div>
                <div>
                  <label className="text-[11px] text-gray-400">업종</label>
                  <select className={inputCls} value={est.category || ''} onChange={e => patch({ category: e.target.value })}>
                    <option value="">선택</option>
                    {CATEGORY_LIST.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-gray-400">평수</label>
                  <input className={inputCls} inputMode="decimal" value={est.area_py ?? ''}
                    onChange={e => patch({ area_py: Number(e.target.value.replace(/[^\d.]/g, '')) || null })} />
                </div>
                <div>
                  <label className="text-[11px] text-gray-400">작성일</label>
                  <input type="date" className={inputCls} value={est.est_date}
                    onChange={e => patch({ est_date: e.target.value })} />
                </div>
                <div>
                  <label className="text-[11px] text-gray-400">상태</label>
                  <select className={inputCls} value={est.status} onChange={e => patch({ status: e.target.value })}>
                    {STATUS_LIST.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div className="col-span-2 md:col-span-3">
                  <label className="text-[11px] text-gray-400">특기사항</label>
                  <input className={inputCls} value={est.note || ''} placeholder="간판별도 등"
                    onChange={e => patch({ note: e.target.value })} />
                </div>
              </div>
            </div>

            {/* 공종별 내역 */}
            <datalist id="price-names">
              {prices.map(p => <option key={p.id} value={p.name}>{[p.spec, p.trade].filter(Boolean).join(' · ')}</option>)}
            </datalist>

            {est.sections.map((sec, si) => {
              const sub = sectionSubtotal(sec)
              const isCollapsed = collapsed[si]
              return (
                <div key={si} className="bg-white rounded-xl border border-gray-100 mb-3 overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-100">
                    <button onClick={() => setCollapsed({ ...collapsed, [si]: !isCollapsed })}
                      className="text-gray-400 w-5">{isCollapsed ? '▸' : '▾'}</button>
                    <span className="text-xs text-gray-400 w-4">{si + 1}</span>
                    <input value={sec.name} onChange={e => patchSection(si, { ...sec, name: e.target.value })}
                      className="font-semibold text-sm bg-transparent outline-none border-b border-transparent focus:border-green-400 flex-1 min-w-0" />
                    <span className="text-xs text-gray-500 whitespace-nowrap hidden sm:inline">
                      소계 <b className="text-gray-800">{fmt(sub.total)}</b>
                    </span>
                    <button onClick={() => {
                      if (si === 0) return
                      const s = [...est.sections]; [s[si - 1], s[si]] = [s[si], s[si - 1]]; patch({ sections: s })
                    }} className="text-gray-300 hover:text-gray-600 px-0.5" title="위로">↑</button>
                    <button onClick={() => {
                      if (si === est.sections.length - 1) return
                      const s = [...est.sections]; [s[si + 1], s[si]] = [s[si], s[si + 1]]; patch({ sections: s })
                    }} className="text-gray-300 hover:text-gray-600 px-0.5" title="아래로">↓</button>
                    <button onClick={() => {
                      if (!confirm(`"${sec.name}" 공종을 삭제할까요?`)) return
                      patch({ sections: est.sections.filter((_, i) => i !== si) })
                    }} className="text-gray-300 hover:text-red-500 px-0.5">✕</button>
                  </div>
                  {!isCollapsed && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs min-w-[720px]">
                        <thead>
                          <tr className="text-gray-400 border-b border-gray-50">
                            <th className="px-2 py-1.5 text-left w-[22%]">품명</th>
                            <th className="px-1 py-1.5 text-left w-[16%]">규격</th>
                            <th className="px-1 py-1.5 w-14">단위</th>
                            <th className="px-1 py-1.5 w-16 text-right">수량</th>
                            <th className="px-1 py-1.5 text-right">재료비단가</th>
                            <th className="px-1 py-1.5 text-right">노무비단가</th>
                            <th className="px-1 py-1.5 text-right">경비단가</th>
                            <th className="px-1 py-1.5 text-right w-24">금액</th>
                            <th className="w-7"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {sec.items.map((it, ii) => {
                            const a = itemAmounts(it)
                            return (
                              <tr key={ii} className="border-b border-gray-50 hover:bg-green-50/30">
                                <td className="px-1">
                                  <input list="price-names" value={it.name}
                                    onChange={e => onItemName(si, ii, e.target.value)}
                                    className="w-full px-1.5 py-1 border border-transparent hover:border-gray-200 focus:border-green-400 rounded outline-none bg-transparent" />
                                </td>
                                <td className="px-1">
                                  <input value={it.spec} onChange={e => patchItem(si, ii, { spec: e.target.value })}
                                    className="w-full px-1.5 py-1 border border-transparent hover:border-gray-200 focus:border-green-400 rounded outline-none bg-transparent" />
                                </td>
                                <td className="px-1">
                                  <select value={it.unit} onChange={e => patchItem(si, ii, { unit: e.target.value })}
                                    className="w-full py-1 bg-transparent outline-none text-center">
                                    {UNIT_LIST.map(u => <option key={u}>{u}</option>)}
                                  </select>
                                </td>
                                <td><NumInput decimal value={it.qty} onChange={n => patchItem(si, ii, { qty: n })} /></td>
                                <td><NumInput value={it.mat} onChange={n => patchItem(si, ii, { mat: n })} /></td>
                                <td><NumInput value={it.lab} onChange={n => patchItem(si, ii, { lab: n })} /></td>
                                <td><NumInput value={it.exp} onChange={n => patchItem(si, ii, { exp: n })} /></td>
                                <td className="px-1.5 text-right font-medium text-gray-700">{fmt(a.total)}</td>
                                <td>
                                  <button onClick={() => patchSection(si, { ...sec, items: sec.items.filter((_, i) => i !== ii) })}
                                    className="text-gray-200 hover:text-red-500 px-1">✕</button>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                      <div className="flex items-center justify-between px-3 py-1.5">
                        <button onClick={() => patchSection(si, { ...sec, items: [...sec.items, { ...EMPTY_ITEM }] })}
                          className="text-xs text-green-600 hover:text-green-700">+ 행 추가</button>
                        <span className="text-xs text-gray-400">
                          재 {fmt(sub.mat)} · 노 {fmt(sub.lab)} · 경 {fmt(sub.exp)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}

            {/* 공종 추가 */}
            <div className="flex gap-2 items-center bg-white rounded-xl border border-dashed border-gray-200 p-3">
              <select value={addTrade} onChange={e => setAddTrade(e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm">
                {TRADE_PRESETS.filter(t => !est.sections.some(s => s.name === t)).map(t => <option key={t}>{t}</option>)}
                <option value="__custom">직접 입력…</option>
              </select>
              <button onClick={() => {
                let name = addTrade
                if (name === '__custom') {
                  name = prompt('공종명 입력') || ''
                  if (!name) return
                }
                patch({ sections: [...est.sections, newSection(name)] })
              }} className="px-3 py-1.5 text-sm rounded-lg bg-green-600 text-white hover:bg-green-700">
                + 공종 추가
              </button>
            </div>
          </div>

          {/* 갑지 패널 */}
          <div className="bg-white rounded-xl border border-gray-100 p-4 lg:sticky lg:top-4">
            <h2 className="font-bold text-sm text-gray-800 mb-3">갑지 (자동 계산)</h2>
            <div className="space-y-1.5 text-sm">
              <Row l="재료비" v={fmt(gapji.directMat)} />
              <Row l="노무비" v={fmt(gapji.directLab)} />
              <Row l="경비" v={fmt(gapji.directExp)} />
              <Row l="직접공사비 계" v={fmt(gapji.direct)} bold />
              <hr className="border-gray-100" />
              <RateRow l="고용보험" rate={est.rates.employ} onRate={n => patch({ rates: { ...est.rates, employ: n } })} v={fmt(gapji.employ)} />
              <RateRow l="산재보험" rate={est.rates.accident} onRate={n => patch({ rates: { ...est.rates, accident: n } })} v={fmt(gapji.accident)} />
              <RateRow l="일반관리비" rate={est.rates.mgmt} onRate={n => patch({ rates: { ...est.rates, mgmt: n } })} v={fmt(gapji.mgmt)} />
              <RateRow l="이윤" rate={est.rates.profit} onRate={n => patch({ rates: { ...est.rates, profit: n } })} v={fmt(gapji.profit)} />
              <div className="flex items-center justify-between gap-2">
                <span className="text-gray-500">산업안전보건관리비</span>
                <div className="w-28"><NumInput value={est.rates.safety_amt} onChange={n => patch({ rates: { ...est.rates, safety_amt: n } })} className="border-gray-200 border" /></div>
              </div>
              <Row l="간접공사비 계" v={fmt(gapji.indirect)} bold />
              <hr className="border-gray-100" />
              <Row l="총공사비 (천단위 절사)" v={fmt(gapji.gross)} bold />
              <div className="flex items-center justify-between gap-2">
                <span className="text-gray-500">네고 (− 입력)</span>
                <div className="w-28">
                  <input value={est.nego || ''} inputMode="numeric" placeholder="0"
                    onChange={e => {
                      const t = e.target.value.replace(/[^\d-]/g, '')
                      patch({ nego: Number(t) || 0 })
                    }}
                    className="w-full px-1.5 py-1 text-right border border-gray-200 rounded outline-none focus:border-green-400" />
                </div>
              </div>
              {est.nego !== 0 && <Row l="최종 총공사비" v={fmt(gapji.grossFinal)} bold />}
              <Row l="부가세 (10%)" v={fmt(gapji.vat)} />
              <div className="flex items-center justify-between pt-2 border-t border-gray-200 mt-2">
                <span className="font-bold text-gray-900">합계</span>
                <span className="font-bold text-lg text-green-700">{fmt(gapji.grandTotal)}</span>
              </div>
              <p className="text-[11px] text-gray-400 pt-1 leading-relaxed">{toKoreanAmount(gapji.grandTotal)}</p>
              {est.area_py ? (
                <p className="text-[11px] text-gray-400">평당 {fmt(Math.round(gapji.grandTotal / est.area_py))}원 (VAT 포함, {est.area_py}평)</p>
              ) : null}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

function Row({ l, v, bold }: { l: string; v: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={bold ? 'font-semibold text-gray-800' : 'text-gray-500'}>{l}</span>
      <span className={bold ? 'font-semibold text-gray-900' : 'text-gray-700'}>{v}</span>
    </div>
  )
}

function RateRow({ l, rate, onRate, v }: { l: string; rate: number; onRate: (n: number) => void; v: string }) {
  const [text, setText] = useState(String((rate * 100).toFixed(2)))
  useEffect(() => { setText(String((rate * 100).toFixed(2))) }, [rate])
  return (
    <div className="flex items-center justify-between gap-1">
      <span className="text-gray-500 flex-1">{l}</span>
      <span className="flex items-center gap-0.5 text-xs text-gray-400">
        <input value={text}
          onChange={e => {
            const t = e.target.value.replace(/[^\d.]/g, '')
            setText(t)
            onRate((Number(t) || 0) / 100)
          }}
          className="w-12 px-1 py-0.5 text-right border border-gray-200 rounded outline-none focus:border-green-400" />%
      </span>
      <span className="text-gray-700 w-24 text-right">{v}</span>
    </div>
  )
}
