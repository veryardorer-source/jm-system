'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import Sidebar from '@/components/Sidebar'
import { supabase } from '@/lib/supabase'
import { useAuth, canEdit } from '@/lib/auth-context'
import { notifyOthers } from '@/lib/notify'
import { shareUrl, downloadUrl } from '@/lib/media'

type Photo = {
  id: string
  image_url: string
  memo: string
  uploaded_by: string
  created_at: string
}

export default function ReceiptsPage() {
  const { profile } = useAuth()
  const readOnly = !canEdit(profile)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [memo, setMemo] = useState('')
  const [uploadedBy, setUploadedBy] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadCurrent, setUploadCurrent] = useState(0)
  const [viewIdx, setViewIdx] = useState<number | null>(null) // 크게 보기

  useEffect(() => { fetchPhotos() }, [])
  useEffect(() => { if (profile?.name) setUploadedBy(profile.name) }, [profile?.name])

  async function fetchPhotos() {
    setLoading(true)
    const { data } = await supabase.from('receipts').select('*').order('created_at', { ascending: false })
    setPhotos(data || [])
    setLoading(false)
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault()
    if (selectedFiles.length === 0) return
    setUploading(true)
    for (let i = 0; i < selectedFiles.length; i++) {
      setUploadCurrent(i + 1)
      const file = selectedFiles[i]
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `receipts/${Date.now()}_${i}.${ext}`
      const { data: uploadData } = await supabase.storage.from('uploads').upload(path, file, {
        contentType: file.type || 'image/jpeg',
      })
      if (uploadData) {
        const { data: urlData } = supabase.storage.from('uploads').getPublicUrl(path)
        await supabase.from('receipts').insert([{
          image_url: urlData.publicUrl,
          memo,
          uploaded_by: uploadedBy.trim() || profile?.name || '',
        }])
      }
    }
    notifyOthers(profile?.id, { type: 'receipt', title: `새 영수증 ${selectedFiles.length}건`, body: `${profile?.name || ''} ${memo || '영수증이 등록되었습니다'}`.trim(), link: '/receipts' })
    setSelectedFiles([])
    setMemo('')
    setUploadedBy(profile?.name || '')
    setShowForm(false)
    setUploading(false)
    setUploadCurrent(0)
    fetchPhotos()
  }

  async function deletePhoto(photo: Photo) {
    if (!confirm('삭제할까요?')) return
    const path = photo.image_url.split('/uploads/')[1]
    if (path) await supabase.storage.from('uploads').remove([path])
    await supabase.from('receipts').delete().eq('id', photo.id)
    fetchPhotos()
  }

  if (profile?.role === 'partner') return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <Sidebar />
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">접근 권한이 없습니다.</div>
    </div>
  )

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <header className="bg-white border-b border-gray-200 px-4 md:px-8 py-4 md:py-5 flex items-center justify-between flex-shrink-0">
          <div>
            <h1 className="text-xl font-bold text-gray-900">영수증</h1>
            <p className="text-sm text-gray-500 mt-0.5">총 {photos.length}장</p>
          </div>
          {!readOnly && (
            <button onClick={() => setShowForm(true)}
              className="bg-green-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-green-700">
              + 사진 업로드
            </button>
          )}
        </header>

        <div className="flex-1 overflow-auto px-4 md:px-8 py-4 md:py-6 pb-20 md:pb-6">
          {loading ? (
            <div className="text-center py-16 text-gray-400">불러오는 중...</div>
          ) : photos.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 text-center py-16 text-gray-400">
              <p className="text-4xl mb-3">🧾</p>
              <p className="font-medium">등록된 영수증이 없어요</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {photos.map((p, i) => (
                <div key={p.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden group">
                  <button onClick={() => setViewIdx(i)} className="block w-full" title="크게 보기">
                    <img src={p.image_url} alt="영수증" className="w-full aspect-square object-cover" />
                  </button>
                  <div className="px-3 py-2">
                    {p.memo && <p className="text-xs text-gray-700 truncate">{p.memo}</p>}
                    <div className="flex items-center justify-between mt-1 gap-1">
                      <span className="text-xs text-gray-400 truncate">{p.uploaded_by || ''} {new Date(p.created_at).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}</span>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button onClick={() => shareUrl(p.image_url, `영수증_${p.memo || i + 1}.jpg`)} className="text-xs text-blue-400 hover:text-blue-600">내보내기</button>
                        {!readOnly && (
                          <button onClick={() => deletePhoto(p)} className="text-xs text-red-400 hover:text-red-600">삭제</button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 크게 보기 (다운로드 없이) + 내보내기/저장 */}
      {viewIdx !== null && photos[viewIdx] && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4" onClick={() => setViewIdx(null)}>
          <img src={photos[viewIdx].image_url} alt="" onClick={e => e.stopPropagation()} className="max-w-full max-h-[85vh] object-contain rounded-lg" />
          {viewIdx > 0 && (
            <button onClick={e => { e.stopPropagation(); setViewIdx(viewIdx - 1) }}
              className="absolute left-2 md:left-6 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/20 hover:bg-white/30 text-white text-2xl flex items-center justify-center">‹</button>
          )}
          {viewIdx < photos.length - 1 && (
            <button onClick={e => { e.stopPropagation(); setViewIdx(viewIdx + 1) }}
              className="absolute right-2 md:right-6 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/20 hover:bg-white/30 text-white text-2xl flex items-center justify-center">›</button>
          )}
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-2" onClick={e => e.stopPropagation()}>
            <span className="bg-black/50 text-white text-xs px-3 py-1.5 rounded-full">{viewIdx + 1} / {photos.length}</span>
            <button onClick={() => shareUrl(photos[viewIdx!].image_url, `영수증_${viewIdx! + 1}.jpg`)} className="bg-white/20 hover:bg-white/30 text-white text-xs px-3 py-1.5 rounded-full">내보내기</button>
            <button onClick={() => downloadUrl(photos[viewIdx!].image_url, `영수증_${viewIdx! + 1}.jpg`)} className="bg-white/20 hover:bg-white/30 text-white text-xs px-3 py-1.5 rounded-full">저장</button>
          </div>
          <button onClick={() => setViewIdx(null)} className="absolute top-4 right-4 text-white text-3xl leading-none">&times;</button>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 sticky top-0 bg-white">
              <h2 className="text-lg font-bold">영수증 업로드</h2>
              <button onClick={() => { setShowForm(false); setSelectedFiles([]) }} className="text-gray-400 text-2xl">&times;</button>
            </div>
            <form onSubmit={handleUpload} className="px-6 py-5 flex flex-col gap-4">
              <MultiFileZone files={selectedFiles} onChange={setSelectedFiles} />
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">메모</label>
                <input value={memo} onChange={e => setMemo(e.target.value)} placeholder="용도, 금액 등"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">올린 사람</label>
                <input value={uploadedBy} onChange={e => setUploadedBy(e.target.value)} placeholder="이름"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              {uploading && (
                <p className="text-sm text-green-600 text-center">{uploadCurrent}/{selectedFiles.length} 업로드 중...</p>
              )}
              <div className="flex gap-3">
                <button type="button" onClick={() => { setShowForm(false); setSelectedFiles([]) }}
                  className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm">취소</button>
                <button type="submit" disabled={uploading || selectedFiles.length === 0}
                  className="flex-1 bg-green-600 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
                  {uploading ? '업로드 중...' : `${selectedFiles.length > 1 ? `${selectedFiles.length}장 ` : ''}업로드`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function MultiFileZone({ files, onChange }: { files: File[]; onChange: (f: File[]) => void }) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const addFiles = useCallback((fl: FileList | null) => {
    if (!fl) return
    onChange([...files, ...Array.from(fl)])
  }, [files, onChange])
  // 캡처(스크린샷) 붙여넣기 — 이 창이 열려 있을 때 Ctrl+V로 이미지 추가
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const imgs = Array.from(e.clipboardData?.items || []).filter(it => it.type.startsWith('image/'))
      if (imgs.length === 0) return
      e.preventDefault()
      const pasted = imgs.map(it => it.getAsFile()).filter(Boolean) as File[]
      if (pasted.length) onChange([...files, ...pasted])
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [files, onChange])
  return (
    <div>
      <div onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files) }}
        className={`flex flex-col items-center justify-center w-full h-28 border-2 border-dashed rounded-xl cursor-pointer transition-all ${dragging ? 'border-green-500 bg-green-50' : files.length > 0 ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-green-400'}`}>
        <input ref={inputRef} type="file" multiple accept="image/*" className="hidden"
          onChange={e => addFiles(e.target.files)} />
        {files.length > 0 ? (
          <div className="text-center pointer-events-none">
            <p className="text-sm font-semibold text-green-600">{files.length}장 선택됨</p>
            <p className="text-xs text-gray-400 mt-0.5">클릭해서 추가</p>
          </div>
        ) : (
          <div className="text-center pointer-events-none">
            <p className="text-sm font-medium text-gray-600">클릭·드래그 또는 <span className="text-green-600">Ctrl+V 붙여넣기</span></p>
            <p className="text-xs text-gray-400 mt-0.5">캡처한 화면도 바로 붙여넣기 가능</p>
          </div>
        )}
      </div>
      {files.length > 0 && (
        <div className="mt-2 flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
          <span className="text-xs text-gray-500">{files[0].name}{files.length > 1 ? ` 외 ${files.length - 1}장` : ''}</span>
          <button type="button" onClick={() => onChange([])} className="text-xs text-red-400 hover:text-red-600">전체 취소</button>
        </div>
      )}
    </div>
  )
}

