'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import Sidebar from '@/components/Sidebar'
import { supabase } from '@/lib/supabase'
import { useAuth, canEdit } from '@/lib/auth-context'

type Photo = {
  id: string
  image_url: string
  images?: string[] | null
  reason: string
  requested_by: string
  created_at: string
}

export default function WithdrawalsPage() {
  const { profile } = useAuth()
  const readOnly = !canEdit(profile)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [reason, setReason] = useState('')
  const [requestedBy, setRequestedBy] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadCurrent, setUploadCurrent] = useState(0)
  const [viewer, setViewer] = useState<Photo | null>(null)
  const [viewerReason, setViewerReason] = useState('')
  const [viewerImages, setViewerImages] = useState<string[]>([])
  const [savingReason, setSavingReason] = useState(false)
  const [viewerBusy, setViewerBusy] = useState(false)
  const viewerFileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { fetchPhotos() }, [])
  useEffect(() => { if (profile?.name) setRequestedBy(profile.name) }, [profile?.name])

  function imgsOf(p: Photo) {
    return (p.images && p.images.length ? p.images : [p.image_url]).filter(Boolean)
  }

  function openViewer(p: Photo) {
    setViewer(p)
    setViewerReason(p.reason || '')
    setViewerImages(imgsOf(p))
  }

  // 출금 건의 사진/글을 DB에 반영 + 화면 갱신
  async function applyViewer(nextImages: string[], nextReason: string) {
    if (!viewer) return
    await supabase.from('withdrawal_requests').update({
      images: nextImages, image_url: nextImages[0] || '', reason: nextReason,
    }).eq('id', viewer.id)
    setPhotos(ps => ps.map(x => x.id === viewer.id ? { ...x, images: nextImages, image_url: nextImages[0] || '', reason: nextReason } : x))
  }

  async function saveViewerReason() {
    if (!viewer) return
    setSavingReason(true)
    await applyViewer(viewerImages, viewerReason)
    setSavingReason(false)
    setViewer(null)
  }

  async function removeViewerImage(url: string) {
    if (!viewer || viewerBusy) return
    if (!confirm('이 사진을 삭제할까요?')) return
    setViewerBusy(true)
    const path = url.split('/uploads/')[1]
    if (path) await supabase.storage.from('uploads').remove([path])
    const next = viewerImages.filter(u => u !== url)
    setViewerImages(next)
    await applyViewer(next, viewerReason)
    setViewerBusy(false)
  }

  async function addViewerImages(files: FileList | null) {
    if (!viewer || !files || files.length === 0) return
    setViewerBusy(true)
    const added: string[] = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `withdrawals/${Date.now()}_${i}.${ext}`
      const { data } = await supabase.storage.from('uploads').upload(path, file, { contentType: file.type || 'image/jpeg' })
      if (data) added.push(supabase.storage.from('uploads').getPublicUrl(path).data.publicUrl)
    }
    const next = [...viewerImages, ...added]
    setViewerImages(next)
    await applyViewer(next, viewerReason)
    setViewerBusy(false)
  }

  async function fetchPhotos() {
    setLoading(true)
    const { data } = await supabase.from('withdrawal_requests').select('*').order('created_at', { ascending: false })
    setPhotos(data || [])
    setLoading(false)
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault()
    // 사진이 없어도 글(사유)만 있으면 저장 가능
    if (selectedFiles.length === 0 && !reason.trim()) return
    setUploading(true)
    const urls: string[] = []
    for (let i = 0; i < selectedFiles.length; i++) {
      setUploadCurrent(i + 1)
      const file = selectedFiles[i]
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `withdrawals/${Date.now()}_${i}.${ext}`
      const { data: uploadData } = await supabase.storage.from('uploads').upload(path, file, {
        contentType: file.type || 'image/jpeg',
      })
      if (uploadData) urls.push(supabase.storage.from('uploads').getPublicUrl(path).data.publicUrl)
    }
    if (urls.length > 0 || reason.trim()) {
      await supabase.from('withdrawal_requests').insert([{
        image_url: urls[0] || '', images: urls, reason, requested_by: requestedBy, status: '요청', amount: 0, recipient: '',
      }])
    }
    setSelectedFiles([])
    setReason('')
    setRequestedBy(profile?.name || '')
    setShowForm(false)
    setUploading(false)
    setUploadCurrent(0)
    fetchPhotos()
  }

  async function deletePhoto(photo: Photo) {
    if (!confirm('삭제할까요?')) return
    const imgs = (photo.images && photo.images.length ? photo.images : [photo.image_url]).filter(Boolean)
    const paths = imgs.map(u => u.split('/uploads/')[1]).filter(Boolean)
    if (paths.length) await supabase.storage.from('uploads').remove(paths)
    await supabase.from('withdrawal_requests').delete().eq('id', photo.id)
    fetchPhotos()
  }

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <header className="bg-white border-b border-gray-200 px-4 md:px-8 py-4 md:py-5 flex items-center justify-between flex-shrink-0">
          <div>
            <h1 className="text-xl font-bold text-gray-900">출금 요청</h1>
            <p className="text-sm text-gray-500 mt-0.5">총 {photos.length}건 · 사진과 글을 한 번에 등록</p>
          </div>
          {!readOnly && (
            <button onClick={() => setShowForm(true)}
              className="bg-green-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-green-700">
              + 출금 추가
            </button>
          )}
        </header>

        <div className="flex-1 overflow-auto px-4 md:px-8 py-4 md:py-6 pb-20 md:pb-6">
          {loading ? (
            <div className="text-center py-16 text-gray-400">불러오는 중...</div>
          ) : photos.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 text-center py-16 text-gray-400">
              <p className="text-4xl mb-3">💸</p>
              <p className="font-medium">등록된 출금 요청이 없어요</p>
              <p className="text-xs mt-2 text-gray-400">우측 상단 <span className="text-green-600 font-medium">+ 출금 추가</span> → 사진 선택 + 글 붙여넣기 → 저장<br/>(아이폰·안드로이드 모두 동일)</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {photos.map(p => {
                const imgs = (p.images && p.images.length ? p.images : [p.image_url]).filter(Boolean)
                return (
                <div key={p.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden group">
                  <button onClick={() => openViewer(p)} className="relative block w-full">
                    {imgs.length > 0 ? (
                      <>
                        <img src={imgs[0]} alt="출금요청" className="w-full aspect-square object-cover" />
                        {imgs.length > 1 && (
                          <span className="absolute top-1.5 right-1.5 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full">📷 {imgs.length}장</span>
                        )}
                      </>
                    ) : (
                      <div className="w-full aspect-square bg-amber-50 flex items-center justify-center p-3">
                        <p className="text-xs text-amber-900 whitespace-pre-wrap line-clamp-6 text-left">{p.reason || '📝 글 메모'}</p>
                      </div>
                    )}
                  </button>
                  <div className="px-3 py-2">
                    {p.reason && <p className="text-xs text-gray-700 line-clamp-2 whitespace-pre-wrap">{p.reason}</p>}
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-gray-400">{p.requested_by || ''} {new Date(p.created_at).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}</span>
                      {!readOnly && (
                        <button onClick={() => deletePhoto(p)}
                          className="text-xs text-red-500 hover:text-red-700 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity px-2 py-0.5">삭제</button>
                      )}
                    </div>
                  </div>
                </div>
              )})}
            </div>
          )}
        </div>
      </div>

      {viewer && (
        <div className="fixed inset-0 bg-black/80 z-50 overflow-auto p-4" onClick={() => setViewer(null)}>
          <button onClick={() => setViewer(null)} className="fixed top-4 right-4 text-white text-3xl leading-none z-10">&times;</button>
          <div className="max-w-2xl mx-auto flex flex-col gap-3 py-2" onClick={e => e.stopPropagation()}>
            {/* 글 추가/수정 + 건 삭제 */}
            <div className="bg-white rounded-xl px-4 py-3">
              <label className="text-sm font-semibold text-gray-700 block mb-1.5">사유 / 내용</label>
              {readOnly ? (
                <p className="text-sm text-gray-700 whitespace-pre-wrap min-h-[1.5rem]">{viewerReason || '내용 없음'}</p>
              ) : (
                <>
                  <textarea value={viewerReason} onChange={e => setViewerReason(e.target.value)}
                    rows={Math.max(6, viewerReason.split('\n').length + 1)}
                    placeholder="카톡 내용을 붙여넣거나 입력하세요"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-y leading-relaxed" />
                  <div className="flex gap-2 mt-2">
                    <button onClick={saveViewerReason} disabled={savingReason || viewerBusy}
                      className="flex-1 bg-green-600 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50">
                      {savingReason ? '저장 중...' : '글 저장'}
                    </button>
                    <button onClick={() => { const v = viewer; setViewer(null); deletePhoto(v) }}
                      className="px-4 border border-red-200 text-red-500 py-2 rounded-lg text-sm font-medium hover:bg-red-50">건 삭제</button>
                  </div>
                </>
              )}
            </div>

            {/* 사진 관리 */}
            <div className="bg-white rounded-xl px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-semibold text-gray-700">사진 {viewerImages.length}장</label>
                {!readOnly && (
                  <>
                    <button onClick={() => viewerFileRef.current?.click()} disabled={viewerBusy}
                      className="text-sm text-green-600 font-medium disabled:opacity-50">+ 사진 추가</button>
                    <input ref={viewerFileRef} type="file" multiple accept="image/*" className="hidden"
                      onChange={e => { addViewerImages(e.target.files); e.target.value = '' }} />
                  </>
                )}
              </div>
              {viewerImages.length === 0 ? (
                <p className="text-xs text-gray-400 py-2">사진이 없습니다 (글만 저장된 건)</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {viewerImages.map((u, i) => (
                    <div key={i} className="relative">
                      <img src={u} alt="" className="w-full rounded-lg" />
                      {!readOnly && (
                        <button onClick={() => removeViewerImage(u)} disabled={viewerBusy}
                          className="absolute top-2 right-2 bg-black/60 text-white w-8 h-8 rounded-full flex items-center justify-center text-lg leading-none disabled:opacity-50">&times;</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {viewerBusy && <p className="text-xs text-green-600 mt-2 text-center">처리 중...</p>}
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <h2 className="text-lg font-bold">출금 요청 추가</h2>
              <button onClick={() => { setShowForm(false); setSelectedFiles([]) }} className="text-gray-400 text-2xl">&times;</button>
            </div>
            <form onSubmit={handleUpload} className="px-6 py-5 flex flex-col gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">사진 <span className="text-gray-400 font-normal">(선택 · 글만 저장도 가능)</span></label>
                <MultiFileZone files={selectedFiles} onChange={setSelectedFiles} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">사유 / 내용</label>
                <textarea value={reason} onChange={e => setReason(e.target.value)} rows={4}
                  placeholder="카톡 내용을 붙여넣거나 입력 (일당, 자재비, 송금내역 등)"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-y leading-relaxed" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">요청자 <span className="text-gray-400 font-normal">(선택)</span></label>
                <input value={requestedBy} onChange={e => setRequestedBy(e.target.value)} placeholder="이름"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              {uploading && selectedFiles.length > 0 && (
                <p className="text-sm text-green-600 text-center">{uploadCurrent}/{selectedFiles.length} 업로드 중...</p>
              )}
              <div className="flex gap-3">
                <button type="button" onClick={() => { setShowForm(false); setSelectedFiles([]) }}
                  className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm">취소</button>
                <button type="submit" disabled={uploading || (selectedFiles.length === 0 && !reason.trim())}
                  className="flex-1 bg-green-600 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
                  {uploading ? '저장 중...' : selectedFiles.length > 0 ? `${selectedFiles.length > 1 ? `${selectedFiles.length}장 ` : ''}업로드` : '글 저장'}
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
            <p className="text-sm font-medium text-gray-600">사진을 드래그하거나 클릭해서 선택</p>
            <p className="text-xs text-gray-400 mt-0.5">여러 장 동시 선택 가능</p>
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

