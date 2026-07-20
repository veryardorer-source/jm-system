'use client'

import { useEffect, useState } from 'react'
import Sidebar from '@/components/Sidebar'
import { supabase } from '@/lib/supabase'
import { useAuth, canEdit } from '@/lib/auth-context'
import { notifyOthers } from '@/lib/notify'
import LinkPreview from '@/components/LinkPreview'
import { compressImage } from '@/lib/image'

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

  useEffect(() => { fetchNotices() }, [])

  // 알림에서 특정 공지 링크(?open=id)로 들어오면 그 공지를 바로 열기
  const openedFromLink = useState({ done: false })[0]
  useEffect(() => {
    if (loading || openedFromLink.done) return
    const id = new URLSearchParams(window.location.search).get('open')
    if (!id) { openedFromLink.done = true; return }
    const n = notices.find(x => x.id === id)
    if (n) { setSelected(n); openedFromLink.done = true }
  }, [loading, notices, openedFromLink])

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
      if (upErr) { alert('이미지 업로드 실패: ' + upErr.message); setSaving(false); return }
      uploaded.push(supabase.storage.from('uploads').getPublicUrl(path).data.publicUrl)
    }
    const images = [...existingImgs, ...uploaded]
    let createdId: string | null = null
    if (editing) {
      const { error } = await supabase.from('notices').update({ title: form.title, content: form.content, category: form.category, author: form.author, images }).eq('id', editing.id)
      if (error) { alert('저장 실패: ' + error.message + (error.message.includes('images') ? '\n(관리자에게: notices에 images 컬럼 추가 SQL 실행 필요)' : '')); setSaving(false); return }
    } else {
      const { data: created, error } = await supabase.from('notices').insert([{ ...form, images }]).select('id').single()
      if (error) { alert('저장 실패: ' + error.message + (error.message.includes('images') ? '\n(관리자에게: notices에 images 컬럼 추가 SQL 실행 필요)' : '')); setSaving(false); return }
      createdId = created?.id || null
    }
    if (!editing) notifyOthers(profile?.id, { type: 'notice', title: `새 공지 · ${form.title}`, body: form.category, link: createdId ? `/notices?open=${createdId}` : '/notices' })
    setForm(EMPTY_FORM)
    setImgFiles([])
    setExistingImgs([])
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
    setSelected(null)
    setShowForm(true)
  }

  // 등록/수정 창이 열려 있는 동안 캡처 붙여넣기(Ctrl+V)로 이미지 추가
  useEffect(() => {
    if (!showForm) return
    const onPaste = (e: ClipboardEvent) => {
      const imgs = Array.from(e.clipboardData?.items || []).filter(it => it.type.startsWith('image/'))
      if (!imgs.length) return
      e.preventDefault()
      const fs = imgs.map(it => it.getAsFile()).filter(Boolean) as File[]
      if (fs.length) setImgFiles(prev => [...prev, ...fs])
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
            <button onClick={() => { setEditing(null); setForm(EMPTY_FORM); setImgFiles([]); setExistingImgs([]); setShowForm(true) }}
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

        <div className="flex-1 overflow-auto px-4 md:px-8 py-4 md:py-6 pb-20 md:pb-6">
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
                      <p className="font-semibold text-gray-900">{n.title}{n.images && n.images.length > 0 && <span className="ml-1.5 text-xs text-gray-400">📷 {n.images.length}</span>}</p>
                      <p className="text-sm text-gray-500 mt-1 line-clamp-2">{n.content}</p>
                    </div>
                    <span className="text-xs text-gray-400 flex-shrink-0 mt-1">
                      {new Date(n.created_at).toLocaleDateString('ko-KR')}
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
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{renderContent(selected.content)}</p>
              {selected.images && selected.images.length > 0 && (
                <div className="grid grid-cols-2 gap-2 mt-4">
                  {selected.images.map((u, i) => (
                    <img key={i} src={u} alt="" loading="lazy" onClick={() => setImgView(u)}
                      className="w-full rounded-lg border border-gray-200 cursor-pointer hover:opacity-90" />
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
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 sticky top-0 bg-white">
              <h2 className="text-lg font-bold">{editing ? '공지 수정' : '공지 등록'}</h2>
              <button onClick={() => { setShowForm(false); setForm(EMPTY_FORM); setEditing(null) }} className="text-gray-400 text-2xl">&times;</button>
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
                <textarea required value={form.content} onChange={e => setForm({...form, content: e.target.value})}
                  placeholder="공지 내용을 입력하세요 (https:// 링크를 붙여넣으면 클릭 가능한 링크로 표시돼요)"
                  rows={6}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">이미지 첨부 <span className="text-gray-400 font-normal">(선택 — 캡처 후 Ctrl+V 붙여넣기 가능)</span></label>
                <label className="flex items-center justify-center w-full border-2 border-dashed border-gray-300 rounded-lg py-3 text-sm text-gray-500 cursor-pointer hover:border-green-400">
                  클릭해서 선택 · 또는 캡처하고 <span className="text-green-600 font-medium ml-1">Ctrl+V</span>
                  <input type="file" multiple accept="image/*" className="hidden"
                    onChange={e => { const fs = Array.from(e.target.files || []); if (fs.length) setImgFiles(prev => [...prev, ...fs]); e.currentTarget.value = '' }} />
                </label>
                {(existingImgs.length > 0 || imgFiles.length > 0) && (
                  <div className="grid grid-cols-4 gap-2 mt-2">
                    {existingImgs.map((u, i) => (
                      <div key={'e' + i} className="relative aspect-square">
                        <img src={u} alt="" className="w-full h-full object-cover rounded-lg border border-gray-200" />
                        <button type="button" onClick={() => setExistingImgs(prev => prev.filter(x => x !== u))}
                          className="absolute -top-1.5 -right-1.5 bg-black/70 text-white w-5 h-5 rounded-full text-xs leading-none">×</button>
                      </div>
                    ))}
                    {imgFiles.map((f, i) => (
                      <div key={'n' + i} className="relative aspect-square">
                        <img src={URL.createObjectURL(f)} alt="" className="w-full h-full object-cover rounded-lg border border-green-300" />
                        <button type="button" onClick={() => setImgFiles(prev => prev.filter((_, j) => j !== i))}
                          className="absolute -top-1.5 -right-1.5 bg-black/70 text-white w-5 h-5 rounded-full text-xs leading-none">×</button>
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
                <button type="button" onClick={() => { setShowForm(false); setForm(EMPTY_FORM); setEditing(null) }}
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
          <img src={imgView} alt="" onClick={e => e.stopPropagation()} className="max-w-full max-h-[90vh] object-contain rounded-lg" />
          <button onClick={() => setImgView(null)} className="absolute top-4 right-4 text-white text-3xl leading-none">&times;</button>
        </div>
      )}
    </div>
  )
}

