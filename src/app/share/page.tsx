'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { supabase } from '@/lib/supabase'
import { useAuth, canEdit } from '@/lib/auth-context'
import { notifyOthers } from '@/lib/notify'

const CATEGORY_LIST = ['시공전사진', '시공사진', '마감사진', '도면', '3D', '미팅내용', '고객요청', '기타']

type Proj = { id: string; name: string }
type Dest = 'project' | 'receipt' | 'withdrawal'

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
  const [category, setCategory] = useState('시공전사진')
  const [memo, setMemo] = useState('')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    let active = true
    async function init() {
      const [f, t, p] = await Promise.all([
        readSharedFiles(),
        readSharedText(),
        supabase.from('projects').select('id, name').order('created_at', { ascending: false }),
      ])
      if (!active) return
      setFiles(f)
      setSharedText(t)
      // 카톡 등에서 함께 넘어온 텍스트를 사유/메모 칸에 자동 입력
      if (t) { setReason(t); setMemo(t) }
      // 사진 없이 글만 공유된 경우엔 기본 저장처를 출금요청으로
      if (t && f.length === 0) setDest('withdrawal')
      setProjects(p.data || [])
      if (p.data && p.data.length) setProjectId(p.data[0].id)
      setLoading(false)
    }
    init()
    return () => { active = false }
  }, [])

  async function uploadOne(file: File, i: number, folder: string) {
    const ext = file.name.split('.').pop() || 'bin'
    const path = `${folder}/${Date.now()}_${i}.${ext}`
    const { error } = await supabase.storage.from('uploads').upload(path, file, {
      contentType: file.type || 'application/octet-stream', upsert: true,
    })
    if (error) { alert('업로드 실패: ' + error.message); return null }
    return supabase.storage.from('uploads').getPublicUrl(path).data.publicUrl
  }

  async function handleUpload() {
    if (readOnly) { alert('외부협력업체 계정은 저장할 수 없습니다.'); return }
    if (files.length === 0 && !sharedText.trim()) return
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
    const wUrls: string[] = []  // 출금요청: 여러 장을 한 건으로 묶음
    for (let i = 0; i < files.length; i++) {
      setProgress(Math.round((i / files.length) * 100))
      const file = files[i]
      if (dest === 'project') {
        const url = await uploadOne(file, i, `files/${projectId}`)
        if (url) await supabase.from('project_files').insert([{
          project_id: projectId, file_name: file.name, file_url: url,
          file_type: file.type || '', category, memo: memo || '', uploaded_by: who,
        }])
      } else if (dest === 'receipt') {
        const url = await uploadOne(file, i, 'receipts')
        if (url) await supabase.from('receipts').insert([{ image_url: url, memo: reason || '', uploaded_by: who }])
      } else {
        const url = await uploadOne(file, i, 'withdrawals')
        if (url) wUrls.push(url)
      }
    }
    if (dest === 'withdrawal' && wUrls.length > 0) {
      await supabase.from('withdrawal_requests').insert([{
        image_url: wUrls[0], images: wUrls, reason: reason || '', requested_by: who, status: '요청', amount: 0, recipient: '',
      }])
    }
    setProgress(100)
    if (dest === 'project') {
      const proj = projects.find(p => p.id === projectId)
      notifyOthers(profile?.id, { type: 'file', title: `${proj?.name || '현장'} · 공유 자료 ${files.length}건`, body: `${category} 자료가 추가되었습니다`, link: `/projects/${projectId}` })
    } else if (dest === 'receipt') {
      notifyOthers(profile?.id, { type: 'receipt', title: `새 영수증 ${files.length}건`, body: reason || '영수증이 등록되었습니다', link: '/receipts' })
    } else {
      notifyOthers(profile?.id, { type: 'withdrawal', title: `새 출금요청 ${files.length}건`, body: reason || '출금요청이 등록되었습니다', link: '/withdrawals' })
    }
    await clearShared()
    setUploading(false)
    router.push(dest === 'project' ? `/projects/${projectId}` : dest === 'receipt' ? '/receipts' : '/withdrawals')
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

        <div className="flex-1 overflow-auto px-4 md:px-8 py-4 md:py-6 pb-20 md:pb-6">
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
                  {destBtn('receipt', '영수증')}
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
                </>
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
                  {uploading ? `업로드 중... ${progress}%` : files.length > 0 ? `${files.length}개 저장하기` : '글 저장하기'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
