// 월 급여대장을 경영관리(급여내역 요약 + 급여대장 원본 표)에 저장 — 엑셀 업로드와 시스템 생성이 같은 길로 저장
import type { SupabaseClient } from '@supabase/supabase-js'
import type { PayrollLedger, PayrollLedgerFull } from './excel-parse'

/** 성공 시 null, 실패 시 사용자에게 보여줄 오류 문구. warn은 요약은 저장됐지만 원본 표 저장이 실패한 경우 */
export async function storeMonthlyLedger(
  sb: SupabaseClient, data: PayrollLedger, full: PayrollLedgerFull | null,
): Promise<{ error: string | null; warn: string | null }> {
  const monthKey = data.month + '-01'
  // 같은 달 기존 것 전부 삭제 후 교체 — 삭제 실패 시 중단(중복 방지)
  // 끝은 '다음 달 1일 미만' — '-31' 고정이면 30일까지인 달(9월 등)에 없는 날짜라 DB가 거부함
  const [y, m] = data.month.split('-').map(Number)
  const nextMonthKey = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
  const { error: delErr } = await sb.from('finance_payroll').delete()
    .gte('month', monthKey).lt('month', nextMonthKey)
  if (delErr) return { error: '기존 자료 삭제 실패(중복 방지를 위해 중단): ' + delErr.message, warn: null }
  const { error } = await sb.from('finance_payroll').insert(
    data.rows.map(r => ({
      month: monthKey,
      employee_name: r.name,
      amount: r.gross,
      memo: `실지급 ${r.net.toLocaleString()}원${r.base ? ` · 기본급 ${r.base.toLocaleString()}` : ''}`,
    }))
  )
  if (error) return { error: '저장 실패: ' + error.message, warn: null }
  // 전체 시트(수당·공제 항목 포함) 저장 — '급여대장' 보기에서 사용
  if (full) {
    let { error: le } = await sb.from('finance_payroll_ledger').upsert({
      month: data.month, kind: '급여', headers: full.headers, rows: full.rows, total: full.total, updated_at: new Date().toISOString(),
    }, { onConflict: 'month,kind' })
    // 종류 컬럼 SQL(db/bonus_ledger.sql)을 아직 안 돌린 경우 기존 방식으로 재시도
    if (le && /kind|column|constraint|conflict/i.test(le.message)) {
      ;({ error: le } = await sb.from('finance_payroll_ledger').upsert({
        month: data.month, headers: full.headers, rows: full.rows, total: full.total, updated_at: new Date().toISOString(),
      }, { onConflict: 'month' }))
    }
    if (le) return { error: null, warn: '요약은 저장됐지만 전체 시트 저장에 실패했어요.\n(관리자에게: db/payroll_ledger.sql 실행 필요)\n' + le.message }
  }
  return { error: null, warn: null }
}
