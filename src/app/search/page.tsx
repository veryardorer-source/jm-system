'use client'

import { useState } from 'react'
import Link from 'next/link'
import Sidebar from '@/components/Sidebar'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'

type Hit = { kind: string; title: string; sub?: string; href: string; icon: string }

export default function SearchPage() {
  const { profile } = useAuth()
  const canMoney = profile?.role !== 'field' && profile?.role !== 'partner'
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  async function run(e: React.FormEvent) {
    e.preventDefault()
    const term = q.replace(/[%,()]/g, ' ').trim()
    if (term.length < 1) return
    setLoading(true); setSearched(true)
    const like = `%${term}%`
    const results: Hit[] = []

    // 현장
    const { data: projects } = await supabase.from('projects').select('*')
      .or(`name.ilike.${like},client_name.ilike.${like},address.ilike.${like},manager.ilike.${like},memo.ilike.${like}`)
      .limit(20)
    ;(projects || []).forEach(p => results.push({
      kind: '현장', icon: '🏗️', title: p.name,
      sub: [p.client_name, p.address, p.manager].filter(Boolean).join(' · '),
      href: `/projects/${p.id}`,
    }))

    // 현장 자료 (파일명/메모)
    const { data: files } = await supabase.from('project_files').select('*')
      .or(`file_name.ilike.${like},memo.ilike.${like}`).limit(20)
    ;(files || []).forEach(f => results.push({
      kind: '현장 자료', icon: '📎', title: f.file_name,
      sub: [f.category, f.memo].filter(Boolean).join(' · '),
      href: `/projects/${f.project_id}`,
    }))

    // 공지
    const { data: notices } = await supabase.from('notices').select('*')
      .or(`title.ilike.${like},content.ilike.${like}`).limit(15)
    ;(notices || []).forEach(n => results.push({
      kind: '공지', icon: '📢', title: n.title, sub: n.category, href: '/notices',
    }))

    // 작업일지
    const { data: logs } = await supabase.from('work_logs').select('*')
      .or(`today_work.ilike.${like},tomorrow_work.ilike.${like},special_notes.ilike.${like},memo.ilike.${like},author.ilike.${like}`)
      .limit(15)
    ;(logs || []).forEach(l => results.push({
      kind: '작업일지', icon: '📒', title: `${l.log_date} · ${l.author || ''}`,
      sub: (l.today_work || l.special_notes || l.memo || '').slice(0, 40), href: '/worklogs',
    }))

    // 거래처
    const { data: contacts } = await supabase.from('contacts').select('*')
      .or(`company.ilike.${like},person.ilike.${like},phone.ilike.${like},category.ilike.${like},memo.ilike.${like}`).limit(15)
    ;(contacts || []).forEach(c => results.push({
      kind: '거래처', icon: '📇', title: `${c.company}${c.person ? ` · ${c.person}` : ''}`,
      sub: [c.category, c.phone].filter(Boolean).join(' · '), href: '/contacts',
    }))

    // 금전 자료 (금액 볼 수 있는 사람만)
    if (canMoney) {
      const { data: receipts } = await supabase.from('receipts').select('*').or(`memo.ilike.${like},uploaded_by.ilike.${like}`).limit(15)
      ;(receipts || []).forEach(r => results.push({ kind: '영수증', icon: '🧾', title: r.memo || '영수증', sub: r.uploaded_by, href: '/receipts' }))

      const { data: wd } = await supabase.from('withdrawal_requests').select('*').or(`reason.ilike.${like},requested_by.ilike.${like}`).limit(15)
      ;(wd || []).forEach(w => results.push({ kind: '출금요청', icon: '💸', title: (w.reason || '출금요청').slice(0, 40), sub: w.requested_by, href: '/withdrawals' }))

      const { data: pays } = await supabase.from('payments').select('*').or(`project_name.ilike.${like},note.ilike.${like}`).limit(15)
      ;(pays || []).forEach(p => results.push({ kind: '수금', icon: '💰', title: `${p.project_name} · ${p.type}`, sub: `${Number(p.amount).toLocaleString()}원`, href: '/payments' }))
    }

    setHits(results)
    setLoading(false)
  }

  // 종류별로 묶기
  const byKind = hits.reduce((acc, h) => { (acc[h.kind] = acc[h.kind] || []).push(h); return acc }, {} as Record<string, Hit[]>)

  if (profile?.role === 'partner') return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <Sidebar />
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">접근 권한이 없습니다.</div>
    </div>
  )

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <header className="bg-white border-b border-gray-200 px-4 md:px-8 py-4 md:py-5 flex-shrink-0">
          <h1 className="text-xl font-bold text-gray-900">통합 검색</h1>
          <p className="text-sm text-gray-500 mt-0.5">현장·자료·공지·작업일지{canMoney ? '·영수증·출금·수금' : ''}을 한 번에 찾기</p>
        </header>

        <div className="flex-1 overflow-auto px-4 md:px-8 py-4 md:py-6 pb-20 md:pb-6">
          <form onSubmit={run} className="max-w-2xl flex gap-2 mb-5">
            <input value={q} onChange={e => setQ(e.target.value)} autoFocus
              placeholder="현장명·고객명·주소·파일명·메모 등 검색"
              className="flex-1 border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            <button type="submit" className="bg-green-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-green-700">검색</button>
          </form>

          {loading ? (
            <div className="text-center py-16 text-gray-400">검색 중...</div>
          ) : !searched ? (
            <div className="text-center py-16 text-gray-400 text-sm">검색어를 입력하세요. 여러 항목을 한 번에 찾아줍니다.</div>
          ) : hits.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 text-center py-16 text-gray-400">
              <p className="text-3xl mb-2">🔍</p><p>&quot;{q}&quot; 검색 결과가 없어요</p>
            </div>
          ) : (
            <div className="max-w-2xl flex flex-col gap-5">
              <p className="text-sm text-gray-500">총 {hits.length}건</p>
              {Object.entries(byKind).map(([kind, list]) => (
                <div key={kind}>
                  <p className="text-xs font-semibold text-gray-400 mb-2">{kind} ({list.length})</p>
                  <div className="flex flex-col gap-2">
                    {list.map((h, i) => (
                      <Link key={i} href={h.href}
                        className="bg-white rounded-xl border border-gray-200 px-4 py-3 hover:border-green-400 hover:shadow-sm transition-all flex items-center gap-3">
                        <span className="text-lg flex-shrink-0">{h.icon}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900 truncate">{h.title}</p>
                          {h.sub && <p className="text-xs text-gray-400 truncate">{h.sub}</p>}
                        </div>
                        <span className="text-gray-300 text-sm flex-shrink-0">→</span>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
