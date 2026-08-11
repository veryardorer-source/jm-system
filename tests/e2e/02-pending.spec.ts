import { test, expect } from '@playwright/test'
import { login, loginApi } from './helpers'

// ② 승인 대기(pending) 계정: 화면·데이터 접근 전면 차단
test.describe('pending 차단', () => {
  test('로그인하면 승인 대기 화면만 보임', async ({ page }) => {
    await login(page, 'e2e-pending@jmtest.local')
    await expect(page.getByText('관리자 승인 대기 중')).toBeVisible()
    // 주소를 직접 쳐도 업무 화면이 안 나옴
    await page.goto('/projects')
    await expect(page.getByText('관리자 승인 대기 중')).toBeVisible()
    await page.goto('/chat')
    await expect(page.getByText('관리자 승인 대기 중')).toBeVisible()
  })

  test('RLS: DB 직접 조회·쓰기도 차단', async () => {
    const sb = await loginApi('e2e-pending@jmtest.local')
    const { data: projects } = await sb.from('projects').select('id')
    expect(projects || []).toHaveLength(0)
    const { data: files } = await sb.from('project_files').select('id').limit(5)
    expect(files || []).toHaveLength(0)
    const { data: msgs } = await sb.from('messages').select('id').limit(5)
    expect(msgs || []).toHaveLength(0)
    const { error: insErr } = await sb.from('notices').insert([{ title: 'E2E_불법공지', content: 'x', category: '전체', author: 'x' }])
    expect(insErr).not.toBeNull()
    // 자기 role을 admin으로 바꾸는 권한 상승 시도 → 값이 바뀌지 않아야 함
    const { data: me } = await sb.auth.getUser()
    await sb.from('profiles').update({ role: 'admin' }).eq('id', me.user!.id)
    const { data: prof } = await sb.from('profiles').select('role').eq('id', me.user!.id).single()
    expect(prof?.role).toBe('pending')
    await sb.auth.signOut()
  })
})
