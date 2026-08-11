import { test, expect } from '@playwright/test'
import { login } from './helpers'

// ⑥ 출금 요청(현장팀 등록) → 관리자 처리완료 토글
test.describe('출금 요청 흐름', () => {
  test.beforeEach(async ({ page }) => {
    page.on('dialog', d => d.accept())
  })

  test('field: 글만으로 출금 요청 등록', async ({ page }) => {
    await login(page, 'e2e-field@jmtest.local')
    await page.goto('/withdrawals')
    await page.getByRole('button', { name: '+ 출금 추가' }).click()
    await page.getByPlaceholder('카톡 내용을 붙여넣거나 입력 (일당, 자재비, 송금내역 등)').fill('E2E_출금테스트 자재비 1건')
    await page.getByRole('button', { name: '글 저장' }).click()
    await expect(page.getByText('E2E_출금테스트 자재비 1건').first()).toBeVisible({ timeout: 15_000 })
  })

  test('admin: 대기 건을 처리완료로 전환', async ({ page }) => {
    await login(page, 'e2e-admin@jmtest.local')
    await page.goto('/withdrawals')
    const card = page.locator('div').filter({ hasText: 'E2E_출금테스트 자재비 1건' }).last()
    await expect(card).toBeVisible()
    await card.getByRole('button', { name: '✓ 처리완료' }).click()
    await expect(card.getByRole('button', { name: '↩ 대기로 되돌리기' })).toBeVisible({ timeout: 10_000 })
  })
})
