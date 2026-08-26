'use client'

import { useEffect, useState } from 'react'
import { toast } from '@/components/Toaster'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { supabase, HIDDEN_STATUSES } from '@/lib/supabase'
import { useAuth, canEdit } from '@/lib/auth-context'
import { notifyOthers, notifyDM, notifyRoom } from '@/lib/notify'
import { compressImage, makeThumbnail, hashFile, isCompressibleImage, dateStampedName } from '@/lib/image'
import { normalizePdfTitle } from '@/lib/pdf'

const CATEGORY_LIST = ['공사전사진', '시공사진', '마감사진', '도면', '3D', '미팅내용', '고객요청', '기타']

type Proj = { id: string; name: string; status?: string | null }
type Dest = 'project' | 'receipt' | 'withdrawal' | 'chat'

async function readSharedFiles(): Promise<File[]> {
  if (typeof caches === 'undefined') return []
  const cache = await caches.open('shared-media')
  const countRes = await cache.match('/__shared/count')
  const count = countRes ? parseInt(await countRes.text(), 10) : 0
  const files: File[] = []
  for (let i = 0; i < count; i++) {
    const res = await cache.match('/__shared/' + i)
    if (!res) continue
    const blob = await res.blob()
    const name = decodeURIComponent(res.headers.get('x-filename') || 'file' + i)
    files.push(new File([blob], name, { type: blob.type }))
  }
  return files
}

async function readSharedText(): Promise<string> {
  if (typeof caches === 'undefined') return ''
  const cache = await caches.open('shared-media')
  const res = await cache.match('/__shared/text')
  return res ? (await res.text()).trim() : ''
}

async function clearShared() {
  if (typeof caches === 'undefined') return
  const cache = await caches.open('shared-media')
  for (const key of await cache.keys()) await cache.delete(key)
}

export default function SharePage() {
  const { profile } = useAuth()
  const readOnly = !canEdit(profile)
  const router = useRouter()
  const [files, setFiles] = useState<File[]>([])
  const [sharedText, setSharedText] = useState('')
  const [projects, setProjects] = useState<Proj[]>([])
  const [dest, setDest] = useState<Dest>('project')
  const [projectId, setProjectId] = useState('')
  const [category, setCategory] = useState('공사전사진')
  const [memo, setMemo] = useState('')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  // 채팅으로 보내기 — 'all' | 'room:<방id>' | 'dm:<상대id>'
  const [rooms, setRooms] = useState<{ id: string; name: string }[]>([])
  const [people, setPeople] = useState<{ id: string; name: string }[]>([])
  const [chatTarget, setChatTarget] = useState('all')

  useEffect(() => {
    let active = true
    async function init() {
      const [f, t, p] = await Promise.all([
        readSharedFiles(),
        readSharedText(),
        supabase.from('projects').select('id, name, status').order('created_at', { ascending: false }),
      ])
      if (!active) return
      setFiles(f)
      setSharedText(t)
      // 카톡 등에서 함께 넘어온 텍스트를 사유/메모 칸에 자동 입력
      if (t) { setReason(t); setMemo(t) }
      // 사진 없이 글만 공유된 경우엔 기본 저장처를 출금요청으로
      if (t && f.length === 0) setDest('withdrawal')
      setProjects(p.data || [])
      // 기본 선택은 진행 중인 현장 중 최신 (완료·중단은 목록 아래 묶음으로)
      if (p.data && p.data.length) {
        const firstActive = p.data.find(x => !(HIDDEN_STATUSES as readonly string[]).includes(x.status || ''))
        setProjectId((firstActive || p.data[0]).id)
      }
      setLoading(false)
    }
    init()
    return () => { active = false }
  }, [])

  // 채팅 대상 목록 (내 단체방 + 직원들) — 프로필이 준비되면 로드
  useEffect(() => {
    const me = profile?.id
    if (!me) return
    let on = true
    ;(async () => {
      const { data: mem } = await supabase.from('chat_room_members').select('room_id').eq('user_id', me)
      const ids = (mem || []).map(m => m.room_id)
      if (ids.length) {
        const { data: rs } = await supabase.from('chat_rooms').select('id, name').in('id', ids).order('created_at')
        if (on) setRooms(rs || [])
      }
      const { data: ps } = await supabase.from('profiles').select('id, name').neq('id', me).order('name')
      if (on) setPeople(ps || [])
    })()
    return () => { on = false }
  }, [profile?.id])

  async function uploadOne(file: File, i: number, folder: string) {
    const ext = file.name.split('.').pop() || 'bin'
    const path = `${folder}/${Date.now()}_${i}.${ext}`
    const { error } = await supabase.storage.from('uploads').upload(path, file, {
      contentType: file.type || 'application/octet-stream', upsert: true,
    })
    if (error) { toast('업로드 실패: ' + error.message); return null }
    return supabase.storage.from('uploads').getPublicUrl(path).data.publicUrl
  }

  async function handleUpload() {
    if (readOnly) { toast('외부협력업체 계정은 저장할 수 없습니다.'); return }
    const tooBig = files.filter(f => f.size > 500 * 1024 * 1024)
    if (tooBig.length) { toast(`500MB가 넘는 파일 ${tooBig.length}개는 올릴 수 없어요: ${tooBig[0].name}`, 'error'); return }
    if (files.length === 0 && !sharedText.trim()) return
    if (dest === 'chat') { await shareToChat(); return }
    if (dest === 'project' && !projectId) return
    // 사진 없이 텍스트만 공유한 경우 — 영수증/출금요청에 글만 기록
    if (files.length === 0) {
      setUploading(true)
      const who = profile?.name || ''
      if (dest === 'receipt') {
        await supabase.from('receipts').insert([{ image_url: '', memo: reason || sharedText, uploaded_by: who }])
        notifyOthers(profile?.id, { type: 'receipt', title: '새 영수증 메모', body: reason || sharedText, link: '/receipts' })
      } else {
        await supabase.from('withdrawal_requests').insert([{
          image_url: '', images: [], reason: reason || sharedText, requested_by: who, status: '요청', amount: 0, recipient: '',
        }])
        notifyOthers(profile?.id, { type: 'withdrawal', title: '새 출금요청 메모', body: reason || sharedText, link: '/withdrawals' })
      }
      await clearShared()
      setUploading(false)
      router.push(dest === 'receipt' ? '/receipts' : '/withdrawals')
      return
    }
    setUploading(true)
    const who = profile?.name || ''
    // 3장씩 동시에 올려 속도 개선 (원본 그대로, 순서 유지)
    const wSlots: (string | null)[] = new Array(files.length).fill(null)  // 출금요청: 여러 장을 한 건으로 묶음
    const CONC = 3
    let done = 0
    for (let i = 0; i < files.length; i += CONC) {
      const chunk = files.slice(i, i + CONC)
      await Promise.all(chunk.map(async (file, j) => {
        const idx = i + j
        if (dest === 'project') {
          // 현장 자료는 현장 상세와 같은 최적화 적용: 사진 자동 압축(2400px WebP) + 500px 썸네일 + 용량·지문 기록
          let up = file
          if (isCompressibleImage(file)) { const c = await compressImage(file); if (c !== file) up = c }
          if (/\.pdf$/i.test(up.name)) up = await normalizePdfTitle(up) // PDF 속성 제목 교정
          const ext = up.name.split('.').pop() || 'bin'
          const stamp = `${Date.now()}_${idx}`
          const path = `files/${projectId}/${stamp}.${ext}`
          const { error: upErr } = await supabase.storage.from('uploads').upload(path, up, {
            contentType: up.type || 'application/octet-stream', upsert: true,
          })
          if (upErr) { toast('업로드 실패: ' + upErr.message); return }
          const url = supabase.storage.from('uploads').getPublicUrl(path).data.publicUrl
          let thumb_url: string | null = null
          if (isCompressibleImage(up)) {
            const th = await makeThumbnail(up)
            if (th) {
              const tPath = `files/${projectId}/thumbs/${stamp}.${th.name.split('.').pop()}`
              const { error: thErr } = await supabase.storage.from('uploads').upload(tPath, th, { contentType: th.type, upsert: true })
              if (!thErr) thumb_url = supabase.storage.from('uploads').getPublicUrl(tPath).data.publicUrl
            }
          }
          // 폰 공유로 이름이 image.jpg 등으로 바뀐 사진은 촬영시각 이름으로 — NAS 날짜순 정렬 유지
          const isMedia = (file.type || '').startsWith('image/') || (file.type || '').startsWith('video/') || isCompressibleImage(file)
          const displayName = isMedia ? dateStampedName(file, ext, idx) : file.name
          const baseRow = {
            project_id: projectId, file_name: displayName, file_url: url,
            file_type: up.type || '', category, memo: memo || '', uploaded_by: who,
          }
          let { error: insErr } = await supabase.from('project_files').insert([{
            ...baseRow, thumb_url, file_size: up.size, file_hash: await hashFile(file) || null,
          }])
          if (insErr && /column|thumb_url|file_size|file_hash/i.test(insErr.message)) {
            ;({ error: insErr } = await supabase.from('project_files').insert([baseRow]))
          }
          if (insErr) toast('저장 실패: ' + insErr.message)
        } else if (dest === 'receipt') {
          const url = await uploadOne(file, idx, 'receipts')
          if (url) await supabase.from('receipts').insert([{ image_url: url, memo: reason || '', uploaded_by: who }])
        } else {
          const url = await uploadOne(file, idx, 'withdrawals')
          if (url) wSlots[idx] = url
        }
        done++
        setProgress(Math.round((done / files.length) * 100))
      }))
    }
    const wUrls = wSlots.filter(Boolean) as string[]
    if (dest === 'withdrawal' && wUrls.length > 0) {
      await supabase.from('withdrawal_requests').insert([{
        image_url: wUrls[0], images: wUrls, reason: reason || '', requested_by: who, status: '요청', amount: 0, recipient: '',
      }])
    }
    setProgress(100)
    if (dest === 'project') {
      const proj = projects.find(p => p.id === projectId)
      notifyOthers(profile?.id, { type: 'file', title: `${proj?.name || '현장'} · 공유 자료 ${files.length}건`, body: `${category} 자료가 추가되었습니다`, link: `/projects/${projectId}?tab=자료` })
    } else if (dest === 'receipt') {
      notifyOthers(profile?.id, { type: 'receipt', title: `새 영수증 ${files.length}건`, body: reason || '영수증이 등록되었습니다', link: '/receipts' })
    } else {
      notifyOthers(profile?.id, { type: 'withdrawal', title: `새 출금요청 ${files.length}건`, body: reason || '출금요청이 등록되었습니다', link: '/withdrawals' })
    }
    await clearShared()
    setUploading(false)
    router.push(dest === 'project' ? `/projects/${projectId}` : dest === 'receipt' ? '/receipts' : '/withdrawals')
  }

  // 채팅으로 보내기 — 문자 캡처 등 공유받은 사진·글을 대화방에 바로 전송
  async function shareToChat() {
    const me = profile?.id
    if (!me) return
    setUploading(true)
    const [kind, tid] = chatTarget === 'all' ? (['all', ''] as const) : (chatTarget.split(':') as ['room' | 'dm', string])
    const recipient_id = kind === 'dm' ? tid : null
    const room_id = kind === 'room' ? tid : null
    const base = { sender_id: me, sender_name: profile?.name || '직원', recipient_id, room_id }
    if (sharedText.trim()) {
      await supabase.from('messages').insert([{ ...base, content: sharedText.trim() }])
    }
    const imgs = files.filter(f => (f.type || '').startsWith('image/'))
    const others = files.filter(f => !(f.type || '').startsWith('image/'))
    const urls: string[] = []
    let done = 0
    for (const f of imgs) {
      const c = await compressImage(f)
      const ext = c.name.split('.').pop() || 'jpg'
      const path = `chat/${Date.now()}_${done}.${ext}`
      const { error } = await supabase.storage.from('uploads').upload(path, c, { contentType: c.type || 'image/jpeg', upsert: true })
      if (!error) urls.push(supabase.storage.from('uploads').getPublicUrl(path).data.publicUrl)
      done++; setProgress(Math.round((done / Math.max(files.length, 1)) * 100))
    }
    if (urls.length) {
      await supabase.from('messages').insert([{ ...base, content: '', image_url: urls[0], images: urls.length > 1 ? urls : null }])
    }
    for (const f of others) {
      let up = f
      if (/\.pdf$/i.test(up.name)) up = await normalizePdfTitle(up)
      const ext = up.name.split('.').pop() || 'bin'
      const path = `chat/${Date.now()}_${done}.${ext}`
      const { error } = await supabase.storage.from('uploads').upload(path, up, { contentType: up.type || 'application/octet-stream', upsert: true })
      if (!error) await supabase.from('messages').insert([{
        ...base, content: '', file_url: supabase.storage.from('uploads').getPublicUrl(path).data.publicUrl, file_name: up.name,
      }])
      done++; setProgress(Math.round((done / Math.max(files.length, 1)) * 100))
    }
    // 알림 (전체 채팅은 알림 없음 — 채팅 화면과 동일 정책)
    const body = sharedText.trim().slice(0, 40) || (urls.length ? `📷 사진 ${urls.length}장` : others.length ? '📎 ' + others[0].name : '공유')
    if (kind === 'dm' && tid !== me) notifyDM(tid, `${profile?.name || '직원'} 님의 메시지`, body, `/chat?dm=${me}`)
    else if (kind === 'room') {
      const r = rooms.find(x => x.id === tid)
      notifyRoom(tid, `${r?.name || '채팅방'} · ${profile?.name || '직원'}`, body, `/chat?room=${tid}`)
    }
    await clearShared()
    setUploading(false)
    router.push(kind === 'dm' ? `/chat?dm=${tid}` : kind === 'room' ? `/chat?room=${tid}` : '/chat')
  }

  const destBtn = (d: Dest, label: string) => (
    <button type="button" onClick={() => setDest(d)}
      className={`flex-1 py-2.5 rounded-lg text-sm font-medium border ${dest === d ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-300'}`}>
      {label}
    </button>
  )

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <header className="bg-white border-b border-gray-200 px-4 md:px-8 py-4 md:py-5 flex-shrink-0">
          <h1 className="text-xl font-bold text-gray-900">공유 자료 저장</h1>
          <p className="text-sm text-gray-500 mt-0.5">다른 앱에서 공유한 사진/영상을 바로 저장</p>
        </header>

        <div className="flex-1 overflow-auto px-4 md:px-8 py-4 md:py-6 pb-20 md:pb-24">
          {loading ? (
            <div className="text-center text-gray-400 py-16">불러오는 중...</div>
          ) : files.length === 0 && !sharedText ? (
            <div className="bg-white rounded-xl border border-gray-200 text-center py-16 text-gray-400">
              <p className="text-3xl mb-2">📤</p>
              <p>공유된 내용이 없어요.</p>
              <p className="text-xs mt-1">카톡 등에서 사진이나 글을 공유 → 더보기 → JM관리 를 선택해 주세요.</p>
            </div>
          ) : (
            <div className="max-w-lg flex flex-col gap-4">
              {files.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-sm font-semibold text-gray-700 mb-2">공유된 파일 {files.length}개</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {files.slice(0, 8).map((f, i) => (
                    <div key={i} className="aspect-square bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden">
                      {f.type.startsWith('image') ? (
                        <Image src={URL.createObjectURL(f)} alt="" width={160} height={160} unoptimized className="w-full h-full object-cover" />
                      ) : f.type.startsWith('video') ? (
                        <span className="text-2xl">🎬</span>
                      ) : (
                        <span className="text-2xl">📄</span>
                      )}
                    </div>
                  ))}
                  {files.length > 8 && (
                    <div className="aspect-square bg-gray-50 rounded-lg flex items-center justify-center text-xs text-gray-500">+{files.length - 8}</div>
                  )}
                </div>
              </div>
              )}

              {sharedText && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <p className="text-sm font-semibold text-amber-800 mb-1">📝 공유된 글</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{sharedText}</p>
                  <p className="text-xs text-amber-600 mt-1.5">아래 사유/메모 칸에 자동으로 채워뒀어요. 수정 가능합니다.</p>
                </div>
              )}

              {/* 어디에 저장할지 */}
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">어디에 저장할까요?</label>
                <div className="flex gap-2">
                  {files.length > 0 && destBtn('project', '현장 자료')}
                  {destBtn('chat', '💬 채팅')}
                  {destBtn('withdrawal', '출금요청')}
                </div>
              </div>

              {dest === 'project' ? (
                <>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1.5">저장할 현장 *</label>
                    <select value={projectId} onChange={e => setProjectId(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                      {projects.length === 0 && <option value="">현장이 없습니다</option>}
                      <optgroup label="🏗️ 진행 중인 현장">
                        {projects.filter(p => !(HIDDEN_STATUSES as readonly string[]).includes(p.status || '')).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </optgroup>
                      {projects.some(p => (HIDDEN_STATUSES as readonly string[]).includes(p.status || '')) && (
                        <optgroup label="✅ 완료·중단된 현장">
                          {projects.filter(p => (HIDDEN_STATUSES as readonly string[]).includes(p.status || '')).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </optgroup>
                      )}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1.5">분류</label>
                    <select value={category} onChange={e => setCategory(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                      {CATEGORY_LIST.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1.5">
                      구역/공간 <span className="text-gray-400 font-normal">(선택 · 같은 이름끼리 묶여요)</span>
                    </label>
                    <input value={memo} onChange={e => setMemo(e.target.value)}
                      placeholder="예) 거실, 화장실, 1층"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                  </div>
                </>
              ) : dest === 'chat' ? (
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1.5">보낼 대화방 *</label>
                  <select value={chatTarget} onChange={e => setChatTarget(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                    <option value="all">💬 전체 채팅방</option>
                    {rooms.length > 0 && (
                      <optgroup label="단체방">
                        {rooms.map(r => <option key={r.id} value={'room:' + r.id}># {r.name}</option>)}
                      </optgroup>
                    )}
                    {profile?.id && <option value={'dm:' + profile.id}>🔒 나와의 채팅 (보관)</option>}
                    {people.length > 0 && (
                      <optgroup label="직원 1:1">
                        {people.map(p => <option key={p.id} value={'dm:' + p.id}>👤 {p.name}</option>)}
                      </optgroup>
                    )}
                  </select>
                  <p className="text-[11px] text-gray-400 mt-1.5">사진은 한 묶음으로, 함께 공유된 글은 메시지로 같이 전송돼요.</p>
                </div>
              ) : (
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1.5">
                    {dest === 'withdrawal' ? '사유 / 메모' : '메모'} <span className="text-gray-400 font-normal">(선택)</span>
                  </label>
                  <textarea value={reason} onChange={e => setReason(e.target.value)} rows={4}
                    placeholder={dest === 'withdrawal' ? '예) OO현장 자재대금 송금' : '예) OO현장 자재 영수증'}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-y leading-relaxed" />
                </div>
              )}

              {uploading && (
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div className="bg-green-500 h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
                </div>
              )}

              {readOnly ? (
                <p className="text-center text-sm text-gray-400 py-3">외부협력업체 계정은 저장할 수 없습니다.</p>
              ) : (
                <button onClick={handleUpload} disabled={uploading || (dest === 'project' && !projectId)}
                  className="bg-green-600 text-white py-3 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                  {uploading ? `업로드 중... ${progress}%` : dest === 'chat' ? '💬 채팅으로 보내기' : files.length > 0 ? `${files.length}개 저장하기` : '글 저장하기'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
