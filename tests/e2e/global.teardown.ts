import { adminClient, TEST_USERS } from './helpers'
import fs from 'fs'
import path from 'path'

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
  await admin.from('invite_tokens').delete().in('email', TEST_USERS.map(t => t.email))
  await admin.from('employees').delete().like('name', 'E2E\\_%') // 추가근무·급여 기준은 cascade 삭제
  await admin.from('payroll_items').delete().eq('month', '2030-01') // 급여대장 테스트 달
  await admin.from('payroll_items').delete().eq('month', '2030-02')
  await admin.from('payroll_viewers').delete().eq('note', 'E2E 임시')
  await admin.from('finance_payroll').delete().gte('month', '2030-01-01').lt('month', '2030-02-01')
  await admin.from('finance_payroll_ledger').delete().eq('month', '2030-01')

  // 2) 이번 실행에서 새로 만든 계정 ID만 삭제 (기존 e2e- 계정은 절대 삭제하지 않음)
  const manifest = path.join(process.cwd(), 'test-results', 'e2e-created-users.json')
  const created: string[] = fs.existsSync(manifest) ? JSON.parse(fs.readFileSync(manifest, 'utf8')) : []
  const targets: { id: string }[] = []
  for (const id of created) {
    const { data, error } = await admin.auth.admin.getUserById(id)
    if (!error && data.user && TEST_USERS.some(t => t.email === data.user.email)) targets.push(data.user)
  }
  for (const u of targets) {
    for (const t of ['push_subscriptions', 'chat_room_members', 'chat_reads', 'notifications', 'project_access']) {
      await admin.from(t).delete().eq('user_id', u.id)
    }
    await admin.from('profiles').delete().eq('id', u.id)
    const { error } = await admin.auth.admin.deleteUser(u.id)
    if (error) throw new Error(`E2E 계정 정리 실패: ${error.message}`)
  }
  fs.rmSync(manifest, { force: true })
  console.log(`E2E 정리 완료 — 계정 ${targets.length}개, 현장 ${pids.length}개 삭제`)
}
