'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import Sidebar from '@/components/Sidebar'
import { supabase } from '@/lib/supabase'

type Photo = {
  id: string
  image_url: string
  memo: string
  uploaded_by: string
  created_at: string
}

export default function ReceiptsPage() {
  const [photos, setPhotos] = useState<Photo[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [memo, setMemo] = useState('')
  const [uploadedBy, setUploadedBy] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadCurrent, setUploadCurrent] = useState(0)

  useEffect(() => { fetchPhotos() }, [])

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
          uploaded_by: uploadedBy,
        }])
      }
    }
    setSelectedFiles([])
    setMemo('')
    setUploadedBy('')
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

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <header className="bg-white border-b border-gray-200 px-4 md:px-8 py-4 md:py-5 flex items-center justify-between flex-shrink-0">
          <div>
            <h1 className="text-xl font-bold text-gray-900">영수증</h1>
            <p className="text-sm text-gray-500 mt-0.5">총 {photos.length}장</p>
          </div>
          <button onClick={() => setShowForm(true)}
            className="bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700">
            + 사진 업로드
          </button>
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
              {photos.map(p => (
                <div key={p.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden group">
                  <a href={p.image_url} target="_blank" rel="noopener noreferrer">
                    <img src={p.image_url} alt="영수증" className="w-full aspect-square object-cover" />
                  </a>
                  <div className="px-3 py-2">
                    {p.memo && <p className="text-xs text-gray-700 truncate">{p.memo}</p>}
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-gray-400">{p.uploaded_by || ''} {new Date(p.created_at).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}</span>
                      <button onClick={() => deletePhoto(p)}
                        className="text-xs text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity">삭제</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <h2 className="text-lg font-bold">영수증 업로드</h2>
              <button onClick={() => { setShowForm(false); setSelectedFiles([]) }} className="text-gray-400 text-2xl">&times;</button>
            </div>
            <form onSubmit={handleUpload} className="px-6 py-5 flex flex-col gap-4">
              <MultiFileZone files={selectedFiles} onChange={setSelectedFiles} />
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">메모</label>
                <input value={memo} onChange={e => setMemo(e.target.value)} placeholder="용도, 금액 등"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">올린 사람</label>
                <input value={uploadedBy} onChange={e => setUploadedBy(e.target.value)} placeholder="이름"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              {uploading && (
                <p className="text-sm text-blue-600 text-center">{uploadCurrent}/{selectedFiles.length} 업로드 중...</p>
              )}
              <div className="flex gap-3">
                <button type="button" onClick={() => { setShowForm(false); setSelectedFiles([]) }}
                  className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm">취소</button>
                <button type="submit" disabled={uploading || selectedFiles.length === 0}
                  className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
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
  return (
    <div>
      <div onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files) }}
        className={`flex flex-col items-center justify-center w-full h-28 border-2 border-dashed rounded-xl cursor-pointer transition-all ${dragging ? 'border-blue-500 bg-blue-50' : files.length > 0 ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-blue-400'}`}>
        <input ref={inputRef} type="file" multiple accept="image/*" className="hidden"
          onChange={e => addFiles(e.target.files)} />
        {files.length > 0 ? (
          <div className="text-center pointer-events-none">
            <p className="text-sm font-semibold text-blue-600">{files.length}장 선택됨</p>
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
