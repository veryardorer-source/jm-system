import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options))
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // /set-password: 초대 메일 링크 착지 페이지 — 로그인 토큰이 주소 #해시로 와서
  // 서버(쿠키)에는 아직 세션이 없다. 로그인으로 튕기면 해시가 사라져 초대가 깨지므로 통과시킨다.
  const publicPaths = ['/login', '/signup', '/set-password']
  if (!user && !publicPaths.some(p => request.nextUrl.pathname.startsWith(p))) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // 로그인된 사용자는 로그인/가입 화면 대신 홈으로 (set-password는 로그인 상태로 쓰는 화면이라 제외)
  if (user && ['/login', '/signup'].includes(request.nextUrl.pathname)) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.svg|.*\\.png|.*\\.jpg|.*\\.ico|manifest\\.json|icons).*)'],
}
