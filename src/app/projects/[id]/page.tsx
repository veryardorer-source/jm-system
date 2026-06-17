'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { supabase, Project, ProjectFile, Schedule } from '@/lib/supabase'

const TAB_LIST = ['자료', '공정']
const CATEGORY_LIST = ['시공전사진', '시공사진', '마감사진', '도면', '3D', '미팅내용', '고객요청', '구매링크', '기타']
const STATUS_COLOR: Record<string, string> = {
  '디자인진행중': 'bg-purple-100 text-purple-700',
  '견적진행중': 'bg-yellow-100 text-yellow-700',
  '시공진행중': 'bg-blue-100 text-blue-700',
  '완료': 'bg-green-100 text-green-700',
}

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [project, setProject] = useState<Project | null>(null)
  const [tab, setTab] = useState('자료')
  const [files, setFiles] = useState<ProjectFile[]>([])
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)

  const [showFileForm, setShowFileForm] = useState(false)
  const [fileForm, setFileForm] = useState({ category: '시공전사진', memo: '' })
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadCurrent, setUploadCurrent] = useState(0)
  const [copiedUrlId, setCopiedUrlId] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<string | null>(null)

  const [showScheduleForm, setShowScheduleForm] = useState(false)
  const [sForm, setSForm] = useState({ task_name: '', scheduled_date: '', end_date: '', manager: '' })
  const [savingS, setSavingS] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null)

  useEffect(() => { fetchAll() }, [id])

  async function fetchAll() {
    setLoading(true)
    const [p, f, s] = await Promise.all([
      supabase.from('projects').select('*').eq('id', id).single(),
      supabase.from('project_files').select('*').eq('project_id', id).order('created_at', { ascending: false }),
      supabase.from('schedules').select('*').eq('project_id', id).order('scheduled_date'),
    ])
    setProject(p.data)
    setFiles(f.data || [])
    setSchedules(s.data || [])
    setLoading(false)
  }

  async function handleFileUpload(e: React.FormEvent) {
    e.preventDefault()
    if (selectedFiles.length === 0) return
    setUploading(true)
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i]
      setUploadCurrent(i + 1)
      setUploadProgress(Math.round((i / selectedFiles.length) * 100))
      const ext = file.name.split('.').pop() || 'bin'
      const path = `files/${id}/${Date.now()}_${i}.${ext}`
      const { data: uploadData } = await supabase.storage.from('uploads').upload(path, file, {
        contentType: file.type || 'application/octet-stream',
      })
      if (uploadData) {
        const { data: urlData } = supabase.storage.from('uploads').getPublicUrl(path)
        await supabase.from('project_files').insert([{
          project_id: id,
          file_name: file.name,
          file_url: urlData.publicUrl,
          file_type: file.type,
          category: fileForm.category,
          memo: fileForm.memo,
        }])
      }
    }
    setUploadProgress(100)
    setFileForm({ category: '사진', memo: '' })
    setSelectedFiles([])
    setShowFileForm(false)
    setUploading(false)
    setUploadProgress(0)
    setUploadCurrent(0)
    fetchAll()
  }

  async function copyFileUrl(file: ProjectFile) {
    await navigator.clipboard.writeText(`${file.file_name}\n${file.file_url}`)
    setCopiedUrlId(file.id)
    setTimeout(() => setCopiedUrlId(null), 2000)
  }

  async function deleteFile(file: ProjectFile) {
    if (!confirm(`"${file.file_name}" 을 삭제할까요?`)) return
    // Storage에서 파일 경로 추출 후 삭제
    if (file.file_url) {
      const path = file.file_url.split('/uploads/')[1]
      if (path) await supabase.storage.from('uploads').remove([path])
    }
    await supabase.from('project_files').delete().eq('id', file.id)
    fetchAll()
  }

  async function handleSchedule(e: React.FormEvent) {
    e.preventDefault()
    setSavingS(true)
    if (editingSchedule) {
      await supabase.from('schedules').update({
        ...sForm,
        end_date: sForm.end_date || null,
      }).eq('id', editingSchedule.id)
      setEditingSchedule(null)
    } else {
      await supabase.from('schedules').insert([{ project_id: id, ...sForm, end_date: sForm.end_date || null }])
    }
    setSForm({ task_name: '', scheduled_date: '', end_date: '', manager: '' })
    setShowScheduleForm(false)
    setSavingS(false)
    fetchAll()
  }

  function openEditSchedule(s: Schedule) {
    setEditingSchedule(s)
    setSForm({ task_name: s.task_name, scheduled_date: s.scheduled_date || '', end_date: s.end_date || '', manager: s.manager || '' })
    setShowScheduleForm(true)
  }

  async function deleteSchedule(s: Schedule) {
    if (!confirm(`"${s.task_name}" 공정을 삭제할까요?`)) return
    await supabase.from('schedules').delete().eq('id', s.id)
    fetchAll()
  }

  async function setPhaseStatus(s: Schedule, status: '예정' | '진행중' | '완료') {
    await supabase.from('schedules').update({ phase_status: status, is_done: status === '완료' }).eq('id', s.id)
    fetchAll()
  }


  if (loading) return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex items-center justify-center text-gray-400">불러오는 중...</div>
    </div>
  )
  if (!project) return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex items-center justify-center text-gray-400">현장을 찾을 수 없어요</div>
    </div>
  )

  const pendingReceipts = receipts.filter(r => !r.is_processed).length
  const pendingWithdrawals = withdrawals.filter(w => w.status === '요청').length

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 헤더 */}
        <header className="bg-white border-b border-gray-200 px-8 py-5">
          <div className="flex items-center gap-3 mb-1">
            <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600 text-sm">← 목록</button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold text-gray-900">{project.name}</h1>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_COLOR[project.status]}`}>
                  {project.status}
                </span>
              </div>
              <div className="flex gap-4 mt-1">
                {project.client_name && <p className="text-sm text-gray-500">고객: {project.client_name}</p>}
                {project.manager && <p className="text-sm text-gray-500">담당: {project.manager}</p>}
                {project.address && <p className="text-sm text-gray-500">{project.address}</p>}
              </div>
            </div>
          </div>
        </header>

        {/* 탭 */}
        <div className="bg-white border-b border-gray-200 px-8">
          <div className="flex gap-1">
            {TAB_LIST.map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`relative px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                  tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}>
                {t}
                {t === '영수증' && pendingReceipts > 0 && (
                  <span className="ml-1.5 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">{pendingReceipts}</span>
                )}
                {t === '출금요청' && pendingWithdrawals > 0 && (
                  <span className="ml-1.5 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">{pendingWithdrawals}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-auto px-8 py-6">

          {/* 자료 탭 */}
          {tab === '자료' && (
            <div>
              <div className="flex justify-end mb-4">
                <button onClick={() => setShowFileForm(true)}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
                  + 자료 추가
                </button>
              </div>
              {files.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-200 text-center py-16 text-gray-400">
                  <p className="text-3xl mb-2">📁</p><p>등록된 자료가 없어요</p>
                </div>
              ) : (
                <div className="flex flex-col gap-6">
                  {CATEGORY_LIST.map(cat => {
                    const catFiles = files.filter(f => f.category === cat)
                    if (catFiles.length === 0) return null
                    const isPhoto = ['시공전사진','시공사진','마감사진'].includes(cat)
                    return (
                      <div key={cat}>
                        <h3 className="text-sm font-semibold text-gray-600 mb-3">{cat} <span className="text-gray-400 font-normal">({catFiles.length})</span></h3>
                        {isPhoto ? (
                          /* 사진: 그리드 썸네일 */
                          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
                            {catFiles.map(f => (
                              <div key={f.id} className="relative group aspect-square">
                                <img src={f.file_url} alt={f.file_name}
                                  onClick={() => setLightbox(f.file_url)}
                                  className="w-full h-full object-cover rounded-lg border border-gray-200 cursor-pointer hover:opacity-90 transition-opacity" />
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 rounded-lg transition-all flex items-end justify-between p-1 opacity-0 group-hover:opacity-100">
                                  <button onClick={() => copyFileUrl(f)}
                                    className="text-white bg-black/50 text-xs px-1.5 py-0.5 rounded">
                                    {copiedUrlId === f.id ? '✓' : '링크'}
                                  </button>
                                  <button onClick={() => deleteFile(f)}
                                    className="text-white bg-red-500/80 text-xs px-1.5 py-0.5 rounded">삭제</button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          /* 기타 파일: 리스트 */
                          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                            {catFiles.map((f, i) => (
                              <div key={f.id} className={`flex items-center gap-3 px-4 py-3 hover:bg-gray-50 ${i > 0 ? 'border-t border-gray-100' : ''}`}>
                                <span className="text-lg">{f.file_type?.includes('pdf') ? '📄' : f.file_type?.includes('image') ? '🖼️' : '📎'}</span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-800 truncate">{f.file_name}</p>
                                  {f.memo && <p className="text-xs text-gray-400">{f.memo}</p>}
                                </div>
                                <span className="text-xs text-gray-400 flex-shrink-0">{new Date(f.created_at).toLocaleDateString('ko-KR')}</span>
                                <a href={f.file_url} target="_blank" rel="noopener noreferrer"
                                  className="text-xs text-blue-600 hover:underline flex-shrink-0">열기</a>
                                <button onClick={() => copyFileUrl(f)}
                                  className={`text-xs flex-shrink-0 ${copiedUrlId === f.id ? 'text-green-600' : 'text-gray-400 hover:text-blue-600'}`}>
                                  {copiedUrlId === f.id ? '✓' : '링크'}
                                </button>
                                <button onClick={() => deleteFile(f)}
                                  className="text-xs text-red-400 hover:text-red-600 flex-shrink-0">삭제</button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* 공정 탭 */}
          {tab === '공정' && (
            <div>
              <div className="flex justify-end mb-4">
                <button onClick={() => setShowScheduleForm(true)}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
                  + 공정 추가
                </button>
              </div>
              {schedules.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-200 text-center py-16 text-gray-400">
                  <p className="text-3xl mb-2">📅</p><p>등록된 공정이 없어요</p>
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="text-left text-xs font-semibold text-gray-400 px-6 py-3">공정</th>
                        <th className="text-left text-xs font-semibold text-gray-400 px-4 py-3">시작일</th>
                        <th className="text-left text-xs font-semibold text-gray-400 px-4 py-3">종료일</th>
                        <th className="text-left text-xs font-semibold text-gray-400 px-4 py-3">담당자</th>
                        <th className="text-left text-xs font-semibold text-gray-400 px-4 py-3">상태</th>
                        <th className="px-4 py-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {schedules.map(s => {
                        const ps = s.phase_status || '예정'
                        return (
                        <tr key={s.id} className={`border-b border-gray-50 hover:bg-gray-50 ${ps === '완료' ? 'opacity-60' : ''}`}>
                          <td className={`px-6 py-3 text-sm font-medium ${ps === '완료' ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                            {s.task_name}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">{s.scheduled_date || '-'}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{s.end_date || '-'}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{s.manager || '-'}</td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1">
                              {(['예정', '진행중', '완료'] as const).map(st => (
                                <button key={st} onClick={() => setPhaseStatus(s, st)}
                                  className={`text-xs px-2 py-1 rounded-full font-medium border transition-colors ${
                                    ps === st
                                      ? st === '예정' ? 'bg-gray-200 text-gray-700 border-gray-300'
                                        : st === '진행중' ? 'bg-blue-100 text-blue-700 border-blue-300'
                                        : 'bg-green-100 text-green-700 border-green-300'
                                      : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'
                                  }`}>
                                  {st}
                                </button>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <button onClick={() => openEditSchedule(s)}
                                className="text-xs text-blue-400 hover:text-blue-600 hover:bg-blue-50 px-2 py-1 rounded transition-colors">
                                수정
                              </button>
                              <button onClick={() => deleteSchedule(s)}
                                className="text-xs text-red-400 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded transition-colors">
                                삭제
                              </button>
                            </div>
                          </td>
                        </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* 자료 추가 모달 */}
      {showFileForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <h2 className="text-lg font-bold">자료 업로드</h2>
              <button onClick={() => { setShowFileForm(false); setSelectedFiles([]) }} className="text-gray-400 text-2xl">&times;</button>
            </div>
            <form onSubmit={handleFileUpload} className="px-6 py-5 flex flex-col gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">파일 선택 * <span className="text-gray-400 font-normal">(여러 장 동시 선택 가능)</span></label>
                <DropZone files={selectedFiles} onChange={setSelectedFiles} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">분류</label>
                <select value={fileForm.category} onChange={e => setFileForm({...fileForm, category: e.target.value})}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {CATEGORY_LIST.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">메모</label>
                <input value={fileForm.memo} onChange={e => setFileForm({...fileForm, memo: e.target.value})}
                  placeholder="예) 거실 비포사진, 평면도 v2"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              {/* 업로드 진행바 */}
              {uploading && (
                <div>
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>{uploadCurrent}/{selectedFiles.length} 업로드 중...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div className="bg-blue-500 h-2 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                  </div>
                </div>
              )}

              <div className="flex gap-3 mt-2">
                <button type="button" onClick={() => { setShowFileForm(false); setSelectedFiles([]) }}
                  className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm font-medium">취소</button>
                <button type="submit" disabled={uploading || selectedFiles.length === 0}
                  className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
                  {uploading ? `업로드 중...` : selectedFiles.length > 1 ? `${selectedFiles.length}개 업로드` : '업로드'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 사진 크게 보기 */}
      {lightbox && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" className="max-w-full max-h-full object-contain rounded-lg" />
          <button className="absolute top-4 right-4 text-white text-3xl leading-none">&times;</button>
        </div>
      )}

      {/* 공정 추가 모달 */}
      {showScheduleForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <h2 className="text-lg font-bold">{editingSchedule ? '공정 수정' : '공정 추가'}</h2>
              <button onClick={() => { setShowScheduleForm(false); setEditingSchedule(null); setSForm({ task_name: '', scheduled_date: '', end_date: '', manager: '' }) }} className="text-gray-400 text-2xl">&times;</button>
            </div>
            <form onSubmit={handleSchedule} className="px-6 py-5 flex flex-col gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">공정명 *</label>
                <input required value={sForm.task_name} onChange={e => setSForm({...sForm, task_name: e.target.value})}
                  placeholder="목공, 타일, 입주청소"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1.5">시작일</label>
                  <input type="date" value={sForm.scheduled_date} onChange={e => setSForm({...sForm, scheduled_date: e.target.value})}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1.5">종료일</label>
                  <input type="date" value={sForm.end_date} onChange={e => setSForm({...sForm, end_date: e.target.value})}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">담당자</label>
                <input value={sForm.manager} onChange={e => setSForm({...sForm, manager: e.target.value})}
                  placeholder="김팀장"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="flex gap-3 mt-2">
                <button type="button" onClick={() => { setShowScheduleForm(false); setEditingSchedule(null); setSForm({ task_name: '', scheduled_date: '', end_date: '', manager: '' }) }}
                  className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm font-medium">취소</button>
                <button type="submit" disabled={savingS}
                  className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
                  {savingS ? '저장 중...' : editingSchedule ? '수정' : '추가'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function DropZone({ files, onChange }: { files: File[]; onChange: (f: File[]) => void }) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const addFiles = useCallback((newFiles: FileList | null) => {
    if (!newFiles) return
    onChange([...files, ...Array.from(newFiles)])
  }, [files, onChange])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    addFiles(e.dataTransfer.files)
  }, [addFiles])

  const totalMB = files.reduce((sum, f) => sum + f.size, 0) / 1024 / 1024

  return (
    <div>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`flex flex-col items-center justify-center w-full h-28 border-2 border-dashed rounded-xl cursor-pointer transition-all ${
          dragging ? 'border-blue-500 bg-blue-100 scale-[1.01]' :
          files.length > 0 ? 'border-blue-400 bg-blue-50' :
          'border-gray-300 hover:border-blue-400 hover:bg-blue-50'
        }`}
      >
        <input ref={inputRef} type="file" multiple className="hidden"
          onChange={e => addFiles(e.target.files)} />
        {files.length > 0 ? (
          <div className="text-center pointer-events-none">
            <p className="text-2xl mb-1">📁</p>
            <p className="text-sm font-semibold text-blue-600">{files.length}개 선택됨</p>
            <p className="text-xs text-gray-400 mt-0.5">총 {totalMB.toFixed(1)}MB · 클릭해서 추가</p>
          </div>
        ) : (
          <div className="text-center pointer-events-none">
            <p className="text-2xl mb-1">{dragging ? '📂' : '📁'}</p>
            <p className="text-sm font-medium text-gray-600">{dragging ? '여기에 놓으세요!' : '드래그하거나 클릭해서 선택'}</p>
            <p className="text-xs text-gray-400 mt-0.5">여러 파일 동시 선택 가능</p>
          </div>
        )}
      </div>
      {files.length > 0 && (
        <div className="mt-2 bg-gray-50 rounded-lg px-3 py-2 flex items-center justify-between">
          <span className="text-xs text-gray-600">{files.map(f => f.name).slice(0, 3).join(', ')}{files.length > 3 ? ` 외 ${files.length - 3}개` : ''}</span>
          <button type="button" onClick={() => onChange([])}
            className="text-xs text-red-400 hover:text-red-600 ml-3 flex-shrink-0">전체 취소</button>
        </div>
      )}
    </div>
  )
}
