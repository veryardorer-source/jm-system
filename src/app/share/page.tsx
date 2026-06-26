'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { notifyOthers } from '@/lib/notify'

const CATEGORY_LIST = ['시공전사진', '시공사진', '마감사진', '도면', '3D', '미팅내용', '고객요청', '기타']

type Proj = { id: string; name: string }

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

async function clearShared() {
  if (typeof caches === 'undefined') return
  const cache = await caches.open('shared-media')
  for (const key of await cache.keys()) await cache.delete(key)
}

export default function SharePage() {
  const { profile } = useAuth()
  const router = useRouter()
  const [files, setFiles] = useState<File[]>([])
  const [projects, setProjects] = useState<Proj[]>([])
  const [projectId, setProjectId] = useState('')
  const [category, setCategory] = useState('시공전사진')
  const [memo, setMemo] = useState('')
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    let active = true
    async function init() {
      const [f, p] = await Promise.all([
        readSharedFiles(),
        supabase.from('projects').select('id, name').order('created_at', { ascending: false }),
      ])
      if (!active) return
      setFiles(f)
      setProjects(p.data || [])
      if (p.data && p.data.length) setProjectId(p.data[0].id)
      setLoading(false)
    }
    init()
    return () => { active = false }
  }, [])

  async function handleUpload() {
    if (!projectId || files.length === 0) return
    setUploading(true)
    for (let i = 0; i < files.length; i++) {
      setProgress(Math.round((i / files.length) * 100))
      const file = files[i]
      const ext = file.name.split('.').pop() || 'bin'
      const path = `files/${projectId}/${Date.now()}_${i}.${ext}`
      const { error: upErr } = await supabase.storage.from('uploads').upload(path, file, {
        contentType: file.type || 'application/octet-stream', upsert: true,
      })
      if (upErr) { alert('업로드 실패: ' + upErr.message); continue }
      const { data: urlData } = supabase.storage.from('uploads').getPublicUrl(path)
      await supabase.from('project_files').insert([{
        project_id: projectId, file_name: file.name, file_url: urlData.publicUrl,
        file_type: file.type || '', category, memo: memo || '', uploaded_by: '',
      }])
    }
    setProgress(100)
    const proj = projects.find(p => p.id === projectId)
    notifyOthers(profile?.id, { type: 'file', title: `${proj?.name || '현장'} · 공유 자료 ${files.length}건`, body: `${category} 자료가 추가되었습니다`, link: `/projects/${projectId}` })
    await clearShared()
    setUploading(false)
    router.push(`/projects/${projectId}`)
  }

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <header className="bg-white border-b border-gray-200 px-4 md:px-8 py-4 md:py-5 flex-shrink-0">
          <h1 className="text-xl font-bold text-gray-900">공유 자료 저장</h1>
          <p className="text-sm text-gray-500 mt-0.5">다른 앱에서 공유한 사진/영상을 현장에 바로 저장</p>
        </header>

        <div className="flex-1 overflow-auto px-4 md:px-8 py-4 md:py-6 pb-20 md:pb-6">
          {loading ? (
            <div className="text-center text-gray-400 py-16">불러오는 중...</div>
          ) : files.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 text-center py-16 text-gray-400">
              <p className="text-3xl mb-2">📤</p>
              <p>공유된 파일이 없어요.</p>
              <p className="text-xs mt-1">카톡 등에서 사진을 공유 → 더보기 → JM관리 를 선택해 주세요.</p>
            </div>
          ) : (
            <div className="max-w-lg flex flex-col gap-4">
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-sm font-semibold text-gray-700 mb-2">공유된 파일 {files.length}개</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {files.slice(0, 8).map((f, i) => (
                    <div key={i} className="aspect-square bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden">
                      {f.type.startsWith('image') ? (
                        <img src={URL.createObjectURL(f)} alt="" className="w-full h-full object-cover" />
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

              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">저장할 현장 *</label>
                <select value={projectId} onChange={e => setProjectId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                  {projects.length === 0 && <option value="">현장이 없습니다</option>}
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
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

              {uploading && (
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div className="bg-green-500 h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
                </div>
              )}

              <button onClick={handleUpload} disabled={uploading || !projectId}
                className="bg-green-600 text-white py-3 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                {uploading ? `업로드 중... ${progress}%` : `${files.length}개 저장하기`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
