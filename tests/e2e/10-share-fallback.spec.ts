import { test, expect } from '@playwright/test'
import { login, adminClient } from './helpers'

// ⑩ 폰 공유 서버 대비책 — 서비스워커가 공유 POST를 못 가로챈 경우(설치 전·재설치 중)에도
// 서버(/share-target)가 받아 공유 화면(현장·분류 선택)까지 이어지는지.
// page.request는 서비스워커를 거치지 않으므로 '서비스워커 없음' 상황을 그대로 재현한다.

// 1x1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

test('서비스워커 없이 공유해도 공유 화면에 사진과 분류 선택이 뜬다', async ({ page }) => {
  await login(page, 'e2e-admin@jmtest.local')

  const res = await page.request.post('/share-target', {
    multipart: {
      text: 'E2E_문자공유',
      files: { name: 'mms_photo.png', mimeType: 'image/png', buffer: PNG },
    },
    maxRedirects: 0,
  })
  expect(res.status()).toBe(303)
  const loc = res.headers()['location'] || ''
  expect(loc).toMatch(/\/share\?inbox=[a-z0-9-]+$/)
  const batch = loc.split('inbox=')[1]

  await page.goto(loc)
  await expect(page.getByText('공유된 파일 1개')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('분류', { exact: true })).toBeVisible()
  await expect(page).toHaveURL(/\/share$/) // 주소 정리됨

  // 꺼낸 뒤 서버 보관본은 삭제돼야 함
  const admin = adminClient()
  const { data: u } = await admin.from('profiles').select('id').eq('name', 'E2E관리자').maybeSingle()
  if (u?.id) {
    await expect.poll(async () => {
      const { data } = await admin.storage.from('secure').list(`share-inbox/${u.id}/${batch}`)
      return (data || []).length
    }, { timeout: 10_000 }).toBe(0)
  }
})

test('로그인 안 된 상태의 공유는 로그인 화면으로', async ({ request }) => {
  const res = await request.post('/share-target', {
    multipart: { files: { name: 'a.png', mimeType: 'image/png', buffer: PNG } },
    maxRedirects: 0,
  })
  expect([303, 307]).toContain(res.status())
  expect(res.headers()['location'] || '').toContain('/login')
})
