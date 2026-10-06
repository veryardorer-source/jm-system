import { test, expect } from '@playwright/test'
import { login, adminClient, loginApi } from './helpers'

// ⑬ 추가근무(연장·야간·휴일) — 관리자 전용 입력·월 합계
test.describe('추가근무 관리', () => {
  test.beforeEach(async ({ page }) => {
    page.on('dialog', d => d.accept())
  })

  test('field는 메뉴가 없고 주소로 들어와도 대시보드로 돌려보냄', async ({ page }) => {
    await login(page, 'e2e-field@jmtest.local')
    await expect(page.getByText('추가근무', { exact: true })).toHaveCount(0)
    await page.goto('/admin/overtime')
    await page.waitForURL(u => u.pathname === '/', { timeout: 15_000 })
  })

  test('designer는 DB에서도 추가근무 기록을 못 봄(RLS)', async () => {
    const sb = await loginApi('e2e-designer@jmtest.local')
    const { data } = await sb.from('employee_overtime').select('id').limit(1)
    expect(data || []).toHaveLength(0)
  })

  test('admin: 입력 → 직원별 합계 반영 → 수정 → 삭제', async ({ page }) => {
    const admin = adminClient()
    const { error: tblErr } = await admin.from('employee_overtime').select('id').limit(1)
    test.skip(!!tblErr, 'employee_overtime 테이블 없음 — db/employee_overtime.sql 실행 필요')

    const { data: emp } = await admin.from('employees')
      .insert([{ name: 'E2E_추가근무', employment_type: '상용직', is_active: true }]).select('id').single()
    expect(emp).toBeTruthy()

    await login(page, 'e2e-admin@jmtest.local')
    await page.goto('/admin/overtime')
    await expect(page.getByRole('heading', { name: '추가근무 관리' })).toBeVisible()
    await expect(page.getByText('📖 사용 방법')).toBeVisible()

    await page.getByRole('button', { name: '+ 추가근무 입력' }).click()
    const form = page.locator('form')
    await form.locator('select').selectOption(emp!.id)
    await form.getByRole('button', { name: '야간', exact: true }).click()
    // 자정 넘김 계산: 21:00 ~ 01:30 = 4.5시간
    await form.getByLabel('시작 시각').fill('21:00')
    await form.getByLabel('종료 시각').fill('01:30')
    await expect(form.getByLabel('시간', { exact: true })).toHaveValue('4.5')
    await form.getByPlaceholder('사유·작업 내용').fill('E2E_야간 마감')
    await form.getByRole('button', { name: '저장', exact: true }).click()

    const row = page.locator('tr').filter({ hasText: 'E2E_추가근무' })
    await expect(row).toBeVisible({ timeout: 15_000 })
    await expect(row.locator('td').nth(2)).toHaveText('4.5') // 야간 칸
    await expect(row.locator('td').nth(4)).toHaveText('4.5') // 합계 칸

    // 수정: 휴일 8시간
    const item = page.locator('div').filter({ hasText: 'E2E_야간 마감' }).last()
    await item.getByRole('button', { name: '수정' }).click()
    await form.getByRole('button', { name: '휴일', exact: true }).click()
    await form.getByRole('button', { name: '8h' }).click()
    await form.getByRole('button', { name: '수정', exact: true }).click()
    await expect(row.locator('td').nth(3)).toHaveText('8', { timeout: 15_000 })
    await expect(row.locator('td').nth(2)).toHaveText('-')

    // 삭제
    await page.locator('div').filter({ hasText: 'E2E_야간 마감' }).last().getByRole('button', { name: '삭제' }).click()
    await expect(page.locator('tr').filter({ hasText: 'E2E_추가근무' })).toHaveCount(0, { timeout: 15_000 })

    await admin.from('employees').delete().eq('id', emp!.id)
  })
})
