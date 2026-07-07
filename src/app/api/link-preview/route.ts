import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'

// 사설망/내부 주소 차단 (SSRF 방지)
function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase()
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return true
  const ip = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (ip) {
    const [a, b] = [Number(ip[1]), Number(ip[2])]
    if (a === 127 || a === 10 || a === 0 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254)) return true
  }
  return false
}

function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
}

function metaContent(html: string, prop: string): string {
  // <meta property="og:x" content="..."> / content가 앞에 오는 경우 모두 지원
  const p1 = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*?content=["']([^"']*)["']`, 'i')
  const p2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*?(?:property|name)=["']${prop}["']`, 'i')
  const m = html.match(p1) || html.match(p2)
  return m ? decodeEntities(m[1].trim()) : ''
}

export async function GET(req: NextRequest) {
  // 로그인 사용자만
  const cookieStore = await cookies()
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const raw = req.nextUrl.searchParams.get('url') || ''
  let target: URL
  try { target = new URL(raw) } catch { return NextResponse.json({ error: 'bad url' }, { status: 400 }) }
  if (!/^https?:$/.test(target.protocol) || isBlockedHost(target.hostname)) {
    return NextResponse.json({ error: 'blocked' }, { status: 400 })
  }

  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 6000)
    const res = await fetch(target.toString(), {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        // 일부 사이트(네이버 블로그 등)는 봇 UA에 미리보기 태그를 더 잘 내려줌
        'User-Agent': 'Mozilla/5.0 (compatible; JMBot/1.0; +https://jm-interior.vercel.app)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ko,en;q=0.8',
      },
    })
    clearTimeout(timer)
    const ctype = res.headers.get('content-type') || ''
    if (!res.ok || !ctype.includes('html')) return NextResponse.json({ url: raw })
    const html = (await res.text()).slice(0, 400000)

    const title = metaContent(html, 'og:title') || decodeEntities((html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || '').trim())
    const description = metaContent(html, 'og:description') || metaContent(html, 'description')
    let image = metaContent(html, 'og:image') || metaContent(html, 'twitter:image')
    if (image && !/^https?:\/\//.test(image)) {
      try { image = new URL(image, res.url || target).toString() } catch { image = '' }
    }
    const siteName = metaContent(html, 'og:site_name') || target.hostname

    return NextResponse.json(
      { url: raw, title: title.slice(0, 150), description: description.slice(0, 200), image, siteName },
      { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' } }
    )
  } catch {
    return NextResponse.json({ url: raw })
  }
}
