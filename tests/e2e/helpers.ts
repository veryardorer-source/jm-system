import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { Page } from '@playwright/test'
import fs from 'fs'
import path from 'path'

// .env.local 파싱 — BOM(U+FEFF)·따옴표 제거 (BOM 사고 재발 방지 규칙과 동일)
export function loadEnv(): Record<string, string> {
  const file = path.join(process.cwd(), '.env.local')
  const out: Record<string, string> = {}
  if (!fs.existsSync(file)) return out
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.replace(/^﻿/, '').match(/^([A-Z0-9_]+)="?([^"]*)"?$/)
    if (m) out[m[1]] = m[2].replace(/^﻿/, '').trim()
  }
  return out
}

export function adminClient(): SupabaseClient {
  const env = loadEnv()
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export function anonClient(): SupabaseClient {
  const env = loadEnv()
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export const PW = 'E2e!test-2026'
export const TEST_USERS = [
  { email: 'e2e-admin@jmtest.local', name: 'E2E관리자', role: 'admin' },
  { email: 'e2e-designer@jmtest.local', name: 'E2E디자인', role: 'designer' },
  { email: 'e2e-field@jmtest.local', name: 'E2E현장', role: 'field' },
  { email: 'e2e-partner@jmtest.local', name: 'E2E협력', role: 'partner' },
  { email: 'e2e-pending@jmtest.local', name: 'E2E대기', role: 'pending' },
] as const

export async function login(page: Page, email: string, password = PW) {
  await page.goto('/login')
  await page.getByPlaceholder('이메일 입력').fill(email)
  await page.getByPlaceholder('비밀번호 입력').fill(password)
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 15_000 })
}

// 역할 계정으로 로그인한 supabase 클라이언트 (RLS를 실계정 세션으로 검증할 때 사용)
export async function loginApi(email: string): Promise<SupabaseClient> {
  const sb = anonClient()
  const { error } = await sb.auth.signInWithPassword({ email, password: PW })
  if (error) throw new Error(`API 로그인 실패(${email}): ${error.message}`)
  return sb
}
