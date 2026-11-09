// 직원 재직 여부 — 퇴사일이 지났으면 '재직중' 표시가 켜져 있어도 퇴사로 본다.
// 퇴사일은 마지막 근무일(예: 10/31까지 근무 → 2026-10-31)이므로 그 다음 날부터 퇴사.
type EmployeeLike = { is_active: boolean; resign_date?: string | null }

/** 오늘(한국 시간) YYYY-MM-DD */
export function todayKst(now: Date = new Date()): string {
  return new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10)
}

/** 퇴사일이 오늘보다 앞이면 true */
export function resignPassed(e: EmployeeLike, today: string = todayKst()): boolean {
  const d = (e.resign_date || '').slice(0, 10)
  return !!d && d < today
}

/** 지금 재직 중인지: 수동 '퇴사' 처리했거나 퇴사일이 지났으면 false */
export function isEmployed(e: EmployeeLike, today: string = todayKst()): boolean {
  return !!e.is_active && !resignPassed(e, today)
}

/** 목록을 불러온 뒤 is_active를 실제 재직 여부로 맞춘다(다른 화면 호환용) */
export function withEffectiveActive<T extends EmployeeLike>(list: T[], today: string = todayKst()): T[] {
  return list.map(e => ({ ...e, is_active: isEmployed(e, today) }))
}
