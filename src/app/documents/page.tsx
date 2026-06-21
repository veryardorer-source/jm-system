'use client'

import { useEffect, useState } from 'react'
import Sidebar from '@/components/Sidebar'
import { useAuth } from '@/lib/auth-context'
import { supabase, CompanyDocument, DOC_CATEGORY_LIST, DocVisibility } from '@/lib/supabase'

const EMPTY_FORM = { title: '', category: DOC_CATEGORY_LIST[0] as string, visibility: '전체공개' as DocVisibility, memo: '' }

export default function DocumentsPage() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [docs, setDocs] = useState<CompanyDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [lightbox, setLightbox] = useState<string | null>(null)

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<CompanyDocument | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchDocs() }, [])

  async function fetchDocs() {
    setLoading(true)
    const { data } = await supabase.from('company_documents').select('*').order('category').order('created_at', { ascending: false })
    setDocs(data || [])
    setLoading(false)
  }

  const isMobile = () => typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches

  async function downloadFile(doc: CompanyDocument) {
    try {
      const res = await fetch(doc.file_url, { mode: 'cors', credentials: 'omit' })
      if (!res.ok) throw new Error('fetch failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = doc.file_name
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch { window.open(doc.file_url, '_blank') }
  }

  async function shareDoc(doc: CompanyDocument) {
    if (isMobile() && navigator.share) {
      try {
        const res = await fetch(doc.file_url, { mode: 'cors', credentials: 'omit' })
        const blob = await res.blob()
        const fileObj = new File([blob], doc.file_name, { type: blob.type })
        if (navigator.canShare({ files: [fileObj] })) {
          await navigator.share({ files: [fileObj], title: doc.file_name })
          return
        }
      } catch (e: unknown) {
        if (e instanceof Error && e.name === 'AbortError') return
      }
    }
    downloadFile(doc)
  }

  function openDoc(doc: CompanyDocument) {
    const name = doc.file_name?.toLowerCase() || ''
    if (name.endsWith('.pdf')) window.open(`https://docs.google.com/viewer?url=${encodeURIComponent(doc.file_url)}`, '_blank')
    else if (/\.(jpg|jpeg|png|gif|webp|heic)$/.test(name)) setLightbox(doc.file_url)
    else window.open(doc.file_url, '_blank')
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title || (!editing && !file)) return
    setSaving(true)
    let file_url = editing?.file_url || ''
    let file_name = editing?.file_name || ''
    if (file) {
      const ext = file.name.split('.').pop() || 'bin'
      const path = `documents/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('uploads').upload(path, file, {
        contentType: file.type || 'application/octet-stream', upsert: true,
      })
      if (upErr) { alert('업로드 실패: ' + upErr.message); setSaving(false); return }
      const { data } = supabase.storage.from('uploads').getPublicUrl(path)
      file_url = data.publicUrl
      file_name = file.name
    }
    const payload = { title: form.title, category: form.category, visibility: form.visibility, memo: form.memo, file_url, file_name, uploaded_by: profile?.name || '' }
    const { error } = editing
      ? await supabase.from('company_documents').update(payload).eq('id', editing.id)
      : await supabase.from('company_documents').insert([payload])
    if (error) { alert('저장 실패: ' + error.message); setSaving(false); return }
    setForm(EMPTY_FORM); setFile(null); setEditing(null); setShowForm(false); setSaving(false)
    fetchDocs()
  }

  function openEdit(doc: CompanyDocument) {
    setEditing(doc)
    setForm({ title: doc.title, category: doc.category, visibility: doc.visibility, memo: doc.memo || '' })
    setFile(null)
    setShowForm(true)
  }

  async function deleteDoc(doc: CompanyDocument) {
    if (!confirm(`"${doc.title}" 서류를 삭제할까요?`)) return
    if (doc.file_url) {
      const path = doc.file_url.split('/uploads/')[1]
      if (path) await supabase.storage.from('uploads').remove([path])
    }
    await supabase.from('company_documents').delete().eq('id', doc.id)
    fetchDocs()
  }

  if (loading) return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex items-center justify-center text-gray-400">불러오는 중...</div>
    </div>
  )

  const visibleDocs = isAdmin ? docs : docs.filter(d => d.visibility === '전체공개')

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <header className="bg-white border-b border-gray-200 px-4 md:px-8 py-4 md:py-5 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">회사 서류</h1>
            <p className="text-sm text-gray-500 mt-0.5">회사 기본정보 및 서류 보관함</p>
          </div>
          {isAdmin && (
            <button onClick={() => { setEditing(null); setForm(EMPTY_FORM); setFile(null); setShowForm(true) }}
              className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700">
              + 서류 추가
            </button>
          )}
        </header>

        <div className="flex-1 overflow-auto px-4 md:px-8 py-6 pb-20 md:pb-6">
          {visibleDocs.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 text-center py-16 text-gray-400">
              <p className="text-3xl mb-2">🗂️</p><p>등록된 서류가 없어요</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {DOC_CATEGORY_LIST.map(cat => {
                const catDocs = visibleDocs.filter(d => d.category === cat)
                if (catDocs.length === 0) return null
                return (
                  <div key={cat} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                      <span className="text-sm font-semibold text-gray-700">{cat} <span className="text-gray-400 font-normal">({catDocs.length})</span></span>
                    </div>
                    <div>
                      {catDocs.map((d, i) => (
                        <div key={d.id} className={`flex items-center gap-3 px-4 py-3 hover:bg-gray-50 ${i > 0 ? 'border-t border-gray-100' : ''}`}>
                          <span className="text-lg flex-shrink-0">📄</span>
                          <button onClick={() => openDoc(d)} className="flex-1 min-w-0 text-left">
                            <p className="text-sm font-medium text-gray-800 hover:text-green-600 truncate">{d.title}</p>
                            {d.memo && <p className="text-xs text-gray-400">{d.memo}</p>}
                          </button>
                          {isAdmin && (
                            <span className={`text-xs px-2 py-1 rounded-full font-medium flex-shrink-0 ${d.visibility === '전체공개' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                              {d.visibility}
                            </span>
                          )}
                          <button onClick={() => shareDoc(d)} className="text-xs text-blue-400 hover:text-blue-600 flex-shrink-0">내보내기</button>
                          <button onClick={() => downloadFile(d)} className="text-xs text-gray-400 hover:text-green-600 flex-shrink-0">저장</button>
                          {isAdmin && (
                            <>
                              <button onClick={() => openEdit(d)} className="text-xs text-green-500 hover:text-green-700 flex-shrink-0">수정</button>
                              <button onClick={() => deleteDoc(d)} className="text-xs text-red-400 hover:text-red-600 flex-shrink-0">삭제</button>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* 추가/수정 모달 */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 sticky top-0 bg-white">
              <h2 className="text-lg font-bold">{editing ? '서류 수정' : '서류 추가'}</h2>
              <button onClick={() => { setShowForm(false); setEditing(null); setForm(EMPTY_FORM); setFile(null) }} className="text-gray-400 text-2xl">&times;</button>
            </div>
            <form onSubmit={handleSave} className="px-6 py-5 flex flex-col gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">제목 *</label>
                <input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                  placeholder="사업자등록증"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">분류</label>
                <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                  {DOC_CATEGORY_LIST.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">공개 범위 *</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['전체공개', '관리자만'] as const).map(v => (
                    <button key={v} type="button" onClick={() => setForm({ ...form, visibility: v })}
                      className={`py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                        form.visibility === v
                          ? v === '전체공개' ? 'bg-green-600 text-white border-green-600' : 'bg-red-500 text-white border-red-500'
                          : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}>
                      {v}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-1">관리자만: 일반 직원에게는 이 서류가 보이지 않습니다</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">
                  파일 {editing ? <span className="text-gray-400 font-normal">(변경 시에만 선택, 현재: {editing.file_name})</span> : '*'}
                </label>
                <input type="file" onChange={e => setFile(e.target.files?.[0] || null)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-green-50 file:text-green-700 file:text-xs" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">메모</label>
                <input value={form.memo} onChange={e => setForm({ ...form, memo: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div className="flex gap-3 mt-2">
                <button type="button" onClick={() => { setShowForm(false); setEditing(null); setForm(EMPTY_FORM); setFile(null) }}
                  className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm font-medium">취소</button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-green-600 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
                  {saving ? '저장 중...' : editing ? '수정' : '추가'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 사진 크게 보기 */}
      {lightbox && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" className="max-w-full max-h-full object-contain rounded-lg" />
          <button className="absolute top-4 right-4 text-white text-3xl leading-none">&times;</button>
        </div>
      )}
    </div>
  )
}
