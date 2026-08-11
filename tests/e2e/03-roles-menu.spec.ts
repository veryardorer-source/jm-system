import { test, expect } from '@playwright/test'
import { login } from './helpers'

// ③ 역할별 메뉴 노출
test.describe('역할별 메뉴', () => {
  test('admin: 관리자 메뉴 전부 보임', async ({ page }) => {
    await login(page, 'e2e-admin@jmtest.local')
    const nav = page.locator('aside, nav').first()
    for (const label of ['수금 관리', '회원 관리', '직원정보내역', '경영관리']) {
      await expect(nav.getByText(label, { exact: false }).first()).toBeVisible()
    }
  })

  test('field: 수금·관리자 메뉴 안 보임', async ({ page }) => {
    await login(page, 'e2e-field@jmtest.local')
    await expect(page.getByText('현장 관리').first()).toBeVisible()
    await expect(page.getByText('수금 관리')).toHaveCount(0)
    await expect(page.getByText('회원 관리')).toHaveCount(0)
    await expect(page.getByText('경영관리')).toHaveCount(0)
  })

  test('partner: 내부 메뉴 대부분 숨김 + 금전 화면 접근 차단', async ({ page }) => {
    await login(page, 'e2e-partner@jmtest.local')
    for (const label of ['영수증', '출금 요청', '수금 관리', '작업일지', '거래처', '채팅']) {
      await expect(page.getByText(label, { exact: true })).toHaveCount(0)
    }
    // 주소 직접 입력해도 차단 화면
    for (const path of ['/receipts', '/withdrawals', '/payments', '/worklogs', '/contacts', '/chat']) {
      await page.goto(path)
      await expect(page.getByText('접근 권한이 없습니다')).toBeVisible()
    }
  })
})
