import { test, expect } from '@playwright/test'
import { login } from './helpers'

// ⑧ 관리자 회원 생성(임시 비밀번호 방식)·삭제
test.describe('관리자 회원 관리', () => {
  test.beforeEach(async ({ page }) => {
    page.on('dialog', d => d.accept())
  })

  test('임시 비밀번호로 계정 생성 후 내보내기', async ({ page }) => {
    await login(page, 'e2e-admin@jmtest.local')
    await page.goto('/admin/users')
    await page.getByRole('button', { name: '+ 직원 추가' }).click()
    await page.getByPlaceholder('홍길동').fill('E2E임시직원')
    await page.getByPlaceholder('직원이 로그인할 때 쓸 이메일 주소').fill('e2e-temp@jmtest.local')
    // 임시 비밀번호 모드로 전환 (폼 안에서만 탐색해 목록의 같은 이름 버튼과 혼동 방지)
    const form = page.locator('form').filter({ hasText: '임시 비밀번호로 바로 만들기' })
    await form.getByText('초대 링크 대신 임시 비밀번호로 바로 만들기').click()
    await form.getByPlaceholder('직원에게 알려줄 임시 비밀번호').fill('E2e!temp-2026')
    await form.getByRole('button', { name: '현장팀' }).click()
    await form.getByRole('button', { name: '계정 생성' }).click()
    await expect(page.getByText('E2E임시직원').first()).toBeVisible({ timeout: 15_000 })

    // 내보내기(삭제)
    const row = page.locator('tr').filter({ hasText: 'E2E임시직원' })
    await row.getByRole('button', { name: '내보내기' }).click()
    await expect(page.locator('tr').filter({ hasText: 'E2E임시직원' })).toHaveCount(0, { timeout: 15_000 })
  })

  test('초대 링크 생성이 동작함', async ({ page }) => {
    await login(page, 'e2e-admin@jmtest.local')
    await page.goto('/admin/users')
    await page.getByRole('button', { name: '+ 직원 추가' }).click()
    const form = page.locator('form').filter({ hasText: '임시 비밀번호로 바로 만들기' })
    await form.getByPlaceholder('홍길동').fill('E2E초대직원')
    await form.getByPlaceholder('직원이 로그인할 때 쓸 이메일 주소').fill('e2e-invitee@jmtest.local')
    await form.getByRole('button', { name: '디자인팀' }).click()
    await form.getByRole('button', { name: '🔗 초대 링크 만들기' }).click()
    await expect(page.getByText(/초대 링크/).first()).toBeVisible({ timeout: 15_000 })
    const link = await page.locator('input[readonly]').inputValue()
    expect(link).toContain('/invite?t=')
  })
})
