import test from 'node:test'
import assert from 'node:assert/strict'
import { signOutCurrentDevice } from '../../src/lib/auth-session.ts'

test('로그아웃은 다른 기기 세션을 끝내지 않고 현재 기기만 종료한다', async () => {
  const calls = []
  const client = { auth: { signOut: async (options) => { calls.push(options); return { error: null } } } }
  await signOutCurrentDevice(client)
  assert.deepEqual(calls, [{ scope: 'local' }])
})

test('로그아웃 실패 시 오류를 호출자에게 돌려준다', async () => {
  const expected = new Error('network')
  const client = { auth: { signOut: async () => ({ error: expected }) } }
  assert.equal(await signOutCurrentDevice(client), expected)
})
