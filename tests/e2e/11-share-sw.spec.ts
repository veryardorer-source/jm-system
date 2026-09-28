import { test, expect } from '@playwright/test'
import { login } from './helpers'

// ⑪ 폰 공유 서비스워커 경로 — 서비스워커가 공유 POST(multipart)를 가로채 파일을 넘겨주는지.
// 페이지 안에서 실제 <form method=post enctype=multipart> 를 제출하면 서비스워커 fetch 핸들러를 탄다.
test('서비스워커가 공유 POST의 사진을 받아 공유 화면에 넘긴다', async ({ page }) => {
  await login(page, 'e2e-admin@jmtest.local')
  // 서비스워커가 이 페이지를 제어할 때까지 대기 (첫 설치 후엔 새로고침 필요)
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 15_000 }).toBe(true)

  await page.evaluate(() => {
    const form = document.createElement('form')
    form.method = 'POST'
    form.action = '/share-target'
    form.enctype = 'multipart/form-data'
    const input = document.createElement('input')
    input.type = 'file'
    input.name = 'files'
    const dt = new DataTransfer()
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), c => c.charCodeAt(0))
    dt.items.add(new File([png], 'gallery.png', { type: 'image/png' }))
    input.files = dt.files
    form.appendChild(input)
    document.body.appendChild(form)
    form.submit()
  })
  await page.waitForURL(/\/share/, { timeout: 15_000 })
  await expect(page.getByText('공유된 파일 1개')).toBeVisible({ timeout: 20_000 })
})

// 삼성 인터넷처럼 파일 없이 GET으로만 오는 공유 — 공유 화면이 원인(GET)과 브라우저를 보여준다
test('GET 방식 공유는 원인 안내가 뜬다', async ({ page }) => {
  await login(page, 'e2e-admin@jmtest.local')
  await page.goto('/share-target?text=E2E_GET공유')
  await page.waitForURL(/\/share/, { timeout: 15_000 })
  await expect(page.getByText(/GET으로 열렸어요/)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(/브라우저:/)).toBeVisible()
  await expect(page.getByText('v8-2026-09-28')).toHaveClass(/text-green-600/, { timeout: 15_000 })
})
