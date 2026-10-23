'use client'

// 영수증(가벼운 버전) — 직원은 사진 + 현장·용도 버튼만, 대표는 경리나라에 옮긴 건 '정리 완료' 체크.
// AI 인식·엑셀은 넣지 않음(2026-10-23 대표 결정: 지금은 서랍에 모아 아침에 정리하는 방식 유지, 필요할 때 켜서 쓰기)
import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Sidebar from '@/components/Sidebar'
import { toast } from '@/components/Toaster'
import { supabase, HIDDEN_STATUSES, type Project } from '@/lib/supabase'
import { useAuth, canEdit } from '@/lib/auth-context'
import { compressImage } from '@/lib/image'
import { SECURE_PREFIX, signSecureUrls, removeStoredFile, shareUrl, downloadUrl } from '@/lib/media'

type ReceiptRow = {
  id: string
  project_id: string | null
  image_url: string
  memo: string | null
  category: string | null
  uploaded_by: string
  is_processed: boolean
  created_at: string
}

const CATEGORIES = ['자재', '인건비', '식대', '장비·공구', '유류·교통', '기타']
const CAT_STYLE: Record<string, string> = {
  '자재': 'bg-sky-100 text-sky-800', '인건비': 'bg-green-100 text-green-800', '식대': 'bg-amber-100 text-amber-800',
  '장비·공구': 'bg-violet-100 text-violet-800', '유류·교통': 'bg-orange-100 text-orange-800', '기타': 'bg-gray-100 text-gray-600',
}
const OFFICE = 'office' // 현장 아님(사무실 경비) — project_id 비움
const WEEK = ['일', '월', '화', '수', '목', '금', '토']
const dayKey = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` }
const dayLabel = (iso: string) => { const d = new Date(iso); return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEK[d.getDay()]})` }
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })

// 영수증은 글자만 읽히면 되니 긴 변 1600px로 줄여 잠금 보관함에 (원본 3~4MB → 0.2~0.3MB)
async function uploadReceiptImage(file: File, i: number): Promise<string | null> {
  const small = await compressImage(file, 1600, 0.75)
  const ext = small.name.split('.').pop() || 'jpg'
  const path = `receipts/${Date.now()}_${i}.${ext}`
  const { error } = await supabase.storage.from('secure').upload(path, small, { contentType: small.type || 'image/jpeg' })
  if (error) { toast('사진 저장 실패: ' + error.message); return null }
  return SECURE_PREFIX + path
}

export default function ReceiptsPage() {
  const { profile } = useAuth()
  const editable = canEdit(profile)
  const isAdmin = profile?.role === 'admin'
  const [rows, setRows] = useState<ReceiptRow[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [signed, setSigned] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'todo' | 'done'>('todo')
  const [showForm, setShowForm] = useState(false)
  const [viewer, setViewer] = useState<ReceiptRow | null>(null)

  useEffect(() => {
    let on = true
    ;(async () => {
      const [r, p] = await Promise.all([
        supabase.from('receipts').select('*').order('created_at', { ascending: false }).limit(500),
        supabase.from('projects').select('*').order('created_at', { ascending: false }),
      ])
      if (!on) return
      const list = (r.data || []) as ReceiptRow[]
      setSigned(await signSecureUrls(list.map(x => x.image_url)))
      setRows(list)
      setProjects((p.data || []) as Project[])
      setLoading(false)
    })()
    return () => { on = false }
  }, [])

  async function reload() {
    const { data } = await supabase.from('receipts').select('*').order('created_at', { ascending: false }).limit(500)
    const list = (data || []) as ReceiptRow[]
    setSigned(await signSecureUrls(list.map(x => x.image_url)))
    setRows(list)
  }

  const view = (u: string) => u.startsWith(SECURE_PREFIX) ? (signed[u] || '') : u
  const projName = (id: string | null) => id ? (projects.find(p => p.id === id)?.name || '(지운 현장)') : '사무실'

  async function toggleProcessed(r: ReceiptRow) {
    const next = !r.is_processed
    setRows(rs => rs.map(x => x.id === r.id ? { ...x, is_processed: next } : x))
    const { error } = await supabase.from('receipts').update({ is_processed: next }).eq('id', r.id)
    if (error) { setRows(rs => rs.map(x => x.id === r.id ? r : x)); toast('변경 실패: ' + error.message) }
  }

  async function remove(r: ReceiptRow) {
    if (!confirm('이 영수증을 지울까요?')) return
    await removeStoredFile(r.image_url)
    const { error } = await supabase.from('receipts').delete().eq('id', r.id)
    if (error) { toast('삭제 실패: ' + error.message); return }
    setRows(rs => rs.filter(x => x.id !== r.id))
    setViewer(null)
  }

  if (profile?.role === 'partner') return (
    <div className="flex flex-col min-h-screen">
      <Sidebar />
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">접근 권한이 없습니다.</div>
    </div>
  )

  const todo = rows.filter(r => !r.is_processed).length
  const shown = rows.filter(r => filter === 'all' ? true : filter === 'todo' ? !r.is_processed : r.is_processed)
  const days = [...new Set(shown.map(r => dayKey(r.created_at)))]

  return (
    <div className="flex flex-col min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <header className="bg-white border-b border-gray-200 px-4 md:px-8 py-4 md:py-5 flex-shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-gray-900">영수증</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                총 {rows.length}건{todo > 0 && <span className="text-amber-600 font-medium"> · 정리 전 {todo}건</span>}
              </p>
            </div>
            {editable && (
              <button onClick={() => setShowForm(true)} className="bg-green-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-green-700">
                + 영수증 올리기
              </button>
            )}
          </div>
          <div className="flex gap-1.5 mt-3">
            {([['todo', '정리 전'], ['done', '✅ 정리 완료'], ['all', '전체']] as const).map(([k, label]) => (
              <button key={k} onClick={() => setFilter(k)}
                className={`text-xs px-3 py-1.5 rounded-full border font-medium ${filter === k ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-500 border-gray-300'}`}>
                {label}
              </button>
            ))}
          </div>
        </header>

        <div className="flex-1 overflow-auto px-4 md:px-8 py-4 md:py-6 pb-24">
          {loading ? (
            <div className="text-center py-16 text-gray-400">불러오는 중...</div>
          ) : shown.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 text-center py-16 text-gray-400">
              <p className="text-4xl mb-3">🧾</p>
              <p className="font-medium">{rows.length === 0 ? '올라온 영수증이 없어요' : '해당하는 영수증이 없어요'}</p>
              {rows.length === 0 && <p className="text-xs mt-2">[+ 영수증 올리기] → 사진 찍기 → 현장·용도 고르기 → 저장</p>}
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {days.map(dk => {
                const list = shown.filter(r => dayKey(r.created_at) === dk)
                return (
                  <section key={dk}>
                    <h2 className="text-sm font-semibold text-gray-600 mb-2">{dayLabel(list[0].created_at)} <span className="text-gray-400 font-normal">· {list.length}건</span></h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                      {list.map(r => (
                        <div key={r.id} className={`bg-white rounded-xl border p-2.5 flex gap-3 items-center ${r.is_processed ? 'border-gray-200 opacity-70' : 'border-gray-200'}`}>
                          <button onClick={() => setViewer(r)} className="w-14 h-16 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                            {view(r.image_url) && <Image src={view(r.image_url)} alt="영수증" width={112} height={128} unoptimized className="w-full h-full object-cover" />}
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">{projName(r.project_id)}</p>
                            <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                              {r.category && <span className={`px-1.5 py-0.5 rounded font-medium ${CAT_STYLE[r.category] || CAT_STYLE['기타']}`}>{r.category}</span>}
                              <span>{r.uploaded_by} · {timeLabel(r.created_at)}</span>
                            </p>
                            {r.memo && <p className="text-xs text-gray-600 mt-0.5 truncate">{r.memo}</p>}
                          </div>
                          {isAdmin && (
                            <button onClick={() => toggleProcessed(r)} title="경리나라에 옮겼으면 체크"
                              className={`flex-shrink-0 text-xs px-2.5 py-2 rounded-lg border font-medium ${r.is_processed ? 'bg-green-600 border-green-600 text-white' : 'border-gray-300 text-gray-500 hover:border-green-500'}`}>
                              {r.is_processed ? '✓ 정리' : '정리'}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {viewer && (
        <div className="fixed inset-0 bg-black/85 z-50 flex flex-col items-center justify-center p-4" onClick={() => setViewer(null)}>
          <button className="fixed top-4 right-4 text-white text-3xl leading-none">&times;</button>
          <div className="max-w-lg w-full flex flex-col gap-2" onClick={e => e.stopPropagation()}>
            {view(viewer.image_url) && <Image src={view(viewer.image_url)} alt="영수증" width={1200} height={1600} unoptimized className="w-full h-auto max-h-[72vh] object-contain rounded-lg bg-white" />}
            <div className="bg-white rounded-xl px-4 py-3 text-sm">
              <p className="font-semibold">{projName(viewer.project_id)} {viewer.category && <span className={`ml-1 text-xs px-1.5 py-0.5 rounded ${CAT_STYLE[viewer.category] || CAT_STYLE['기타']}`}>{viewer.category}</span>}</p>
              <p className="text-xs text-gray-500 mt-0.5">{viewer.uploaded_by} · {dayLabel(viewer.created_at)} {timeLabel(viewer.created_at)}</p>
              {viewer.memo && <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{viewer.memo}</p>}
              <div className="flex gap-2 mt-3">
                <button onClick={() => shareUrl(view(viewer.image_url), '영수증')} className="flex-1 border border-gray-300 rounded-lg py-2 text-sm">내보내기</button>
                <button onClick={() => downloadUrl(view(viewer.image_url), '영수증')} className="flex-1 border border-gray-300 rounded-lg py-2 text-sm">저장</button>
                {(isAdmin || viewer.uploaded_by === profile?.name) && (
                  <button onClick={() => remove(viewer)} className="px-4 border border-red-200 text-red-500 rounded-lg py-2 text-sm">삭제</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <UploadForm
          // 영수증은 대부분 공사 중인 현장에서 나오니 시공중 현장을 앞에
          projects={projects.filter(p => !HIDDEN_STATUSES.includes(p.status as typeof HIDDEN_STATUSES[number]))
            .sort((a, b) => +(b.status === '시공중') - +(a.status === '시공중'))}
          who={profile?.name || ''}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); setFilter('todo'); reload() }}
        />
      )}
    </div>
  )
}

function UploadForm({ projects, who, onClose, onSaved }: { projects: Project[]; who: string; onClose: () => void; onSaved: () => void }) {
  const [files, setFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [projectId, setProjectId] = useState('')
  const [category, setCategory] = useState('')
  const [memo, setMemo] = useState('')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => () => previews.forEach(u => URL.revokeObjectURL(u)), [previews])

  function addFiles(fl: FileList | null) {
    if (!fl) return
    const imgs = Array.from(fl).filter(f => (f.type || '').startsWith('image/') || /\.(heic|heif)$/i.test(f.name))
    setFiles(prev => [...prev, ...imgs])
    setPreviews(prev => [...prev, ...imgs.map(f => URL.createObjectURL(f))])
  }

  async function save() {
    if (files.length === 0) { toast('영수증 사진을 골라 주세요'); return }
    if (!projectId) { toast('현장을 골라 주세요'); return }
    if (!category) { toast('용도를 골라 주세요'); return }
    setSaving(true)
    // 4장씩 동시에 — 한 장 끝나면 바로 다음 장
    const urls: (string | null)[] = new Array(files.length).fill(null)
    let next = 0
    const worker = async () => { while (next < files.length) { const i = next++; urls[i] = await uploadReceiptImage(files[i], i) } }
    await Promise.all(Array.from({ length: Math.min(4, files.length) }, worker))
    const ok = urls.filter(Boolean) as string[]
    if (ok.length) {
      const { error } = await supabase.from('receipts').insert(ok.map(u => ({
        image_url: u, project_id: projectId === OFFICE ? null : projectId, category, memo: memo.trim(), uploaded_by: who, amount: 0,
      })))
      if (error) { setSaving(false); toast('저장 실패: ' + error.message); return }
    }
    setSaving(false)
    toast(ok.length === files.length ? `영수증 ${ok.length}장 올렸어요` : `${ok.length}장 올림 · ${files.length - ok.length}장 실패`)
    if (ok.length) onSaved()
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl p-5 max-h-[92vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-gray-900">영수증 올리기</h3>
          <button onClick={onClose} className="text-gray-400 text-2xl leading-none">&times;</button>
        </div>

        <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
        {files.length === 0 ? (
          <button onClick={() => inputRef.current?.click()} className="w-full border-2 border-dashed border-gray-300 rounded-xl py-8 text-center hover:border-green-500">
            <p className="text-3xl">📷</p>
            <p className="text-sm font-medium text-gray-700 mt-1">눌러서 영수증 사진 찍기·고르기</p>
            <p className="text-xs text-gray-400 mt-0.5">여러 장 한 번에 돼요</p>
          </button>
        ) : (
          <div className="flex gap-2 flex-wrap">
            {previews.map((u, i) => (
              <div key={u} className="relative w-16 h-20 rounded-lg overflow-hidden bg-gray-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={u} alt="" className="w-full h-full object-cover" />
                <button onClick={() => { setFiles(f => f.filter((_, j) => j !== i)); setPreviews(p => p.filter((_, j) => j !== i)) }}
                  className="absolute top-0.5 right-0.5 bg-black/60 text-white w-5 h-5 rounded-full text-xs leading-none">&times;</button>
              </div>
            ))}
            <button onClick={() => inputRef.current?.click()} className="w-16 h-20 rounded-lg border-2 border-dashed border-gray-300 text-gray-400 text-2xl">+</button>
          </div>
        )}

        <p className="text-xs font-semibold text-gray-700 mt-4 mb-1.5">현장</p>
        <div className="flex flex-wrap gap-1.5">
          {projects.map(p => (
            <button key={p.id} onClick={() => setProjectId(p.id)}
              className={`px-3 py-1.5 rounded-full text-sm border ${projectId === p.id ? 'bg-green-600 border-green-600 text-white' : 'bg-white border-gray-200 text-gray-700'}`}>{p.name}</button>
          ))}
          <button onClick={() => setProjectId(OFFICE)}
            className={`px-3 py-1.5 rounded-full text-sm border ${projectId === OFFICE ? 'bg-green-600 border-green-600 text-white' : 'bg-white border-gray-200 text-gray-700'}`}>🏢 사무실</button>
        </div>

        <p className="text-xs font-semibold text-gray-700 mt-4 mb-1.5">용도</p>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map(c => (
            <button key={c} onClick={() => setCategory(c)}
              className={`px-3 py-1.5 rounded-full text-sm border ${category === c ? 'bg-green-600 border-green-600 text-white' : 'bg-white border-gray-200 text-gray-700'}`}>{c}</button>
          ))}
        </div>

        <input value={memo} onChange={e => setMemo(e.target.value)} placeholder="메모 (선택) — 예) 2층 화장실 각재"
          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm mt-4 focus:outline-none focus:border-green-500" />

        <button onClick={save} disabled={saving}
          className="w-full mt-4 py-3 rounded-xl bg-green-600 text-white font-semibold text-sm disabled:opacity-50">
          {saving ? '올리는 중…' : files.length > 1 ? `${files.length}장 저장` : '저장'}
        </button>
      </div>
    </div>
  )
}
