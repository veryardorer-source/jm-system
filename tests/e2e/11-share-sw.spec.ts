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
  // 동작 중인 서비스워커 버전이 기대 버전과 같으면 초록색
  await expect(page.locator('b', { hasText: /^v\d+-/ })).toHaveClass(/text-green-600/, { timeout: 15_000 })
})

// 크롬 153 버그 재현 — 공유 POST가 항목 0개로 비어서 옴 → 안내 + 📋 붙여넣기로 우회
test('빈 공유는 크롬 버그 안내가 뜨고, 복사한 사진 붙여넣기로 이어진다', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await login(page, 'e2e-admin@jmtest.local')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 15_000 }).toBe(true)

  // 항목 없는 multipart 폼 제출
  await page.evaluate(() => {
    const form = document.createElement('form')
    form.method = 'POST'
    form.action = '/share-target'
    form.enctype = 'multipart/form-data'
    document.body.appendChild(form)
    form.submit()
  })
  await page.waitForURL(/\/share/, { timeout: 15_000 })
  await expect(page.getByText('크롬 버그로 공유 사진이 비어서 왔어요.')).toBeVisible({ timeout: 15_000 })

  // 클립보드에 사진 넣고 📋 버튼
  await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 4; c.height = 4
    const blob: Blob = await new Promise(r => c.toBlob(b => r(b!), 'image/png'))
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
  })
  await page.getByRole('button', { name: '📋 복사한 사진 붙여넣기' }).click()
  await expect(page.getByText('공유된 파일 1개')).toBeVisible({ timeout: 10_000 })

  // 여러 장: 다른 사진을 복사 → '다음 사진 붙여넣기'로 쌓인다
  const copy = (color: string) => page.evaluate(async (c) => {
    const cv = document.createElement('canvas'); cv.width = 4; cv.height = 4
    const ctx = cv.getContext('2d')!; ctx.fillStyle = c; ctx.fillRect(0, 0, 4, 4)
    const blob: Blob = await new Promise(r => cv.toBlob(b => r(b!), 'image/png'))
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
  }, color)
  await copy('#f00')
  await page.getByRole('button', { name: '📋 다음 사진 붙여넣기' }).click()
  await expect(page.getByText('공유된 파일 2개')).toBeVisible({ timeout: 10_000 })
  // 같은 사진 다시 → 중복이라 그대로 2개
  await page.getByRole('button', { name: '📋 다음 사진 붙여넣기' }).click()
  await expect(page.getByText('이미 붙여넣은 사진이에요', { exact: false })).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('공유된 파일 2개')).toBeVisible()
  // ✕로 한 장 빼기
  await page.getByRole('button', { name: '이 사진 빼기' }).first().click()
  await expect(page.getByText('공유된 파일 1개')).toBeVisible()
})
