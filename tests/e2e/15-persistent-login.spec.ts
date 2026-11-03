import { test, expect } from '@playwright/test'
import { login, PW } from './helpers'

// 이 시나리오는 운영 Supabase에 E2E_ 계정을 만들었다가 지우므로 대표 승인 후 실행.
test('같은 회사 계정의 두 기기가 로그인 상태를 유지하고 한 기기 로그아웃은 다른 기기에 영향이 없다', async ({ browser }) => {
  const tablet = await browser.newContext()
  const meetingRoom = await browser.newContext()
  try {
    const tabletPage = await tablet.newPage()
    const meetingPage = await meetingRoom.newPage()
    await login(tabletPage, 'e2e-field@jmtest.local', PW)
    await login(meetingPage, 'e2e-field@jmtest.local', PW)

    await tabletPage.reload()
    await expect(tabletPage).not.toHaveURL(/\/login/)

    const savedSession = await tablet.storageState()
    expect(savedSession.cookies.some(cookie => cookie.name.startsWith('sb-') && cookie.expires > 0)).toBe(true)

    await meetingPage.getByRole('button', { name: /E2E현장/ }).click()
    await meetingPage.getByRole('button', { name: '로그아웃' }).click()
    await expect(meetingPage).toHaveURL(/\/login/)
    await tabletPage.reload()
    await expect(tabletPage).not.toHaveURL(/\/login/)

    const restartedTablet = await browser.newContext({ storageState: savedSession })
    try {
      const page = await restartedTablet.newPage()
      await page.goto('/')
      await expect(page).not.toHaveURL(/\/login/)
    } finally {
      await restartedTablet.close()
    }
  } finally {
    await tablet.close()
    await meetingRoom.close()
  }
})
