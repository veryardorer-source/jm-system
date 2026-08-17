'use client'

import { useEffect, useState, useRef } from 'react'
import { toast } from '@/components/Toaster'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { supabase } from '@/lib/supabase'
import { useAuth, canEdit } from '@/lib/auth-context'
import { notifyOthers } from '@/lib/notify'
import LinkPreview from '@/components/LinkPreview'
import { compressImage } from '@/lib/image'
import { viewInBrowser } from '@/lib/media'

// 내용 속 URL을 클릭 가능한 링크로
function renderContent(t: string) {
  return t.split(/(https?:\/\/[^\s]+)/g).map((p, i) =>
    /^https?:\/\//.test(p)
      ? <a key={i} href={p} target="_blank" rel="noreferrer" className="text-green-700 underline break-all">{p}</a>
      : <span key={i}>{p}</span>)
}

type Notice = {
  id: string
  title: string
  content: string
  category: string
  author: string
  images?: string[] | null   // 첨부 이미지 (캡처 붙여넣기 등)
  files?: { name: string; url: string }[] | null   // 첨부 파일 (PDF·엑셀 등)
  created_at: string
}

const CATEGORIES = ['전체', '사용법', '디자인팀', '현장팀']

const CATEGORY_COLOR: Record<string, string> = {
  '전체':    'bg-gray-100 text-gray-700 border-gray-200',
  '사용법':  'bg-amber-100 text-amber-700 border-amber-200',
  '디자인팀': 'bg-purple-100 text-purple-700 border-purple-200',
  '현장팀':  'bg-green-100 text-green-700 border-blue-200',
}

const EMPTY_FORM = { title: '', content: '', category: '전체', author: '' }

export default function NoticesPage() {
  const { profile } = useAuth()
  const readOnly = !canEdit(profile)
  const [notices, setNotices] = useState<Notice[]>([])
  const [filter, setFilter] = useState('전체')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [selected, setSelected] = useState<Notice | null>(null)
  const [editing, setEditing] = useState<Notice | null>(null) // 수정 중인 공지
  // 이미지 첨부 (캡처 Ctrl+V·파일 선택)
  const [imgFiles, setImgFiles] = useState<File[]>([])
  const [existingImgs, setExistingImgs] = useState<string[]>([])
  const [imgView, setImgView] = useState<string | null>(null) // 이미지 크게 보기
  // 파일 첨부 (PDF·엑셀 등 — 선택·드래그·복사한 파일 Ctrl+V)
  const [attachFiles, setAttachFiles] = useState<File[]>([])
  const [existingFiles, setExistingFiles] = useState<{ name: string; url: string }[]>([])
  const [formDrag, setFormDrag] = useState(false)
  const contentRef = useRef<HTMLTextAreaElement>(null)
  const addIncomingRef = useRef<(fs: File[]) => void>(() => {})

  useEffect(() => { fetchNotices() }, [])

  // 알림에서 특정 공지 링크(?open=id)로 들어오면 그 공지를 바로 열기 — 렌더 중 보정 패턴(같은 링크는 1회만)
  const searchParams = useSearchParams()
  const [openedId, setOpenedId] = useState('')
  {
    const openId = searchParams.get('open')
    if (!loading && openId && openedId !== openId) {
      const n = notices.find(x => x.id === openId)
      if (n) { setOpenedId(openId); setSelected(n) }
    }
  }

  async function fetchNotices() {
    setLoading(true)
    const { data } = await supabase.from('notices').select('*').order('created_at', { ascending: false })
    setNotices(data || [])
    setLoading(false)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    // 첨부 이미지 업로드 (캡처는 크기 축소해 빠르게)
    const uploaded: string[] = []
    for (let i = 0; i < imgFiles.length; i++) {
      const file = await compressImage(imgFiles[i])
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `notices/${Date.now()}_${i}.${ext}`
      const { error: upErr } = await supabase.storage.from('uploads').upload(path, file, { contentType: file.type || 'image/jpeg', upsert: true })
      if (upErr) { toast('이미지 업로드 실패: ' + upErr.message); setSaving(false); return }
      uploaded.push(supabase.storage.from('uploads').getPublicUrl(path).data.publicUrl)
    }
    const images = [...existingImgs, ...uploaded]
    // 첨부 파일 업로드 (PDF·엑셀 등 — 원본 파일명 유지)
    const upFiles: { name: string; url: string }[] = []
    for (let i = 0; i < attachFiles.length; i++) {
      const f = attachFiles[i]
      const ext = f.name.split('.').pop() || 'bin'
      const path = `notices/files/${Date.now()}_${i}.${ext}`
      const { error: upErr } = await supabase.storage.from('uploads').upload(path, f, { contentType: f.type || 'application/octet-stream', upsert: true })
      if (upErr) { toast('파일 업로드 실패: ' + upErr.message); setSaving(false); return }
      upFiles.push({ name: f.name, url: supabase.storage.from('uploads').getPublicUrl(path).data.publicUrl })
    }
    const files = [...existingFiles, ...upFiles]
    const colHint = (msg: string) =>
      msg.includes('files') ? '\n(관리자에게: db/notice_files.sql 실행 필요)'
      : msg.includes('images') ? '\n(관리자에게: notices에 images 컬럼 추가 SQL 실행 필요)' : ''
    let createdId: string | null = null
    if (editing) {
      const { error } = await supabase.from('notices').update({ title: form.title, content: form.content, category: form.category, author: form.author, images, files }).eq('id', editing.id)
      if (error) { toast('저장 실패: ' + error.message + colHint(error.message)); setSaving(false); return }
    } else {
      const { data: created, error } = await supabase.from('notices').insert([{ ...form, images, files }]).select('id').single()
      if (error) { toast('저장 실패: ' + error.message + colHint(error.message)); setSaving(false); return }
      createdId = created?.id || null
    }
    if (!editing) notifyOthers(profile?.id, { type: 'notice', title: `새 공지 · ${form.title}`, body: form.category, link: createdId ? `/notices?open=${createdId}` : '/notices' })
    setForm(EMPTY_FORM)
    setImgFiles([])
    setExistingImgs([])
    setAttachFiles([])
    setExistingFiles([])
    setEditing(null)
    setShowForm(false)
    setSaving(false)
    fetchNotices()
  }

  function startEdit(n: Notice) {
    setEditing(n)
    setForm({ title: n.title, content: n.content, category: n.category, author: n.author || '' })
    setExistingImgs(n.images || [])
    setImgFiles([])
    setExistingFiles(n.files || [])
    setAttachFiles([])
    setSelected(null)
    setShowForm(true)
  }

  // 이미지 추가 — 블로그처럼 글 속 커서 위치에 [사진N] 표시를 넣고, 그 자리에 이미지가 보이게
  function addImagesWithTokens(fs: File[]) {
    if (!fs.length) return
    const startIdx = existingImgs.length + imgFiles.length
    const tokens = fs.map((_, i) => `[사진${startIdx + i + 1}]`).join('\n')
    const ta = contentRef.current
    const pos = ta && document.activeElement === ta ? ta.selectionStart : form.content.length
    const before = form.content.slice(0, pos)
    const after = form.content.slice(pos)
    const sep1 = before && !before.endsWith('\n') ? '\n' : ''
    const sep2 = after && !after.startsWith('\n') ? '\n' : ''
    setForm({ ...form, content: before + sep1 + tokens + sep2 + after })
    setImgFiles(prev => [...prev, ...fs])
  }

  // 받은 파일 분배 — 이미지는 글 속 [사진N]으로, 나머지(PDF 등)는 첨부 파일로
  function addIncoming(fs: File[]) {
    if (!fs.length) return
    const imgs = fs.filter(f => (f.type || '').startsWith('image/'))
    const rest = fs.filter(f => !(f.type || '').startsWith('image/'))
    if (imgs.length) addImagesWithTokens(imgs)
    if (rest.length) setAttachFiles(prev => [...prev, ...rest])
  }
  useEffect(() => { addIncomingRef.current = addIncoming })

  // 등록/수정 창이 열려 있는 동안 Ctrl+V — 캡처(스크린샷)는 물론 복사한 파일(PDF 등)도 첨부
  useEffect(() => {
    if (!showForm) return
    const onPaste = (e: ClipboardEvent) => {
      const items = Array.from(e.clipboardData?.items || []).filter(it => it.kind === 'file')
      if (!items.length) return
      e.preventDefault()
      const fs = items.map(it => it.getAsFile()).filter(Boolean) as File[]
      if (fs.length) addIncomingRef.current(fs)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [showForm])

  async function handleDelete(id: string) {
    if (!confirm('공지를 삭제할까요?')) return
    await supabase.from('notices').delete().eq('id', id)
    setSelected(null)
    fetchNotices()
  }

  // 외부협력업체는 '사용법' 공지만 볼 수 있음
  const scoped = readOnly ? notices.filter(n => n.category === '사용법') : notices
  const filtered = scoped.filter(n => filter === '전체' || n.category === filter)

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <header className="bg-white border-b border-gray-200 px-4 md:px-8 py-4 md:py-5 flex items-center justify-between flex-shrink-0">
          <div>
            <h1 className="text-xl font-bold text-gray-900">공지사항</h1>
            <p className="text-sm text-gray-500 mt-0.5">전체 {scoped.length}개</p>
          </div>
          {!readOnly && (
            <button onClick={() => { setEditing(null); setForm(EMPTY_FORM); setImgFiles([]); setExistingImgs([]); setAttachFiles([]); setExistingFiles([]); setShowForm(true) }}
              className="bg-green-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-green-700">
              + 공지 등록
            </button>
          )}
        </header>

        {/* 카테고리 필터 (외부협력업체는 사용법만 보여 필터 숨김) */}
        {!readOnly && (
        <div className="bg-white border-b border-gray-200 px-4 md:px-8 py-3 flex gap-2 overflow-x-auto flex-shrink-0">
          {CATEGORIES.map(c => (
            <button key={c} onClick={() => setFilter(c)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                filter === c ? CATEGORY_COLOR[c] : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
              }`}>
              {c}
              <span className="ml-1.5 text-xs opacity-70">
                ({c === '전체' ? notices.length : notices.filter(n => n.category === c).length})
              </span>
            </button>
          ))}
        </div>
        )}

        <div className="flex-1 overflow-auto px-4 md:px-8 py-4 md:py-6 pb-20 md:pb-24">
          {loading ? (
            <div className="text-center py-16 text-gray-400">불러오는 중...</div>
          ) : filtered.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 text-center py-16 text-gray-400">
              <p className="text-4xl mb-3">📢</p>
              <p className="font-medium">등록된 공지가 없어요</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {filtered.map(n => (
                <div key={n.id} onClick={() => setSelected(n)}
                  className="bg-white rounded-xl border border-gray-200 px-6 py-4 hover:border-green-300 hover:shadow-sm transition-all cursor-pointer">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${CATEGORY_COLOR[n.category]}`}>
                          {n.category}
                        </span>
                        {n.author && <span className="text-xs text-gray-400">{n.author}</span>}
                      </div>
                      <p className="font-semibold text-gray-900">{n.title}{n.images && n.images.length > 0 && <span className="ml-1.5 text-xs text-gray-400">📷 {n.images.length}</span>}{n.files && n.files.length > 0 && <span className="ml-1.5 text-xs text-gray-400">📎 {n.files.length}</span>}</p>
                      <p className="text-sm text-gray-500 mt-1 line-clamp-2">{n.content}</p>
                    </div>
                    <span className="text-xs text-gray-400 flex-shrink-0 mt-1">
                      {new Date(n.created_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 공지 상세 모달 */}
      {selected && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${CATEGORY_COLOR[selected.category]}`}>
                  {selected.category}
                </span>
                {selected.author && <span className="text-sm text-gray-500">{selected.author}</span>}
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 text-2xl">&times;</button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <h2 className="text-lg font-bold text-gray-900 mb-4">{selected.title}</h2>
              {(() => {
                const imgs = selected.images || []
                const used = new Set<number>()
                // 글 속 [사진N] 자리에 이미지를 끼워 넣기 (블로그식)
                const nodes = (selected.content || '').split(/(\[사진\d+\])/g).map((p, i) => {
                  const m = p.match(/^\[사진(\d+)\]$/)
                  if (m) {
                    const idx = Number(m[1]) - 1
                    const u = imgs[idx]
                    if (u) {
                      used.add(idx)
                      return <Image key={i} src={u} alt="" width={640} height={480} unoptimized loading="lazy" onClick={() => setImgView(u)}
                        className="block w-full max-w-md rounded-lg border border-gray-200 my-2 cursor-pointer hover:opacity-90" />
                    }
                    return null
                  }
                  return <span key={i}>{renderContent(p)}</span>
                })
                const rest = imgs.filter((_, i) => !used.has(i))
                return (
                  <>
                    <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{nodes}</div>
                    {rest.length > 0 && (
                      <div className="grid grid-cols-2 gap-2 mt-4">
                        {rest.map((u, i) => (
                          <Image key={i} src={u} alt="" width={640} height={480} unoptimized loading="lazy" onClick={() => setImgView(u)}
                            className="w-full rounded-lg border border-gray-200 cursor-pointer hover:opacity-90" />
                        ))}
                      </div>
                    )}
                  </>
                )
              })()}
              {(selected.files || []).length > 0 && (
                <div className="mt-4 flex flex-col gap-1.5">
                  {(selected.files || []).map((f, i) => (
                    <div key={i} onClick={() => viewInBrowser(f.url, f.name)}
                      className="flex items-center gap-2 w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-700 hover:border-green-300 hover:bg-green-50 transition-colors cursor-pointer">
                      <span className="flex-shrink-0">📎</span>
                      <span className="flex-1 truncate font-medium">{f.name}</span>
                      <a href={f.url} download={f.name} onClick={e => e.stopPropagation()}
                        className="flex-shrink-0 text-xs text-gray-400 hover:text-green-600 px-1.5 py-0.5 rounded border border-gray-200">저장</a>
                    </div>
                  ))}
                </div>
              )}
              {(() => { const u = (selected.content || '').match(/https?:\/\/[^\s]+/)?.[0]; return u ? <div className="mt-3"><LinkPreview url={u} /></div> : null })()}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
              <span className="text-xs text-gray-400">
                {new Date(selected.created_at).toLocaleString('ko-KR')}
              </span>
              {!readOnly && (
                <div className="flex items-center gap-1.5">
                  <button onClick={() => startEdit(selected)}
                    className="text-xs text-green-600 hover:text-green-700 hover:bg-green-50 px-3 py-1.5 rounded-lg transition-colors border border-green-200">
                    ✏ 수정
                  </button>
                  <button onClick={() => handleDelete(selected.id)}
                    className="text-xs text-red-400 hover:text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors">
                    삭제
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 공지 등록 모달 */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className={`bg-white rounded-2xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto ${formDrag ? 'ring-2 ring-green-500' : ''}`}
            onDragOver={e => { if (Array.from(e.dataTransfer.types).includes('Files')) { e.preventDefault(); setFormDrag(true) } }}
            onDragLeave={() => setFormDrag(false)}
            onDrop={e => { if (!Array.from(e.dataTransfer.types).includes('Files')) return; e.preventDefault(); setFormDrag(false); addIncoming(Array.from(e.dataTransfer.files)) }}>
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 sticky top-0 bg-white">
              <h2 className="text-lg font-bold">{editing ? '공지 수정' : '공지 등록'}</h2>
              <button onClick={() => { setShowForm(false); setForm(EMPTY_FORM); setEditing(null); setImgFiles([]); setExistingImgs([]); setAttachFiles([]); setExistingFiles([]) }} className="text-gray-400 text-2xl">&times;</button>
            </div>
            <form onSubmit={handleCreate} className="px-6 py-5 flex flex-col gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">카테고리</label>
                <div className="flex gap-2">
                  {CATEGORIES.map(c => (
                    <button key={c} type="button" onClick={() => setForm({...form, category: c})}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        form.category === c ? CATEGORY_COLOR[c] : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                      }`}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">제목 *</label>
                <input required value={form.title} onChange={e => setForm({...form, title: e.target.value})}
                  placeholder="공지 제목"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">내용 *</label>
                <textarea required ref={contentRef} value={form.content} onChange={e => setForm({...form, content: e.target.value})}
                  placeholder="공지 내용을 입력하세요. 글 쓰다가 캡처를 Ctrl+V 하면 그 위치에 [사진1]이 들어가고, 볼 때 그 자리에 이미지가 나와요 (블로그처럼 글·사진 번갈아 작성 가능). PDF 등 파일도 드래그하거나 복사해서 Ctrl+V로 첨부돼요. 링크도 붙여넣으면 클릭돼요."
                  rows={6}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">사진·파일 첨부 <span className="text-gray-400 font-normal">(사진은 글 속 [사진N] 위치에, PDF 등 파일은 아래 첨부로)</span></label>
                <label className="flex items-center justify-center w-full border-2 border-dashed border-gray-300 rounded-lg py-3 text-sm text-gray-500 cursor-pointer hover:border-green-400 text-center">
                  클릭 선택 · 드래그 · 캡처나 복사한 파일 <span className="text-green-600 font-medium ml-1">Ctrl+V</span>
                  <input type="file" multiple className="hidden"
                    onChange={e => { const fs = Array.from(e.target.files || []); if (fs.length) addIncoming(fs); e.currentTarget.value = '' }} />
                </label>
                {(existingImgs.length > 0 || imgFiles.length > 0) && (
                  <div className="grid grid-cols-4 gap-2 mt-2">
                    {existingImgs.map((u, i) => (
                      <div key={'e' + i} className="relative aspect-square">
                        <Image src={u} alt="" width={160} height={160} unoptimized className="w-full h-full object-cover rounded-lg border border-gray-200" />
                        <span className="absolute bottom-0.5 left-0.5 bg-black/60 text-white text-[10px] px-1 rounded">사진{i + 1}</span>
                        <button type="button" onClick={() => setExistingImgs(prev => prev.filter(x => x !== u))}
                          className="absolute -top-1.5 -right-1.5 bg-black/70 text-white w-5 h-5 rounded-full text-xs leading-none">×</button>
                      </div>
                    ))}
                    {imgFiles.map((f, i) => (
                      <div key={'n' + i} className="relative aspect-square">
                        <Image src={URL.createObjectURL(f)} alt="" width={160} height={160} unoptimized className="w-full h-full object-cover rounded-lg border border-green-300" />
                        <span className="absolute bottom-0.5 left-0.5 bg-black/60 text-white text-[10px] px-1 rounded">사진{existingImgs.length + i + 1}</span>
                        <button type="button" onClick={() => setImgFiles(prev => prev.filter((_, j) => j !== i))}
                          className="absolute -top-1.5 -right-1.5 bg-black/70 text-white w-5 h-5 rounded-full text-xs leading-none">×</button>
                      </div>
                    ))}
                  </div>
                )}
                {(existingImgs.length > 0 || imgFiles.length > 0) && (
                  <p className="text-[11px] text-gray-400 mt-1">이미지를 삭제하면 뒷번호가 하나씩 당겨지니, 글 속 [사진N] 번호도 함께 확인하세요.</p>
                )}
                {(existingFiles.length > 0 || attachFiles.length > 0) && (
                  <div className="flex flex-col gap-1.5 mt-2">
                    {existingFiles.map((f, i) => (
                      <div key={'ef' + i} className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700">
                        <span className="flex-shrink-0">📎</span>
                        <span className="flex-1 truncate">{f.name}</span>
                        <button type="button" onClick={() => setExistingFiles(prev => prev.filter((_, j) => j !== i))}
                          className="flex-shrink-0 text-gray-400 hover:text-red-500 text-lg leading-none">×</button>
                      </div>
                    ))}
                    {attachFiles.map((f, i) => (
                      <div key={'nf' + i} className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm text-gray-700">
                        <span className="flex-shrink-0">📎</span>
                        <span className="flex-1 truncate">{f.name}</span>
                        <span className="flex-shrink-0 text-xs text-gray-400">{(f.size / 1024 / 1024).toFixed(1)}MB</span>
                        <button type="button" onClick={() => setAttachFiles(prev => prev.filter((_, j) => j !== i))}
                          className="flex-shrink-0 text-gray-400 hover:text-red-500 text-lg leading-none">×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">작성자</label>
                <input value={form.author} onChange={e => setForm({...form, author: e.target.value})}
                  placeholder="홍길동"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div className="flex gap-3 mt-2">
                <button type="button" onClick={() => { setShowForm(false); setForm(EMPTY_FORM); setEditing(null); setImgFiles([]); setExistingImgs([]); setAttachFiles([]); setExistingFiles([]) }}
                  className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm font-medium">취소</button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-green-600 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
                  {saving ? '저장 중...' : editing ? '수정 저장' : '등록'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 첨부 이미지 크게 보기 */}
      {imgView && (
        <div className="fixed inset-0 bg-black/90 z-[70] flex items-center justify-center p-4" onClick={() => setImgView(null)}>
          <Image src={imgView} alt="" width={1600} height={1200} unoptimized onClick={e => e.stopPropagation()} className="w-auto h-auto max-w-full max-h-[90vh] object-contain rounded-lg" />
          <button onClick={() => setImgView(null)} className="absolute top-4 right-4 text-white text-3xl leading-none">&times;</button>
        </div>
      )}
    </div>
  )
}

