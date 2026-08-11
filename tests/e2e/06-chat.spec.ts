import { test, expect } from '@playwright/test'
import { login, adminClient } from './helpers'

// ⑦ 채팅 송수신·읽음·알림 — admin이 field에게 1:1 메시지
test.describe('채팅 흐름', () => {
  test.beforeEach(async ({ page }) => {
    page.on('dialog', d => d.accept())
  })

  test('admin → field 1:1 전송, field 수신·알림, admin 읽음 확인', async ({ browser }) => {
    const adminCtx = await browser.newContext()
    const fieldCtx = await browser.newContext()
    const adminPage = await adminCtx.newPage()
    const fieldPage = await fieldCtx.newPage()

    // admin: field에게 DM 전송
    await login(adminPage, 'e2e-admin@jmtest.local')
    await adminPage.goto('/chat')
    await adminPage.getByText('E2E현장', { exact: false }).first().click()
    const input = adminPage.getByPlaceholder(/메시지 입력/)
    await input.fill('E2E_채팅테스트 안녕하세요')
    await input.press('Enter')
    await expect(adminPage.getByText('E2E_채팅테스트 안녕하세요').first()).toBeVisible()

    // field: 알림에 메시지 도착 + 채팅에서 수신 확인
    await login(fieldPage, 'e2e-field@jmtest.local')
    await fieldPage.goto('/notifications')
    await expect(fieldPage.getByText(/E2E관리자.*메시지|님의 메시지/).first()).toBeVisible({ timeout: 15_000 })
    await fieldPage.goto('/chat')
    await fieldPage.getByText('E2E관리자', { exact: false }).first().click()
    await expect(fieldPage.getByText('E2E_채팅테스트 안녕하세요').first()).toBeVisible()

    // admin: 상대가 읽었으니 '읽음' 표시
    await adminPage.reload()
    await adminPage.getByText('E2E현장', { exact: false }).first().click()
    await expect(adminPage.getByText('읽음').first()).toBeVisible({ timeout: 15_000 })

    await adminCtx.close()
    await fieldCtx.close()
  })

  test('정리: 테스트 메시지 삭제 확인용 DB 체크', async () => {
    const admin = adminClient()
    const { data } = await admin.from('messages').select('id').like('content', 'E2E\\_%')
    expect((data || []).length).toBeGreaterThan(0) // teardown에서 삭제됨
  })
})
