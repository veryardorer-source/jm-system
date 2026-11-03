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
