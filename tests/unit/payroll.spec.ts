import { test, expect } from '@playwright/test'
import { calcPay, type PayInput } from '../../src/lib/payroll'
import { buildSlip } from '../../src/lib/payslip'

const input: PayInput = {
  work_type: '본사', monthly_pay: 3_000_000, meal: 200_000, car: 0,
  position_allowance: 0, dependents: 1, employment_insurance: true, age: 35,
  pay_rate: 1, rate_days: null, days_worked: null, month_days: 30,
  extra_ot_hours: 0, night_hours: 0, holiday_hours: 0, small_business: true,
  bonus: 0, special_allowance: 0,
  health_ins: 100_000, care_ins: 12_000, pension: 150_000,
  health_adj: 0, care_adj: 0, attendance_deduction: 0,
}

test('특별수당은 기본급을 줄이지 않고 이번 달 과세 급여에 별도 합산된다', () => {
  const before = calcPay(input, 2026)
  const after = calcPay({ ...input, special_allowance: 200_000 }, 2026)
  expect(after.specialAllowance).toBe(200_000)
  expect(after.base).toBe(before.base)
  expect(after.gross).toBe(before.gross + 200_000)
  expect(after.taxable).toBe(before.taxable + 200_000)
  expect(after.empIns).toBeGreaterThan(before.empIns)
  const slip = buildSlip({ month: '2026-11', name: '테스트', hireDate: null, input: { ...input, special_allowance: 200_000 }, r: after })
  expect(slip.irregular).toContainEqual({ label: '특별수당', amount: 200_000 })
  expect(slip.grossTotal).toBe(after.gross)
  expect(calcPay({ ...input, special_allowance: -200_000 }, 2026).specialAllowance).toBe(0)
})

test('현장2는 포괄연장 41.3시간을 1배로 계산하고 현장은 1.5배를 유지한다', () => {
  const field = calcPay({ ...input, work_type: '현장', monthly_pay: 4_000_000 }, 2026)
  const field2 = calcPay({ ...input, work_type: '현장2', monthly_pay: 4_000_000 }, 2026)
  expect(field.totalHours).toBeCloseTo(270.95)
  expect(field2.totalHours).toBeCloseTo(250.3)
  expect(field.otRate).toBe(1.5)
  expect(field2.otRate).toBe(1)
  expect(field2.ot).toBe(Math.round(4_000_000 / 250.3 * 41.3))
  expect(field2.gross).toBe(4_000_000)
  expect(field2.base + field2.meal + field2.car + field2.ot + field2.position).toBe(4_000_000)
  const withExtra = calcPay({ ...input, work_type: '현장2', monthly_pay: 4_000_000, extra_ot_hours: 10 }, 2026)
  expect(withExtra.extraOt).toBe(Math.round(4_000_000 / 250.3 * 10))
  const slip = buildSlip({ month: '2026-11', name: '테스트', hireDate: null, input: { ...input, work_type: '현장2', monthly_pay: 4_000_000 }, r: field2 })
  expect(slip.methods.find(m => m.label === '연장수당')?.how).toBe('통상시급 x 41.3시간 x 1')
  expect(calcPay({ ...input, work_type: '없는구분' }, 2026).warnings.join()).toContain('근무구분')
})
