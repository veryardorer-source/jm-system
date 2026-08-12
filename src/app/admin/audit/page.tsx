'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase-browser'

type AuditRow = {
  id: number
  at: string
  user_name: string | null
  table_name: string
  action: string
  row_id: string | null
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
}

const TABLE_KO: Record<string, string> = {
  profiles: '회원(권한)', employees: '직원정보', employee_salaries: '직원 급여', employee_attendance: '직원 근태',
  finance_payroll: '급여내역', finance_payroll_ledger: '급여대장', project_costs: '현장 비용',
  withdrawal_requests: '출금 요청', payments: '수금', company_documents: '회사 서류',
  project_files: '현장 자료', project_access: '현장 접근권한',
}
const ACTION_KO: Record<string, string> = { INSERT: '등록', UPDATE: '수정', DELETE: '삭제' }
const ACTION_COLOR: Record<string, string> = {
  INSERT: 'bg-green-100 text-green-700', UPDATE: 'bg-blue-100 text-blue-700', DELETE: 'bg-red-100 text-red-700',
}

// UPDATE에서 실제로 바뀐 항목만 "항목: 이전 → 이후"로 요약
function diffSummary(r: AuditRow): string {
  if (r.action === 'UPDATE' && r.old_data && r.new_data) {
    const parts: string[] = []
    for (const k of Object.keys(r.new_data)) {
      const ov = JSON.stringify(r.old_data[k] ?? null)
      const nv = JSON.stringify(r.new_data[k] ?? null)
      if (ov !== nv && k !== 'updated_at') parts.push(`${k}: ${ov} → ${nv}`)
    }
    return parts.slice(0, 6).join(' · ') || '(변경 없음)'
  }
  const d = r.new_data || r.old_data
  if (!d) return ''
  const label = (d.name || d.file_name || d.title || d.reason || d.memo || d.project_name || d.month || '') as string
  return String(label).slice(0, 60)
}

export default function AdminAuditPage() {
  const router = useRouter()
  const { profile: myProfile, loading: authLoading } = useAuth()
  const [rows, setRows] = useState<AuditRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openId, setOpenId] = useState<number | null>(null)

  useEffect(() => {
    if (!authLoading) {
      if (!myProfile || myProfile.role !== 'admin') { router.push('/'); return }
      let on = true
      Promise.resolve().then(async () => {
        const supabase = createClient()
        const { data, error: err } = await supabase.from('audit_logs')
          .select('*').order('at', { ascending: false }).limit(300)
        if (!on) return
        if (err) setError(/relation|exist/i.test(err.message) ? 'db/audit_logs.sql을 아직 실행하지 않았어요.' : err.message)
        setRows((data || []) as AuditRow[])
        setLoading(false)
      })
      return () => { on = false }
    }
  }, [authLoading, myProfile, router])

  const fmt = (iso: string) => new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  if (authLoading || loading) return (
    <div className="flex h-screen"><Sidebar /><div className="flex-1 flex items-center justify-center text-gray-400">불러오는 중...</div></div>
  )

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <header className="bg-white border-b border-gray-200 px-4 md:px-8 py-4 md:py-5">
          <h1 className="text-xl font-bold text-gray-900">감사 기록</h1>
          <p className="text-sm text-gray-500 mt-0.5">민감 데이터의 변경 내역 — 누가·언제·무엇을 (자동 기록, 수정·삭제 불가)</p>
        </header>
        <div className="flex-1 overflow-auto px-4 md:px-8 py-6 pb-20 md:pb-24">
          {error ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">⚠️ {error}</div>
          ) : rows.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 text-center py-16 text-gray-400">
              <p className="text-3xl mb-2">📋</p><p>아직 기록이 없어요 — 민감 데이터가 변경되면 자동으로 쌓여요</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden max-w-5xl">
              {rows.map((r, i) => (
                <div key={r.id} className={`px-4 py-3 ${i > 0 ? 'border-t border-gray-100' : ''}`}>
                  <button onClick={() => setOpenId(openId === r.id ? null : r.id)} className="w-full text-left">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-gray-400 w-24 flex-shrink-0">{fmt(r.at)}</span>
                      <span className="text-sm font-medium text-gray-800">{r.user_name || '?'}</span>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${ACTION_COLOR[r.action] || 'bg-gray-100 text-gray-600'}`}>
                        {TABLE_KO[r.table_name] || r.table_name} {ACTION_KO[r.action] || r.action}
                      </span>
                      <span className="text-xs text-gray-500 truncate flex-1 min-w-0">{diffSummary(r)}</span>
                    </div>
                  </button>
                  {openId === r.id && (
                    <pre className="mt-2 text-[11px] bg-gray-50 border border-gray-200 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all">
                      {r.old_data ? '이전: ' + JSON.stringify(r.old_data, null, 1) + '\n' : ''}
                      {r.new_data ? '이후: ' + JSON.stringify(r.new_data, null, 1) : ''}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
