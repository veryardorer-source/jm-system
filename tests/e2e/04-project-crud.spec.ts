import { test, expect } from '@playwright/test'
import { login, adminClient } from './helpers'

// ④ 현장 생성·조회 + ⑤ 자료(구매링크) 등록 — 스토리지를 쓰지 않는 안전한 자료로 검증
test.describe('현장 CRUD와 자료 등록', () => {
  test.beforeEach(async ({ page }) => {
    page.on('dialog', d => d.accept())
  })

  test('admin: 현장 생성 → 목록 표시 → 상세 진입', async ({ page }) => {
    await login(page, 'e2e-admin@jmtest.local')
    await page.goto('/projects')
    await page.getByRole('button', { name: '+ 현장 등록' }).click()
    await page.getByPlaceholder('예) 강남구 OO아파트 101호').fill('E2E_테스트현장')
    await page.getByRole('button', { name: /^(등록|저장)$/ }).last().click()
    // 목록은 데스크탑/모바일 두 벌로 렌더링되므로 '보이는' 링크만 잡는다
    const visibleLink = page.locator('a:visible', { hasText: 'E2E_테스트현장' }).first()
    await expect(visibleLink).toBeVisible({ timeout: 15_000 })
    await visibleLink.click()
    await expect(page).toHaveURL(/\/projects\/.+/)
  })

  test('admin: 자료 탭에서 구매링크 등록', async ({ page }) => {
    const admin = adminClient()
    // 이전 실행 잔재로 같은 이름이 여러 개일 수 있어 최신 1건만, 없으면 직접 생성
    let { data: projs } = await admin.from('projects').select('id')
      .eq('name', 'E2E_테스트현장').order('created_at', { ascending: false }).limit(1)
    if (!projs?.length) {
      const { data: created } = await admin.from('projects')
        .insert([{ name: 'E2E_테스트현장', status: '시공중' }]).select('id').single()
      projs = created ? [created] : []
    }
    const proj = projs[0]
    expect(proj).toBeTruthy()

    await login(page, 'e2e-admin@jmtest.local')
    await page.goto(`/projects/${proj!.id}?tab=자료`)
    await page.getByRole('button', { name: '+ 자료 추가' }).click()
    // 자료 종류를 '구매링크'로 (파일/링크 토글 버튼)
    await page.getByRole('button', { name: '🔗 구매링크' }).click()
    await page.getByPlaceholder('https://smartstore.naver.com/...').fill('https://example.com/e2e')
    await page.getByPlaceholder('예) 거실 조명 - 쿠팡').fill('E2E_링크자료')
    await page.getByRole('button', { name: /업로드|저장|등록/ }).last().click()
    // 분류가 기본 접힘 상태라 '구매링크' 분류를 펼친 뒤 확인
    const catHeader = page.locator('button').filter({ hasText: '구매링크' }).filter({ hasText: '펼치기' }).first()
    await expect(catHeader).toBeVisible({ timeout: 15_000 })
    await catHeader.click()
    await expect(page.getByText('E2E_링크자료').first()).toBeVisible({ timeout: 15_000 })
  })

  test('DB 확인: 현장·자료가 실제로 저장됨', async () => {
    const admin = adminClient()
    const { data: proj } = await admin.from('projects').select('id').like('name', 'E2E\\_%')
    expect((proj || []).length).toBeGreaterThan(0)
    const { data: files } = await admin.from('project_files').select('id').eq('file_name', 'E2E_링크자료')
    expect((files || []).length).toBeGreaterThan(0)
  })
})
