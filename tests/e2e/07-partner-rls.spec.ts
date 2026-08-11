import { test, expect } from '@playwright/test'
import { loginApi, adminClient } from './helpers'

// ⑨ partner 제한 — 화면이 아니라 DB(RLS) 레벨에서 실계정으로 검증
test.describe('partner RLS 차단', () => {
  test('금액 조회·생성·수정·삭제 전부 차단', async () => {
    const sb = await loginApi('e2e-partner@jmtest.local')

    // 금전 데이터 조회 → 0건
    for (const table of ['payments', 'receipts', 'withdrawal_requests', 'project_costs']) {
      const { data } = await sb.from(table).select('id').limit(5)
      expect(data || [], `${table} 조회는 0건이어야 함`).toHaveLength(0)
    }

    // 접근권한 없는 현장 목록 → 0건 (지정된 현장이 없으므로)
    const { data: projects } = await sb.from('projects').select('id').limit(10)
    expect(projects || []).toHaveLength(0)

    // 생성 시도 → 실패해야 함
    const { error: insFile } = await sb.from('project_files').insert([{
      project_id: '00000000-0000-0000-0000-000000000000', file_name: 'E2E_불법', file_url: 'x', file_type: '', category: '기타', memo: '', uploaded_by: 'x',
    }])
    expect(insFile).not.toBeNull()

    const { error: insCost } = await sb.from('project_costs').insert([{
      project_id: '00000000-0000-0000-0000-000000000000', category: '기타', amount: 1,
    }])
    expect(insCost).not.toBeNull()

    // 남의 프로필 수정 시도 → 반영 안 됨
    const admin = adminClient()
    const { data: victim } = await admin.from('profiles').select('id, role').eq('name', 'E2E현장').single()
    await sb.from('profiles').update({ role: 'partner' }).eq('id', victim!.id)
    const { data: after } = await admin.from('profiles').select('role').eq('id', victim!.id).single()
    expect(after?.role).toBe('field')

    await sb.auth.signOut()
  })

  test('partner에게 현장을 지정하면 그 현장만 보임', async () => {
    const admin = adminClient()
    // UI 테스트와 독립적으로 자체 현장을 만들어 검증 (teardown이 E2E_ 접두어로 정리)
    let { data: proj } = await admin.from('projects').select('id').eq('name', 'E2E_권한현장').maybeSingle()
    if (!proj) {
      const { data: created, error } = await admin.from('projects')
        .insert([{ name: 'E2E_권한현장', status: '시공중' }]).select('id').single()
      if (error) throw new Error('현장 생성 실패: ' + error.message)
      proj = created
    }
    const { data: partnerProf } = await admin.from('profiles').select('id').eq('name', 'E2E협력').single()
    await admin.from('project_access').upsert({ project_id: proj!.id, user_id: partnerProf!.id })

    const sb = await loginApi('e2e-partner@jmtest.local')
    const { data: visible } = await sb.from('projects').select('id, name')
    expect((visible || []).map(p => p.name)).toContain('E2E_권한현장')
    expect((visible || []).length).toBe(1) // 지정된 현장만

    // 보이는 현장이라도 쓰기는 불가
    await sb.from('projects').update({ memo: '불법수정' }).eq('id', proj!.id)
    const { data: memoAfter } = await admin.from('projects').select('memo').eq('id', proj!.id).single()
    expect(memoAfter?.memo === '불법수정').toBe(false)
    await sb.auth.signOut()
  })
})
