import { test, expect } from '@playwright/test'

// ① 미로그인 사용자의 페이지·API 접근 차단
test.describe('미로그인 차단', () => {
  test('보호된 페이지는 로그인으로 리다이렉트', async ({ page }) => {
    for (const path of ['/', '/projects', '/receipts', '/admin/finance', '/chat']) {
      await page.goto(path)
      await expect(page).toHaveURL(/\/login/)
    }
  })

  test('관리자 API는 인증 없이 401', async ({ request }) => {
    const r1 = await request.post('/api/admin/create-user', {
      data: { name: 'x', email: 'x@x.com', password: 'password1', role: 'admin' },
    })
    expect(r1.status()).toBe(401)
    const r2 = await request.post('/api/admin/delete-user', { data: { userId: 'abc' } })
    expect(r2.status()).toBe(401)
    const r3 = await request.post('/api/admin/invite-user', {
      data: { name: 'x', email: 'x@x.com', role: 'admin' },
    })
    expect(r3.status()).toBe(401)
  })

  test('초대 수락 API는 무작위 토큰 없이는 거부', async ({ request }) => {
    const r = await request.post('/api/invite/accept', { data: { token: 'short', password: 'password123' } })
    expect(r.status()).toBe(400)
  })
})
