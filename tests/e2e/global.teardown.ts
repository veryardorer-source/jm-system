import { adminClient, TEST_USERS } from './helpers'

// 테스트가 만든 데이터('E2E_' 접두어)와 테스트 계정을 전부 정리
export default async function globalTeardown() {
  const admin = adminClient()

  // 1) 테스트 데이터 정리 (E2E_ 접두어 기준)
  const { data: projs } = await admin.from('projects').select('id').like('name', 'E2E\\_%')
  const pids = (projs || []).map(p => p.id)
  if (pids.length) {
    for (const t of ['project_files', 'schedules', 'project_costs', 'project_assignments', 'project_access']) {
      await admin.from(t).delete().in('project_id', pids)
    }
    await admin.from('projects').delete().in('id', pids)
  }
  await admin.from('withdrawal_requests').delete().like('reason', 'E2E\\_%')
  await admin.from('receipts').delete().like('memo', 'E2E\\_%')
  await admin.from('messages').delete().like('content', 'E2E\\_%')
  await admin.from('notices').delete().like('title', 'E2E\\_%')
  await admin.from('notifications').delete().or('title.like.%E2E관리자%,title.like.%E2E현장%,title.like.%E2E디자인%,body.like.E2E\\_%')
  await admin.from('invite_tokens').delete().like('email', 'e2e-%')

  // 2) 테스트 계정 삭제 (임시 생성 계정 포함)
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const targets = (list?.users || []).filter(u =>
    TEST_USERS.some(t => t.email === u.email) || (u.email || '').startsWith('e2e-'))
  for (const u of targets) {
    for (const t of ['push_subscriptions', 'chat_room_members', 'chat_reads', 'notifications', 'project_access']) {
      await admin.from(t).delete().eq('user_id', u.id)
    }
    await admin.from('profiles').delete().eq('id', u.id)
    await admin.auth.admin.deleteUser(u.id)
  }
  console.log(`E2E 정리 완료 — 계정 ${targets.length}개, 현장 ${pids.length}개 삭제`)
}
