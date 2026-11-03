import { adminClient, TEST_USERS, PW } from './helpers'
import fs from 'fs'
import path from 'path'

// 전용 테스트 계정(e2e-*@jmtest.local) 생성 — 이미 있으면 재사용
export default async function globalSetup() {
  const manifest = path.join(process.cwd(), 'test-results', 'e2e-created-users.json')
  fs.mkdirSync(path.dirname(manifest), { recursive: true })
  const created: string[] = []
  fs.writeFileSync(manifest, JSON.stringify(created)) // 이전 실행의 삭제 목록은 재사용하지 않음
  const admin = adminClient()
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  for (const u of TEST_USERS) {
    const existing = list?.users.find(x => x.email === u.email)
    let id = existing?.id
    if (!id) {
      const { data, error } = await admin.auth.admin.createUser({
        email: u.email, password: PW, email_confirm: true,
      })
      if (error) throw new Error(`테스트 계정 생성 실패(${u.email}): ${error.message}`)
      id = data.user.id
      created.push(id)
      fs.writeFileSync(manifest, JSON.stringify(created))
    }
    await admin.from('profiles').upsert({ id, name: u.name, role: u.role, team: null }, { onConflict: 'id' })
  }
  console.log('E2E 테스트 계정 준비 완료 (e2e-*@jmtest.local)')
}
