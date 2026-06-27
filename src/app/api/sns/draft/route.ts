import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import Anthropic from '@anthropic-ai/sdk'

const CATEGORY_BY_TYPE: Record<string, string[]> = {
  '디자인': ['도면', '3D'],
  '시공': ['시공전사진', '시공사진'],
  '마감': ['마감사진'],
}
const MAX_PHOTOS = 4

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI 기능이 아직 설정되지 않았어요 (관리자에게 문의)' }, { status: 500 })
  }

  const { projectId, channel, postType } = await req.json()
  if (!projectId || !channel || !postType || !CATEGORY_BY_TYPE[postType]) {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 })
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: project } = await adminClient.from('projects').select('name, client_name, address').eq('id', projectId).single()
  if (!project) return NextResponse.json({ error: '현장을 찾을 수 없어요' }, { status: 404 })

  const categories = CATEGORY_BY_TYPE[postType]
  const { data: files } = await adminClient
    .from('project_files')
    .select('file_name, file_url, file_type, created_at')
    .eq('project_id', projectId)
    .in('category', categories)
    .order('created_at', { ascending: false })
    .limit(MAX_PHOTOS)

  if (!files || files.length === 0) {
    return NextResponse.json({ error: `${categories.join('/')} 카테고리에 사진이 없어요. 먼저 사진을 올려주세요.` }, { status: 400 })
  }

  const imageBlocks = []
  for (const f of files) {
    try {
      const res = await fetch(f.file_url)
      if (!res.ok) continue
      const buf = Buffer.from(await res.arrayBuffer())
      const mediaType = (f.file_type || 'image/jpeg').split(';')[0]
      if (!mediaType.startsWith('image/')) continue
      imageBlocks.push({
        type: 'image' as const,
        source: { type: 'base64' as const, media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif', data: buf.toString('base64') },
      })
    } catch { /* 사진 하나 실패해도 계속 진행 */ }
  }

  if (imageBlocks.length === 0) {
    return NextResponse.json({ error: '사진을 불러오지 못했어요' }, { status: 500 })
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const channelGuide = channel === 'blog'
    ? '네이버 블로그용 포스팅 — 제목 1줄 + 본문 4~6문단(소제목 없이 자연스러운 줄글), 친근하고 전문적인 톤'
    : '인스타그램 캡션용 — 짧고 임팩트 있는 첫 줄 + 본문 2~4문단 + 마지막에 관련 해시태그 8~12개'

  const prompt = `너는 인테리어 시공사 "JM건축인테리어"의 SNS 마케팅 담당자야. 아래 현장 정보와 사진을 보고 ${postType} 단계 홍보 포스팅 초안을 작성해줘.

현장명: ${project.name}
주소: ${project.address || '비공개'}
포스팅 단계: ${postType} (사진은 이 단계의 실제 시공 사진들)
채널: ${channelGuide}

작성 규칙:
- 사진에서 실제로 보이는 내용(공간, 마감재, 색감, 작업 상태 등)을 구체적으로 언급해줘. 보이지 않는 내용은 지어내지 마.
- 고객 개인정보(이름, 정확한 주소 등)는 쓰지 마.
- 과장된 광고 문구보다는 신뢰감 있는 설명 위주로.
- 결과는 바로 복사해서 쓸 수 있는 완성된 글로, 다른 설명 없이 본문만 출력해줘.`

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [{ type: 'text', text: prompt }, ...imageBlocks],
      }],
    })
    const content = msg.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim()
    return NextResponse.json({ content, photoCount: imageBlocks.length })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'AI 호출 실패'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
