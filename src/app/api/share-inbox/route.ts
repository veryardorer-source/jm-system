import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAdminClient, cleanEnv } from '@/lib/supabase-admin'

export const runtime = 'nodejs'

// 공유 서버 대비책(/share-target)이 보관한 묶음을 공유 화면이 꺼내 가는 곳.
// 본인 묶음만 접근 가능(경로에 사용자 id 고정). GET=목록+서명주소, DELETE=삭제.

async function currentUserId(): Promise<string | null> {
  const cookieStore = await cookies()
  const authClient = createServerClient(
    cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL),
    cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
  const { data: { user } } = await authClient.auth.getUser()
  return user?.id ?? null
}

function batchDir(uid: string, req: NextRequest): string | null {
  const id = req.nextUrl.searchParams.get('id') || ''
  if (!/^[a-z0-9-]{5,40}$/.test(id)) return null // 경로 조작 방지
  return `share-inbox/${uid}/${id}`
}

type Manifest = { text: string; received: number; error?: string; files: { path: string; name: string; type: string; size: number }[] }

export async function GET(req: NextRequest) {
  const uid = await currentUserId()
  if (!uid) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  const dir = batchDir(uid, req)
  if (!dir) return NextResponse.json({ error: '잘못된 요청' }, { status: 400 })

  const admin = createAdminClient()
  const { data: blob, error } = await admin.storage.from('secure').download(`${dir}/manifest.json`)
  if (error || !blob) return NextResponse.json({ error: '공유 내용을 찾을 수 없어요(이미 저장했거나 만료)' }, { status: 404 })
  const manifest = JSON.parse(await blob.text()) as Manifest

  const paths = manifest.files.map(f => f.path)
  const signed = paths.length ? (await admin.storage.from('secure').createSignedUrls(paths, 600)).data || [] : []
  const files = manifest.files.map((f, i) => ({ name: f.name, type: f.type, size: f.size, url: signed[i]?.signedUrl || '' }))
  return NextResponse.json({ text: manifest.text, received: manifest.received, error: manifest.error || '', files })
}

export async function DELETE(req: NextRequest) {
  const uid = await currentUserId()
  if (!uid) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  const dir = batchDir(uid, req)
  if (!dir) return NextResponse.json({ error: '잘못된 요청' }, { status: 400 })

  const admin = createAdminClient()
  const { data: list } = await admin.storage.from('secure').list(dir)
  const paths = (list || []).map(o => `${dir}/${o.name}`)
  if (paths.length) await admin.storage.from('secure').remove(paths)
  return NextResponse.json({ ok: true })
}
