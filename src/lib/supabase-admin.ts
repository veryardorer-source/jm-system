import { createClient } from '@supabase/supabase-js'

// 환경변수 값에 딸려온 BOM(U+FEFF)·공백 제거.
// Vercel에 서비스 키를 붙여넣을 때 BOM이 섞여 서버의 모든 DB 요청이 실패했던
// 사고(2026-07-07, 알림 전면 미발송) 재발 방지 — 서버 라우트는 반드시 이걸 사용.
export const cleanEnv = (v?: string) => (v || '').replace(/^﻿+/, '').trim()

export function createAdminClient() {
  return createClient(
    cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL),
    cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY),
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
