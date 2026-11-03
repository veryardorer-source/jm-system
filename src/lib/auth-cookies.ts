import type { NextResponse } from 'next/server'
import type { CookieOptions } from '@supabase/ssr'

// proxy가 리다이렉트 응답을 만들더라도 Supabase가 갱신한 쿠키를 잃지 않는다.
export function forwardAuthCookies<T extends Pick<NextResponse, 'cookies'> & Partial<Pick<NextResponse, 'headers'>>>(
  response: T,
  updates: Array<{ name: string; value: string; options: CookieOptions }>,
  authHeaders?: Headers
): T {
  updates.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
  for (const name of ['cache-control', 'expires', 'pragma']) {
    const value = authHeaders?.get(name)
    if (value) response.headers?.set(name, value)
  }
  return response
}
