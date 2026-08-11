import { test, expect } from '@playwright/test'
import { login } from './helpers'

// ⑩ 모바일 주요 메뉴 이동 (갤럭시 크기 뷰포트)
test.use({ viewport: { width: 384, height: 854 }, hasTouch: true })

test.describe('모바일 화면', () => {
  test('로그인 → 대시보드 → 현장/채팅/알림 이동', async ({ page }) => {
    await login(page, 'e2e-admin@jmtest.local')
    await expect(page).toHaveURL('/')

    await page.goto('/projects')
    await expect(page.locator('h1', { hasText: '현장 관리' })).toBeVisible()

    await page.goto('/chat')
    await expect(page.getByText('전체 채팅방').first()).toBeVisible()

    await page.goto('/notifications')
    await expect(page.locator('h1', { hasText: '알림' })).toBeVisible()

    // 채팅 입력창이 모바일에서 보이는지 (과거 flex-1 버그 회귀 방지)
    await page.goto('/chat')
    const self = page.getByText('나와의 채팅', { exact: false }).first()
    if (await self.count()) {
      await self.click()
      await expect(page.getByPlaceholder(/메시지 입력/)).toBeVisible()
    }
  })
})
