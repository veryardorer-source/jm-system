import test from 'node:test'
import assert from 'node:assert/strict'
import { forwardAuthCookies } from '../../src/lib/auth-cookies.ts'

test('토큰 갱신 뒤 로그인 페이지로 이동해도 갱신 쿠키를 브라우저에 보낸다', () => {
  const applied = []
  const response = { cookies: { set: (...args) => applied.push(args) } }
  const updates = [{ name: 'sb-auth-token', value: 'refreshed', options: { path: '/', maxAge: 3600 } }]
  assert.equal(forwardAuthCookies(response, updates), response)
  assert.deepEqual(applied, [['sb-auth-token', 'refreshed', { path: '/', maxAge: 3600 }]])
})

test('토큰 쿠키가 바뀌지 않았다면 응답도 바꾸지 않는다', () => {
  const applied = []
  const response = { cookies: { set: (...args) => applied.push(args) } }
  forwardAuthCookies(response, [])
  assert.deepEqual(applied, [])
})

test('토큰을 전달할 때 인증 응답의 캐시 방지 헤더도 전달한다', () => {
  const headers = new Headers()
  const response = { cookies: { set: () => {} }, headers }
  const authHeaders = new Headers({ 'cache-control': 'private, no-store', pragma: 'no-cache' })
  forwardAuthCookies(response, [], authHeaders)
  assert.equal(headers.get('cache-control'), 'private, no-store')
  assert.equal(headers.get('pragma'), 'no-cache')
})
