import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { lookup } from 'node:dns/promises'

export const runtime = 'nodejs'

const MAX_BYTES = 2_000_000  // 유튜브 등 og 태그가 뒤쪽에 있는 사이트 대응
const MAX_HOPS = 5

// 사설/내부 IP 판정 (IPv4 + IPv6)
function isPrivateIp(ip: string): boolean {
  const v = ip.toLowerCase()
  if (v.includes(':')) {
    const mapped = v.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)  // IPv4-mapped IPv6
    if (mapped) return isPrivateIp(mapped[1])
    return v === '::1' || v === '::' || v.startsWith('fe80:') || v.startsWith('fc') || v.startsWith('fd')
  }
  const p = v.split('.').map(Number)
  if (p.length !== 4 || p.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true
  const [a, b] = p
  return a === 127 || a === 10 || a === 0 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254)
}

// 호스트 차단 여부: 이름 패턴 + DNS 조회 결과(사설망으로 풀리는 도메인 포함) 검사 (SSRF 방지)
async function isBlockedTarget(u: URL): Promise<boolean> {
  if (!/^https?:$/.test(u.protocol)) return true
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return true
  if (/^[\d.]+$/.test(host) || host.includes(':')) return isPrivateIp(host)
  try {
    const addrs = await lookup(host, { all: true })
    if (!addrs.length) return true
    return addrs.some(a => isPrivateIp(a.address))
  } catch { return true }
}

function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
}

function metaContent(html: string, prop: string): string {
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

  try {
    // 리다이렉트를 수동으로 따라가며 매 단계 호스트를 재검사 (내부망으로 튀는 것 차단)
    let cur = target
    let res: Response | null = null
    for (let hop = 0; hop < MAX_HOPS; hop++) {
      if (await isBlockedTarget(cur)) return NextResponse.json({ url: raw })
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 6000)
      res = await fetch(cur.toString(), {
        signal: ctrl.signal,
        redirect: 'manual',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; JMBot/1.0; +https://jm-interior.vercel.app)',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'ko,en;q=0.8',
        },
      })
      clearTimeout(timer)
      const loc = res.headers.get('location')
      if (res.status >= 300 && res.status < 400 && loc) {
        res.body?.cancel().catch(() => {})
        cur = new URL(loc, cur)
        continue
      }
      break
    }
    if (!res || !res.ok) return NextResponse.json({ url: raw })
    const ctype = res.headers.get('content-type') || ''
    if (!ctype.includes('html')) { res.body?.cancel().catch(() => {}); return NextResponse.json({ url: raw }) }

    // 본문을 통째로 받지 않고 최대 크기까지만 스트리밍으로 읽기
    let html = ''
    const reader = res.body?.getReader()
    if (reader) {
      const dec = new TextDecoder()
      let size = 0
      while (size < MAX_BYTES) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        html += dec.decode(value, { stream: true })
      }
      reader.cancel().catch(() => {})
    } else {
      html = (await res.text()).slice(0, MAX_BYTES)
    }

    const title = metaContent(html, 'og:title') || decodeEntities((html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || '').trim())
    const description = metaContent(html, 'og:description') || metaContent(html, 'description')
    let image = metaContent(html, 'og:image') || metaContent(html, 'twitter:image')
    if (image && !/^https?:\/\//.test(image)) {
      try { image = new URL(image, cur).toString() } catch { image = '' }
    }
    const siteName = metaContent(html, 'og:site_name') || cur.hostname

    return NextResponse.json(
      { url: raw, title: title.slice(0, 150), description: description.slice(0, 200), image, siteName },
      { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' } }
    )
  } catch {
    return NextResponse.json({ url: raw })
  }
}
