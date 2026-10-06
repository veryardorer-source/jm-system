// 급여 계산 — 노무사가 만든 회사 급여대장 엑셀(급여셋팅·포괄 급여계산·급여대장 시트)의 수식을 그대로 옮김.
// 화면·엑셀·임금명세서가 모두 이 함수 하나로 계산해야 금액이 어긋나지 않는다.
import { INCOME_TAX_TABLE } from './income-tax-table'

export const COMPANY = {
  name: '제이엠건축인테리어 주식회사',
  bizNo: '168-86-03200',
  address: '경상남도 창원시 의창구 평산로 135번길 4, 2층',
  ceo: '이소연',
  payDay: '매월 5일',
}

/** 월 기본(소정)근로시간 — 주 40시간 기준 (8×6×365/12/7 올림 = 209) */
export const BASE_HOURS = 209
/** 고용보험 근로자 부담률 (노무사 양식 '26.07월 개정 분 반영') */
export const EMPLOYMENT_INS_RATE = 0.009
/** 상시근로자 5인 미만 사업장 여부 (대표 확인 2026-10-06).
 *  5인 미만은 연장·야간·휴일 가산(50%) 의무가 없어 '추가근무'는 1배로 지급.
 *  단, 노무사 양식의 포괄연장(현장 41.3h)은 계약대로 1.5배 유지 — 5인 이상 대비해 노무사가 설계.
 *  5인 이상이 되면 false로 바꾸면 새로 만드는 달부터 1.5배 (지난 달 대장은 저장된 값 유지). */
export const SMALL_BUSINESS = true
/** 추가근무 가산 배율 */
export const extraOtMultiplier = (small: boolean) => (small ? 1 : 1.5)

/** 연도별 최저시급 — 매년 1월 갱신 */
export const MIN_WAGE: Record<number, number> = { 2025: 10030, 2026: 10320 }

/** 근무구분 — '급여셋팅' 시트. inclusiveOt = 월 포괄연장시간(가산 전) */
export const WORK_TYPES = {
  '본사':        { time: '09:00~18:00', rest: '12:00~13:00',             days: '월~금', off: '매주 토·일',      inclusiveOt: 0 },
  '현장':        { time: '07:00~19:00', rest: '12:00~13:00, 15:00~16:00', days: '월~금', off: '격주 토, 매주 일', inclusiveOt: 41.3 },
  '본사(계약직)': { time: '09:00~19:00', rest: '12:00~13:00',             days: '월~금', off: '매주 토·일',      inclusiveOt: 0 },
  '현장(계약직)': { time: '09:00~18:00', rest: '12:00~13:00',             days: '월~금', off: '매주 토·일',      inclusiveOt: 0 },
} as const
export type WorkType = keyof typeof WORK_TYPES
/** 직군 — 노무사 자료 첫 페이지(급여셋팅) 기준: 본사 = 사무직, 현장 = 현장직 (계약직 포함) */
export const JOB_GROUPS = ['사무직', '현장직'] as const
export const jobGroup = (workType: string) => (workType.startsWith('현장') ? '현장직' : '사무직')
export const WORK_TYPE_LIST = Object.keys(WORK_TYPES) as WorkType[]

/** 한 직원의 한 달 급여 입력값 (DB payroll_items 한 줄) */
export type PayInput = {
  work_type: string
  monthly_pay: number          // 월지급액(세전, 연봉÷12) — 식대·차량·연장·직책수당 포함 총액
  meal: number                 // 식대(비과세)
  car: number                  // 차량유지비(비과세)
  position_allowance: number   // 직책수당
  dependents: number           // 공제대상가족 수(본인 포함) — 소득세 계산용
  employment_insurance: boolean // 고용보험 가입(대표·임원은 미가입)
  age: number | null           // 만 나이 — 65세 이상은 고용보험 0
  pay_rate: number             // 지급률 (수습 0.9 등, 기본 1)
  rate_days: number | null     // 지급률을 적용할 일수 (수습이 달 중간에 끝날 때 그 날까지 일수). 비우면 근무한 날 전부
  days_worked: number | null   // 중도 입사·퇴사 시 그 달 근무 일수(달력 기준, 퇴사일=마지막 근무일 포함). 비우면 한 달 전부
  month_days: number           // 그 달의 날 수
  extra_ot_hours: number       // 포괄 외 연장 추가시간
  night_hours: number          // 야간 근무시간 (추가근무 기록)
  holiday_hours: number        // 휴일 근무시간 (추가근무 기록)
  small_business: boolean      // 5인 미만 → 추가근무 가산 없음(1배)
  bonus: number                // 상여금(과세)
  health_ins: number           // 건강보험 (공단 고지액)
  care_ins: number             // 장기요양 (공단 고지액)
  pension: number              // 국민연금 (공단 고지액)
  health_adj: number           // 건강보험 정산 (환급은 음수)
  care_adj: number             // 장기요양 정산
  attendance_deduction: number // 근태 공제 (지각·결근 등 — 직접 입력)
}

export type PayResult = {
  totalHours: number   // 통상시급 기준시간 (209 + 포괄연장×1.5)
  hourly: number       // 통상시급
  ratio: number        // 실제 적용 비율 = (지급률 적용일×지급률 + 나머지 근무일) / 그 달 날수
  base: number         // 기본급
  meal: number
  car: number
  ot: number           // 연장근로(포괄)
  extraOt: number      // 추가근무수당 (연장·야간·휴일, 포괄 외)
  extraHours: number   // 추가근무 시간 합계
  position: number     // 직책수당
  bonus: number
  gross: number        // 급여 합계 = 지급총액
  taxable: number      // 과세 합계 (식대·차량 제외)
  health: number
  care: number
  pension: number
  empIns: number
  incomeTax: number
  localTax: number
  attendance: number
  healthAdj: number
  careAdj: number
  deductions: number   // 공제 합계
  net: number          // 차감지급액(실수령액)
  warnings: string[]
}

// 10원 미만 절사(엑셀 ROUNDDOWN(x,-1)). 880000×0.009 = 7919.9999… 같은 소수 오차를 먼저 정리해야 엑셀과 같아짐
const floor10 = (n: number) => Math.floor(Math.round(n * 1e6) / 1e7) * 10
const won = (n: number) => Math.round(n)

/** 간이세액표 소득세 (월 과세급여, 공제대상가족 수). 엑셀: INDEX(간이세액표, MATCH(과세/1000, 하한, 1), 가족수) */
export function incomeTax(taxable: number, dependents: number): number {
  const fam = Math.min(Math.max(Math.round(dependents) || 1, 1), 11)
  const k = taxable / 1000
  const top = INCOME_TAX_TABLE[INCOME_TAX_TABLE.length - 1] // 10,000천원
  if (k <= top[0]) {
    // 하한 ≤ k 인 마지막 구간 (이진 탐색)
    let lo = 0, hi = INCOME_TAX_TABLE.length - 1, at = -1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (INCOME_TAX_TABLE[mid][0] <= k) { at = mid; lo = mid + 1 } else hi = mid - 1
    }
    return at < 0 ? 0 : INCOME_TAX_TABLE[at][fam]
  }
  // 1천만원 초과 — 간이세액표 하단 산식
  const t10 = top[fam]
  const x = taxable
  let tax: number
  if (x <= 14_000_000) tax = t10 + (x - 10_000_000) * 0.98 * 0.35 + 25_000
  else if (x <= 28_000_000) tax = t10 + 1_397_000 + (x - 14_000_000) * 0.98 * 0.38
  else if (x <= 30_000_000) tax = t10 + 6_610_600 + (x - 28_000_000) * 0.98 * 0.40
  else if (x <= 45_000_000) tax = t10 + 7_394_600 + (x - 30_000_000) * 0.40
  else if (x <= 87_000_000) tax = t10 + 13_394_600 + (x - 45_000_000) * 0.42
  else tax = t10 + 31_034_600 + (x - 87_000_000) * 0.45
  return floor10(tax)
}

export function calcPay(p: PayInput, year = new Date().getFullYear()): PayResult {
  const warnings: string[] = []
  const wt = WORK_TYPES[p.work_type as WorkType] ?? WORK_TYPES['본사']
  const inclusiveOt = wt.inclusiveOt
  const totalHours = BASE_HOURS + inclusiveOt * 1.5
  const hourly = p.monthly_pay / totalHours

  // 일할: 퇴사 9/11이면 11/30. 수습이 달 중간에 끝나면 그 날까지만 지급률(90%), 다음 날부터 100%
  const days = p.days_worked !== null && p.days_worked >= 0 ? Math.min(p.days_worked, p.month_days) : p.month_days
  const rateDays = p.rate_days !== null && p.rate_days >= 0 ? Math.min(p.rate_days, days) : days
  const ratio = (rateDays * (p.pay_rate ?? 1) + (days - rateDays)) / p.month_days

  // 각 항목에 같은 비율을 곱하고, 기본급은 '월지급액 − 나머지'로 맞춰 합계가 1원도 어긋나지 않게
  const scaledTotal = won(p.monthly_pay * ratio)
  const meal = won(p.meal * ratio)
  const car = won(p.car * ratio)
  const position = won(p.position_allowance * ratio)
  const ot = won(hourly * inclusiveOt * 1.5 * ratio)
  const base = scaledTotal - meal - car - position - ot
  // 추가근무(포괄 외 연장·야간·휴일) — 엑셀 '추가연장근로' = 통상시급 × 시간 × 배율. 5인 미만은 1배
  const extraHours = (p.extra_ot_hours || 0) + (p.night_hours || 0) + (p.holiday_hours || 0)
  const extraOt = won(hourly * extraHours * extraOtMultiplier(p.small_business))
  const bonus = won(p.bonus || 0)

  const gross = base + meal + car + ot + extraOt + position + bonus
  const taxable = base + ot + extraOt + position + bonus

  const empIns = p.employment_insurance && !(p.age !== null && p.age >= 65) ? floor10(taxable * EMPLOYMENT_INS_RATE) : 0
  const tax = incomeTax(taxable, p.dependents)
  const localTax = floor10(tax * 0.1)

  const health = won(p.health_ins || 0)
  const care = won(p.care_ins || 0)
  const pension = won(p.pension || 0)
  const healthAdj = won(p.health_adj || 0)
  const careAdj = won(p.care_adj || 0)
  const attendance = won(p.attendance_deduction || 0)
  const deductions = health + care + pension + empIns + tax + localTax + attendance + healthAdj + careAdj

  if (base < 0) warnings.push('기본급이 마이너스예요 — 월지급액보다 수당 합계가 커요')
  // 최저임금 확인 (엑셀 '최저임금 여부 확인': 기본급+식대+차량 ≥ 최저시급×209) — 한 달 전체 기준으로 비교
  const minWage = MIN_WAGE[year] ?? MIN_WAGE[Math.max(...Object.keys(MIN_WAGE).map(Number))]
  if (ratio > 0) {
    const fullMonthMin = (base + meal + car) / ratio
    if (fullMonthMin < minWage * BASE_HOURS - 1) warnings.push(`최저임금 미달 가능 (${year}년 최저 월 ${(minWage * BASE_HOURS).toLocaleString()}원)`)
  }

  return {
    totalHours, hourly, ratio, base, meal, car, ot, extraOt, extraHours, position, bonus, gross, taxable,
    health, care, pension, empIns, incomeTax: tax, localTax, attendance, healthAdj, careAdj,
    deductions, net: gross - deductions, warnings,
  }
}

/** 주민등록번호 앞 7자리로 생년월일 (YYYY-MM-DD) — 형식이 아니면 null */
export function birthFromRrn(rrn: string | null | undefined): string | null {
  const s = String(rrn || '').replace(/[^0-9]/g, '')
  if (s.length < 7) return null
  const g = s[6]
  const century = '1256'.includes(g) ? 1900 : '3478'.includes(g) ? 2000 : '90'.includes(g) ? 1800 : null
  if (!century) return null
  const y = century + Number(s.slice(0, 2)), m = Number(s.slice(2, 4)), d = Number(s.slice(4, 6))
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** 기준일 시점 만 나이 */
export function ageAt(birth: string | null, on: Date): number | null {
  if (!birth) return null
  const [y, m, d] = birth.split('-').map(Number)
  let age = on.getFullYear() - y
  if (on.getMonth() + 1 < m || (on.getMonth() + 1 === m && on.getDate() < d)) age--
  return age
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

/** 그 달의 수습 적용: 'none'(수습 아님) / 'all'(근무한 날 전부 수습) / 숫자(그 달 수습 일수 — 달 중간에 끝남) */
export function probationIn(month: string, hire: string | null, resign: string | null, probationEnd: string | null): 'none' | 'all' | number {
  const total = daysInMonth(month)
  const first = `${month}-01`, last = `${month}-${String(total).padStart(2, '0')}`
  if (!probationEnd || probationEnd < first) return 'none'
  const start = hire && hire > first && hire <= last ? Number(hire.slice(8, 10)) : 1
  const end = resign && resign >= first && resign < last ? Number(resign.slice(8, 10)) : total
  if (probationEnd >= `${month}-${String(end).padStart(2, '0')}`) return 'all'
  const pEnd = Number(probationEnd.slice(8, 10))
  return pEnd < start ? 'none' : pEnd - start + 1
}

/** 입사일·퇴사일로 그 달 근무 일수 (달력 기준, 한 달 전부면 null). 퇴사일은 마지막 근무일로 봄 */
export function daysWorkedIn(month: string, hire: string | null, resign: string | null): number | null {
  const total = daysInMonth(month)
  const first = `${month}-01`, last = `${month}-${String(total).padStart(2, '0')}`
  let from = 1, to = total
  if (hire && hire > first && hire <= last) from = Number(hire.slice(8, 10))
  if (resign && resign >= first && resign < last) to = Number(resign.slice(8, 10))
  if (from === 1 && to === total) return null
  return Math.max(0, to - from + 1)
}
