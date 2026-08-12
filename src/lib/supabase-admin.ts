import { createClient } from '@supabase/supabase-js'

// 환경변수 값에 딸려온 BOM(U+FEFF)·공백 제거.
// Vercel에 서비스 키를 붙여넣을 때 BOM이 섞여 서버의 모든 DB 요청이 실패했던
// 사고(2026-07-07, 알림 전면 미발송) 재발 방지 — 서버 라우트는 반드시 이걸 사용.
export const cleanEnv = (v?: string) => (v || '').replace(/^﻿+/, '').trim()

export function createAdminClient() {
  const url = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL)
  const key = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY)
  // 환경변수 누락 시 알 수 없는 오류 대신 원인이 보이는 오류로 (배포 설정 실수 조기 발견)
  if (!url) throw new Error('환경변수 NEXT_PUBLIC_SUPABASE_URL 이 비어 있습니다 — Vercel 환경변수를 확인하세요')
  if (!key) throw new Error('환경변수 SUPABASE_SERVICE_ROLE_KEY 가 비어 있습니다 — Vercel 환경변수를 확인하세요')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}
