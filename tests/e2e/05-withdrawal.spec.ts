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

  test('field: 카톡 글 → 금액·받는 분·계좌 자동 채움 후 저장', async ({ page }) => {
    await login(page, 'e2e-field@jmtest.local')
    await page.goto('/withdrawals')
    await page.getByRole('button', { name: '+ 출금 추가' }).click()
    await page.getByPlaceholder('카톡 내용을 붙여넣거나 입력 (일당, 자재비, 송금내역 등)')
      .fill('E2E_자동인식 날자29 30 31\n3일로해주세요\n하루 20만원씩 할께요\n홍길동 국민 123456-01-234567')
    await expect(page.getByPlaceholder('예) 600,000')).toHaveValue('600,000')
    await expect(page.getByPlaceholder('예금주 이름')).toHaveValue('홍길동')
    await expect(page.getByPlaceholder('예) 국민 123456-01-234567')).toHaveValue('국민 123456-01-234567')
    await expect(page.getByText('하루 200,000원 × 3일')).toBeVisible()
    await page.getByRole('button', { name: '글 저장' }).click()
    const card = page.locator('div').filter({ hasText: 'E2E_자동인식' }).last()
    await expect(card.getByText('600,000원')).toBeVisible({ timeout: 15_000 })
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
