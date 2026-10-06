import { test, expect } from '@playwright/test'
import { login, adminClient, loginApi } from './helpers'
import { calcPay, incomeTax, daysWorkedIn, daysInMonth, probationIn, birthFromRrn, ageAt, PayInput } from '../../src/lib/payroll'

// ⑭ 급여대장 — 노무사 양식 계산식 + 관리자 전용 화면
// 화면 테스트는 실제 달과 겹치지 않게 2030-01을 쓰고 끝나면 지움
const TEST_MONTH = '2030-01'

const base: PayInput = {
  work_type: '본사', monthly_pay: 0, meal: 0, car: 0, position_allowance: 0, dependents: 1,
  employment_insurance: true, age: 30, pay_rate: 1, rate_days: null, days_worked: null, month_days: 30,
  extra_ot_hours: 0, bonus: 0, health_ins: 0, care_ins: 0, pension: 0, health_adj: 0, care_adj: 0, attendance_deduction: 0,
}

test.describe('급여 계산식', () => {
  test('간이세액표: 구간 하한 이하 0원, 표 값 그대로, 1천만원 초과는 산식', () => {
    expect(incomeTax(700_000, 1)).toBe(0)
    expect(incomeTax(9_000_000, 1)).toBe(1_191_180)
    expect(incomeTax(9_010_000, 1)).toBe(1_191_180) // 같은 구간(9,000~9,020천원)
    expect(incomeTax(10_000_000, 2)).toBe(1_431_570)
    // 1,200만원: 1천만원 세액 + 200만원×98%×35% + 25,000
    expect(incomeTax(12_000_000, 1)).toBe(Math.floor((1_507_400 + 2_000_000 * 0.98 * 0.35 + 25_000) / 10) * 10)
  })

  test('현장 포괄: 기본급+연장근로 = 월지급액, 통상시급은 270.95시간 기준', () => {
    const r = calcPay({ ...base, work_type: '현장', monthly_pay: 3_000_000, meal: 200_000 }, 2026)
    expect(r.totalHours).toBeCloseTo(270.95)
    expect(r.ot).toBe(Math.round(3_000_000 / 270.95 * 41.3 * 1.5))
    expect(r.base + r.meal + r.ot).toBe(3_000_000)
    expect(r.taxable).toBe(2_800_000)
    expect(r.empIns).toBe(25_200)
    expect(r.localTax).toBe(Math.floor(r.incomeTax * 0.1 / 10) * 10)
    expect(r.net).toBe(r.gross - r.deductions)
  })

  test('일할·수습·고용보험 절사 — 엑셀과 같은 끝자리', () => {
    // 2,700,000(식대 300,000) 중 11/30일: 기본급 880,000 → 고용보험 7,920 (소수 오차로 7,910 되면 안 됨)
    const r = calcPay({ ...base, monthly_pay: 2_700_000, meal: 300_000, days_worked: 11 }, 2026)
    expect(r.base).toBe(880_000)
    expect(r.meal).toBe(110_000)
    expect(r.empIns).toBe(7_920)
    const p = calcPay({ ...base, monthly_pay: 3_500_000, meal: 200_000, pay_rate: 0.9 }, 2026)
    expect(p.gross).toBe(3_150_000)
    expect(p.meal).toBe(180_000)
  })

  test('수습이 달 중간에 끝나면 그 날까지만 90%, 퇴사월 일할과 함께', () => {
    // 11월(30일): 입사 8/24 → 수습 11/23까지 = 23일 90% + 7일 100%
    expect(probationIn('2026-11', '2026-08-24', null, '2026-11-23')).toBe(23)
    expect(probationIn('2026-11', '2026-09-01', null, '2026-11-30')).toBe('all')
    expect(probationIn('2026-12', '2026-09-01', null, '2026-11-30')).toBe('none')
    expect(probationIn('2026-09', '2026-09-15', null, '2026-12-14')).toBe('all')
    expect(probationIn('2026-09', '2026-09-01', '2026-09-11', '2026-11-30')).toBe('all') // 수습 중 퇴사
    const r = calcPay({ ...base, monthly_pay: 3_000_000, pay_rate: 0.9, rate_days: 23 }, 2026)
    expect(r.gross).toBe(Math.round(3_000_000 * (23 * 0.9 + 7) / 30)) // 2,770,000
    // 수습 중 9/11 퇴사: 11일 × 90%
    const q = calcPay({ ...base, monthly_pay: 3_000_000, pay_rate: 0.9, days_worked: 11 }, 2026)
    expect(q.gross).toBe(990_000)
  })

  test('일할은 그 달의 실제 일수로 나눔 (30일 고정 아님)', () => {
    expect(daysInMonth('2026-09')).toBe(30)
    expect(daysInMonth('2026-10')).toBe(31)
    expect(daysInMonth('2027-02')).toBe(28)
    expect(daysInMonth('2028-02')).toBe(29)
    // 10월 11일 퇴사: 3,100,000 × 11/31
    expect(calcPay({ ...base, monthly_pay: 3_100_000, days_worked: 11, month_days: 31 }, 2026).gross).toBe(1_100_000)
    expect(daysWorkedIn('2027-02', '2027-02-15', null)).toBe(14)
  })

  test('고용보험 미가입·65세 이상은 0원, 추가연장·근태공제 반영', () => {
    expect(calcPay({ ...base, monthly_pay: 3_000_000, employment_insurance: false }, 2026).empIns).toBe(0)
    expect(calcPay({ ...base, monthly_pay: 3_000_000, age: 65 }, 2026).empIns).toBe(0)
    const r = calcPay({ ...base, monthly_pay: 2_090_000 * 1.5, extra_ot_hours: 2, attendance_deduction: 50_000 }, 2026)
    expect(r.extraOt).toBe(Math.round(15_000 * 2 * 1.5)) // 통상시급 15,000
    expect(r.attendance).toBe(50_000)
  })

  test('최저임금 미달 경고', () => {
    expect(calcPay({ ...base, monthly_pay: 2_000_000 }, 2026).warnings.join()).toContain('최저임금')
    expect(calcPay({ ...base, monthly_pay: 2_200_000 }, 2026).warnings).toHaveLength(0)
  })

  test('입·퇴사 근무일수, 주민번호 생년월일·만 나이', () => {
    expect(daysWorkedIn('2026-09', '2026-08-24', null)).toBeNull()
    expect(daysWorkedIn('2026-09', '2026-09-01', '2026-09-11')).toBe(11)
    expect(daysWorkedIn('2026-09', '2026-09-21', null)).toBe(10)
    expect(daysWorkedIn('2026-09', null, '2026-09-30')).toBeNull()
    expect(birthFromRrn('900101-1234567')).toBe('1990-01-01')
    expect(birthFromRrn('0503154')).toBe('2005-03-15')
    expect(ageAt('1990-10-10', new Date(2026, 8, 30))).toBe(35)
  })
})

test.describe('급여대장 화면', () => {
  test.beforeEach(async ({ page }) => { page.on('dialog', d => d.accept()) })

  test('field는 메뉴가 없고 주소로 들어와도 대시보드로 돌려보냄', async ({ page }) => {
    await login(page, 'e2e-field@jmtest.local')
    await expect(page.getByText('급여대장', { exact: true })).toHaveCount(0)
    await page.goto('/admin/payroll')
    await page.waitForURL(u => u.pathname === '/', { timeout: 15_000 })
  })

  test('designer는 DB에서도 급여 기준·급여대장을 못 봄(RLS)', async () => {
    const sb = await loginApi('e2e-designer@jmtest.local')
    for (const t of ['payroll_items', 'employee_pay_settings']) {
      const { data } = await sb.from(t).select('*').limit(1)
      expect(data || []).toHaveLength(0)
    }
  })

  // 열람자(대표·이사)만: 관리자 등급이어도 열람자 명단에 없으면 메뉴·주소·DB·감사기록 모두 차단
  test('열람자가 아닌 admin: 메뉴 없음, 주소로 와도 돌려보냄, DB·감사기록 0건, 명단 못 바꿈', async ({ page }) => {
    const admin = adminClient()
    // 실제로 숨겨야 할 자료가 있어야 '0건'이 의미 있음 — 급여 기준(직원 급여)이 있는지 먼저 확인
    const { data: rows } = await admin.from('employee_pay_settings').select('employee_id').limit(1)
    test.skip(!(rows && rows.length), '운영 DB에 급여 자료가 없어 차단 확인 불가')

    const sb = await loginApi('e2e-admin@jmtest.local')
    expect((await sb.rpc('is_payroll_viewer')).data).toBe(false)
    for (const t of ['payroll_items', 'employee_pay_settings']) {
      const { data } = await sb.from(t).select('*').limit(5)
      expect(data || [], t).toHaveLength(0)
    }
    const { data: logs } = await sb.from('audit_logs').select('id').in('table_name', ['payroll_items', 'employee_pay_settings']).limit(1)
    expect(logs || []).toHaveLength(0)
    // 스스로 열람자 명단에 올리기 시도 → 막혀야 함
    const me = (await sb.auth.getUser()).data.user!.id
    await sb.from('payroll_viewers').insert([{ user_id: me }])
    expect((await sb.rpc('is_payroll_viewer')).data).toBe(false)
    // 쓰기도 막힘
    const { error: wErr } = await sb.from('payroll_items').insert([{ month: '2030-02', employee_name: 'E2E_침입' }])
    expect(wErr).toBeTruthy()

    await login(page, 'e2e-admin@jmtest.local')
    await expect(page.locator('aside').getByText('추가근무')).toBeVisible()
    await expect(page.locator('aside').getByText('급여대장', { exact: true })).toHaveCount(0)
    await page.goto('/admin/payroll')
    await page.waitForURL(u => u.pathname === '/', { timeout: 15_000 })
  })

  test('admin: 만들기(수습 자동) → 상여금 수정 → 엑셀 → 경영관리 저장', async ({ page }) => {
    const admin = adminClient()
    const { error: tblErr } = await admin.from('payroll_items').select('id').limit(1)
    test.skip(!!tblErr, 'payroll_items 테이블 없음 — db/payroll.sql 실행 필요')

    const cleanup = async () => {
      await admin.from('payroll_items').delete().eq('month', TEST_MONTH)
      await admin.from('finance_payroll').delete().gte('month', `${TEST_MONTH}-01`).lt('month', '2030-02-01')
      await admin.from('finance_payroll_ledger').delete().eq('month', TEST_MONTH)
    }
    await cleanup()
    const { data: emp } = await admin.from('employees').insert([{
      name: 'E2E_급여', employment_type: '상용직', is_active: true, hire_date: '2029-12-01', resident_number: '900101-1000000',
    }]).select('id').single()
    expect(emp).toBeTruthy()
    await admin.from('employee_pay_settings').insert([{
      employee_id: emp!.id, work_type: '현장', position: '사원', monthly_pay: 3_500_000, meal: 200_000,
      dependents: 1, employment_insurance: true, health_ins: 100_000, care_ins: 13_000, pension: 150_000,
      probation_end: '2030-01-31', probation_rate: 0.9,
    }])

    // 화면 흐름 확인을 위해 테스트 관리자를 이 테스트 동안만 열람자로 지정 (finally에서 해제)
    const { data: au } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const testAdminId = au.users.find(u => u.email === 'e2e-admin@jmtest.local')!.id
    await admin.from('payroll_viewers').insert([{ user_id: testAdminId, note: 'E2E 임시' }])

    try {
      await login(page, 'e2e-admin@jmtest.local')
      await page.goto('/admin/payroll')
      await expect(page.getByRole('heading', { name: '급여대장' })).toBeVisible()
      await page.locator('input[type="month"]').fill(TEST_MONTH)
      await page.getByRole('button', { name: '1월 급여대장 만들기' }).click()

      const row = page.locator('tr').filter({ hasText: 'E2E_급여' })
      await expect(row).toBeVisible({ timeout: 15_000 })
      await expect(row).toContainText('수습 90%')
      await expect(row.locator('td').nth(8)).toHaveText('3,150,000') // 급여합계

      // 상여금 100,000 추가 → 급여합계 3,250,000
      await row.getByRole('button', { name: 'E2E_급여' }).click()
      await page.getByLabel('상여금').fill('100000')
      await page.getByRole('button', { name: '저장', exact: true }).click()
      await expect(row.locator('td').nth(8)).toHaveText('3,250,000', { timeout: 15_000 })

      const dl = page.waitForEvent('download')
      await page.getByRole('button', { name: '엑셀 저장' }).click()
      expect((await dl).suggestedFilename()).toBe('01월 급여대장_2030.xlsx')

      await page.getByRole('button', { name: '경영관리에 저장' }).click()
      await expect.poll(async () => {
        const { data } = await admin.from('finance_payroll_ledger').select('rows').eq('month', TEST_MONTH).maybeSingle()
        return JSON.stringify(data?.rows || [])
      }, { timeout: 15_000 }).toContain('E2E_급여')
      const { data: fp } = await admin.from('finance_payroll').select('amount').eq('employee_name', 'E2E_급여').eq('month', `${TEST_MONTH}-01`)
      expect(fp?.[0]?.amount).toBe(3_250_000)
    } finally {
      await admin.from('payroll_viewers').delete().eq('user_id', testAdminId)
      await cleanup()
      await admin.from('employees').delete().eq('id', emp!.id)
    }
  })
})
