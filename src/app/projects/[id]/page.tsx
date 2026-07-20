'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { supabase, Project, ProjectFile, Schedule, ProjectCost, ProjectAssignment, STATUS_LIST, STATUS_COLOR } from '@/lib/supabase'
import { useAuth, canEdit } from '@/lib/auth-context'
import { notifyOthers, notifyDM, notifyRoom } from '@/lib/notify'
import { compressImage } from '@/lib/image'
import Image from 'next/image'
import SnsTab from '@/components/SnsTab'

const TAB_LIST = ['현황', '자료', '공정', '비용', 'SNS']
const PHOTO_CATS = ['공사전사진', '시공전사진', '시공사진', '마감사진'] // 시공전사진=옛 이름 호환
const isVideoUrl = (url: string) => /\.(mp4|mov|webm|m4v|ogg|avi|mkv)$/i.test((url || '').split('?')[0])
const isVideoFile = (f: ProjectFile) => (f.file_type || '').startsWith('video') || isVideoUrl(f.file_url)
// 사진 분류에 섞인 PDF·문서를 구분 (이미지가 아니면 문서 카드로 표시)
const isImageFile = (f: ProjectFile) =>
  (f.file_type || '').startsWith('image') || /\.(jpg|jpeg|png|gif|webp|heic|heif|bmp)$/i.test(f.file_name || f.file_url || '')
const CATEGORY_LIST = ['공사전사진', '시공사진', '마감사진', '도면', '3D', '견적서', '계약서', '미팅내용', '고객요청', '구매링크', '기타']

function isHeic(file: File) {
  return /\.(heic|heif)$/i.test(file.name) || /^image\/hei(c|f)/i.test(file.type)
}

// 아이폰/일부 갤럭시가 찍는 HEIC는 브라우저 <img>로 표시가 안 되므로 업로드 전에 JPEG로 변환
async function toBrowserSafeImage(file: File): Promise<{ file: File; ext: string }> {
  const ext = file.name.split('.').pop() || 'bin'
  if (!isHeic(file)) return { file, ext }
  try {
    const heic2any = (await import('heic2any')).default
    // 30초 넘게 걸리면 포기하고 원본 업로드 (변환이 멈춰서 업로드 전체가 안 되는 것 방지)
    const result = await Promise.race([
      heic2any({ blob: file, toType: 'image/jpeg', quality: 0.85 }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('heic timeout')), 30000)),
    ])
    const blob = Array.isArray(result) ? result[0] : result
    const newName = file.name.replace(/\.(heic|heif)$/i, '.jpg')
    return { file: new File([blob as Blob], newName, { type: 'image/jpeg' }), ext: 'jpg' }
  } catch {
    return { file, ext } // 변환 실패 시 원본 그대로 업로드 (다운로드는 가능, 화면엔 HeicImg가 표시)
  }
}

// HEIC(아이폰 원본) 이미지는 브라우저가 못 띄우므로, 화면에 보여줄 때 즉석에서 JPEG로 변환해 표시.
// (업로드 자동변환을 거치지 않은 옛 파일도 이제 정상적으로 보임)
function HeicImg({ src, alt, className, onClick, thumb }: {
  src: string; alt?: string; className?: string; onClick?: (e: React.MouseEvent) => void
  thumb?: boolean // true=격자 썸네일 — 원본 대신 최적화된 작은 이미지 로드(모바일 속도)
}) {
  const heicSrc = /\.(heic|heif)$/i.test((src || '').split('?')[0])
  const [url, setUrl] = useState(heicSrc ? '' : src)
  useEffect(() => {
    if (!/\.(heic|heif)$/i.test((src || '').split('?')[0])) { setUrl(src); return }
    let created: string | null = null
    let cancelled = false
    setUrl('')
    ;(async () => {
      try {
        const heic2any = (await import('heic2any')).default
        const res = await fetch(src)
        const blob = await res.blob()
        const out = await heic2any({ blob, toType: 'image/jpeg', quality: 0.85 })
        const b = (Array.isArray(out) ? out[0] : out) as Blob
        if (cancelled) return
        created = URL.createObjectURL(b)
        setUrl(created)
      } catch { if (!cancelled) setUrl(src) }
    })()
    return () => { cancelled = true; if (created) URL.revokeObjectURL(created) }
  }, [src])
  if (!url) return (
    <div className={`${className || ''} bg-gray-100 flex items-center justify-center`} onClick={onClick}>
      <span className="text-[10px] text-gray-400 animate-pulse">사진 변환 중...</span>
    </div>
  )
  // 썸네일 모드 + 일반 이미지 → Vercel 이미지 최적화(작은 파일)로 로드. HEIC 변환본(blob:)은 그대로.
  if (thumb && !url.startsWith('blob:')) {
    return <Image src={url} alt={alt || ''} fill sizes="(max-width: 768px) 33vw, 200px"
      className={className} onClick={onClick} />
  }
  return <img src={url} alt={alt} className={className} onClick={onClick} loading="lazy" decoding="async" />
}

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { profile } = useAuth()
  const [project, setProject] = useState<Project | null>(null)
  const [tab, setTab] = useState('현황')

  // 알림 링크(?tab=자료/공정/비용)로 들어오면 해당 탭 바로 열기
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab')
    if (t && TAB_LIST.includes(t) && t !== '비용') setTab(t)
  }, [])
  useEffect(() => {
    // 비용 탭은 권한 확인 후에만 (field·partner는 금액 숨김)
    const t = new URLSearchParams(window.location.search).get('tab')
    if (t === '비용' && profile && profile.role !== 'field' && profile.role !== 'partner') setTab('비용')
  }, [profile])
  const [files, setFiles] = useState<ProjectFile[]>([])
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [costs, setCosts] = useState<ProjectCost[]>([])
  const [assignments, setAssignments] = useState<ProjectAssignment[]>([])
  const [loading, setLoading] = useState(true)

  const [showEditForm, setShowEditForm] = useState(false)
  const [editForm, setEditForm] = useState({ name: '', client_name: '', manager: '', address: '', status: '상담중', start_date: '', end_date: '', memo: '' })
  const [savingEdit, setSavingEdit] = useState(false)

  const [showFileForm, setShowFileForm] = useState(false)
  const [fileForm, setFileForm] = useState({ category: '공사전사진', memo: '', linkUrl: '', linkTitle: '' })
  const [editingLink, setEditingLink] = useState<ProjectFile | null>(null) // 구매링크 수정 중
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadCurrent, setUploadCurrent] = useState(0)
  const [copiedUrlId, setCopiedUrlId] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const touchStartX = useRef(0)

  const [collapsedCats, setCollapsedCats] = useState<Record<string, boolean>>({})
  const [collapsedZones, setCollapsedZones] = useState<Record<string, boolean>>({})
  const [photoGroup, setPhotoGroup] = useState<'date' | 'zone'>('date') // 사진 정렬: 날짜별/구역별
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set())
  const [selectMode, setSelectMode] = useState(false) // 켜면 사진을 탭해서 선택(모바일 편의)
  const [photoQuality, setPhotoQuality] = useState<'fast' | 'original'>('fast') // 빠른 업로드(크기 축소) / 원본
  const [showAccess, setShowAccess] = useState(false) // 외부협력업체 공개 설정 (관리자)
  const [partners, setPartners] = useState<{ id: string; name: string }[]>([])
  const [accessIds, setAccessIds] = useState<Set<string>>(new Set())
  const [accessBusy, setAccessBusy] = useState(false)
  const [showMove, setShowMove] = useState(false)         // 분류/현장 이동 모달
  const [showChatShare, setShowChatShare] = useState(false) // 채팅으로 공유 모달
  const [moveProjects, setMoveProjects] = useState<{ id: string; name: string }[]>([])
  const [moveProj, setMoveProj] = useState('')  // 이동할 현장 (기본=현재 현장)
  const [moveCat, setMoveCat] = useState('')    // 이동할 분류 (선택 필수)
  const [chatPeople, setChatPeople] = useState<{ id: string; name: string }[]>([])
  const [chatRooms, setChatRooms] = useState<{ id: string; name: string }[]>([])
  const [moving, setMoving] = useState(false)
  const [hoveredFileId, setHoveredFileId] = useState<string | null>(null)

  const [showScheduleForm, setShowScheduleForm] = useState(false)
  const [sForm, setSForm] = useState({ task_name: '', scheduled_date: '', end_date: '', manager: '' })
  const [savingS, setSavingS] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null)

  const [showCostForm, setShowCostForm] = useState(false)
  const [cForm, setCForm] = useState({ month: '', amount: '', memo: '' })
  const [costFile, setCostFile] = useState<File | null>(null)
  const [savingC, setSavingC] = useState(false)
  const [editingCost, setEditingCost] = useState<ProjectCost | null>(null)

  useEffect(() => { fetchAll() }, [id])

  async function fetchAll() {
    setLoading(true)
    const [p, f, s, c, a] = await Promise.all([
      supabase.from('projects').select('*').eq('id', id).single(),
      supabase.from('project_files').select('*').eq('project_id', id).order('created_at', { ascending: false }),
      supabase.from('schedules').select('*').eq('project_id', id).order('scheduled_date'),
      supabase.from('project_costs').select('*').eq('project_id', id).order('month', { ascending: false }),
      supabase.from('project_assignments').select('*').eq('project_id', id),
    ])
    setProject(p.data)
    setFiles(f.data || [])
    setSchedules(s.data || [])
    setCosts(c.data || [])
    setAssignments(a.data || [])
    setLoading(false)
  }

  function openEditProject() {
    if (!project) return
    setEditForm({
      name: project.name || '',
      client_name: project.client_name || '',
      manager: project.manager || '',
      address: project.address || '',
      status: project.status || '상담중',
      start_date: project.start_date || '',
      end_date: project.end_date || '',
      memo: project.memo || '',
    })
    setShowEditForm(true)
  }

  async function handleUpdateProject(e: React.FormEvent) {
    e.preventDefault()
    setSavingEdit(true)
    const { error } = await supabase.from('projects').update({
      ...editForm,
      start_date: editForm.start_date || null,
      end_date: editForm.end_date || null,
    }).eq('id', id)
    setSavingEdit(false)
    if (error) { alert('수정 실패: ' + error.message); return }
    setShowEditForm(false)
    fetchAll()
  }

  async function handleFileUpload(e: React.FormEvent) {
    e.preventDefault()

    // 구매링크: 파일 없이 URL만 저장 (수정 모드면 업데이트)
    if (fileForm.category === '구매링크') {
      if (!fileForm.linkUrl.trim()) return
      const payload = {
        file_name: fileForm.linkTitle.trim() || fileForm.linkUrl,
        file_url: fileForm.linkUrl.trim(),
        memo: fileForm.memo || '',
      }
      if (editingLink) {
        const { error } = await supabase.from('project_files').update(payload).eq('id', editingLink.id)
        if (error) { alert('수정 실패: ' + error.message); return }
      } else {
        const { error } = await supabase.from('project_files').insert([{
          project_id: id, file_type: 'link', category: '구매링크', uploaded_by: profile?.name || '', ...payload,
        }])
        if (error) { alert('저장 실패: ' + error.message); return }
        notifyOthers(profile?.id, { type: 'file', title: `${project?.name || '현장'} · 새 구매링크`, body: fileForm.linkTitle.trim() || '구매링크가 추가되었습니다', link: `/projects/${id}?tab=자료` })
      }
      setFileForm({ category: '구매링크', memo: '', linkUrl: '', linkTitle: '' })
      setEditingLink(null)
      setShowFileForm(false)
      fetchAll()
      return
    }

    // 미팅내용: 파일 없이 글만 저장 가능
    if (selectedFiles.length === 0 && fileForm.category === '미팅내용' && fileForm.memo.trim()) {
      const text = fileForm.memo.trim()
      const title = text.split('\n')[0].slice(0, 30) || '미팅내용'
      const { error } = await supabase.from('project_files').insert([{
        project_id: id, file_name: title, file_url: '', file_type: 'text',
        category: '미팅내용', memo: text, uploaded_by: profile?.name || '',
      }])
      if (error) { alert('저장 실패: ' + error.message); return }
      notifyOthers(profile?.id, { type: 'file', title: `${project?.name || '현장'} · 미팅내용 등록`, body: title, link: `/projects/${id}?tab=자료` })
      setFileForm({ category: '공사전사진', memo: '', linkUrl: '', linkTitle: '' })
      setShowFileForm(false)
      fetchAll()
      return
    }

    if (selectedFiles.length === 0) return
    const tooBig = selectedFiles.filter(f => f.size > 500 * 1024 * 1024)
    if (tooBig.length > 0) {
      alert(`아래 파일은 500MB가 넘어 올릴 수 없어요:\n\n${tooBig.map(f => `· ${f.name} (${Math.round(f.size / 1024 / 1024)}MB)`).join('\n')}\n\n동영상은 짧게 자르거나, 유튜브에 올린 뒤 '구매링크'에 주소를 넣어주세요.`)
      const ok = selectedFiles.filter(f => f.size <= 500 * 1024 * 1024)
      if (ok.length === 0) return
      setSelectedFiles(ok)
    }
    let uploadList = selectedFiles.filter(f => f.size <= 500 * 1024 * 1024)

    // 같은 이름의 파일이 이미 있으면 덮어쓸지 건너뛸지 확인
    const existingNames = new Set(files.map(f => f.file_name))
    const dupes = uploadList.filter(f => existingNames.has(f.name))
    if (dupes.length > 0) {
      const overwrite = confirm(
        `같은 이름의 자료 ${dupes.length}개가 이미 있어요:\n${dupes.slice(0, 5).map(f => '· ' + f.name).join('\n')}${dupes.length > 5 ? `\n외 ${dupes.length - 5}개` : ''}\n\n[확인] = 덮어쓰기 (기존을 지우고 새로 올림)\n[취소] = 건너뛰기 (기존은 두고 중복은 안 올림)`
      )
      if (overwrite) {
        const toRemove = files.filter(f => dupes.some(d => d.name === f.file_name))
        const paths = toRemove.map(f => f.file_url.split('/uploads/')[1]).filter(Boolean)
        if (paths.length) await supabase.storage.from('uploads').remove(paths)
        const ids = toRemove.map(f => f.id)
        if (ids.length) await supabase.from('project_files').delete().in('id', ids)
      } else {
        uploadList = uploadList.filter(f => !existingNames.has(f.name))
        if (uploadList.length === 0) { setShowFileForm(false); setSelectedFiles([]); return }
      }
    }

    setUploading(true)
    // 3장씩 동시에 올려 속도 개선. HEIC 무거운 변환(heic2any)은 메모리 보호를 위해 한 장씩만.
    const CONC = 3
    let done = 0
    let failMsg = ''
    let heicChain: Promise<unknown> = Promise.resolve()
    const convertHeicSerial = (f: File) => {
      const run = heicChain.then(() => toBrowserSafeImage(f))
      heicChain = run.catch(() => {})
      return run as Promise<{ file: File; ext: string }>
    }
    for (let i = 0; i < uploadList.length; i += CONC) {
      const chunk = uploadList.slice(i, i + CONC)
      await Promise.all(chunk.map(async (orig, j) => {
        let file = orig
        let ext = orig.name.split('.').pop() || 'bin'
        // 1) 빠른 업로드: 기기 내장 변환으로 축소 시도 (아이폰 사파리는 HEIC도 여기서 즉시 JPEG化 — 매우 빠름)
        if (photoQuality === 'fast') {
          const c = await compressImage(orig)
          if (c !== orig) { file = c; ext = 'jpg' }
        }
        // 2) 아직 HEIC 그대로면(내장 변환 미지원 브라우저) heic2any로 — 한 장씩 순차 처리
        if (file === orig && isHeic(orig)) {
          const r = await convertHeicSerial(orig)
          file = r.file; ext = r.ext
          if (photoQuality === 'fast' && r.ext === 'jpg') {
            const c2 = await compressImage(file)
            if (c2 !== file) { file = c2; ext = 'jpg' }
          }
        }
        const path = `files/${id}/${Date.now()}_${i + j}.${ext}`
        const { error: uploadError } = await supabase.storage.from('uploads').upload(path, file, {
          contentType: file.type || 'application/octet-stream',
          upsert: true,
        })
        if (uploadError) { failMsg = uploadError.message; return }
        const { data: urlData } = supabase.storage.from('uploads').getPublicUrl(path)
        const { error: insertError } = await supabase.from('project_files').insert([{
          project_id: id,
          file_name: file.name,
          file_url: urlData.publicUrl,
          file_type: file.type || '',
          category: fileForm.category.trim() || '기타',
          memo: fileForm.memo || '',
          uploaded_by: profile?.name || '',
        }])
        if (insertError) { failMsg = insertError.message; return }
        done++
        setUploadCurrent(done)
        setUploadProgress(Math.round((done / uploadList.length) * 100))
      }))
    }
    if (failMsg && done < uploadList.length) alert(`${uploadList.length - done}장 업로드 실패: ${failMsg}`)
    setUploadProgress(100)
    notifyOthers(profile?.id, { type: 'file', title: `${project?.name || '현장'} · 새 자료 ${uploadList.length}건`, body: `${fileForm.category} 자료가 업로드되었습니다`, link: `/projects/${id}?tab=자료` })
    setFileForm({ category: '공사전사진', memo: '', linkUrl: '', linkTitle: '' })
    setSelectedFiles([])
    setShowFileForm(false)
    setUploading(false)
    setUploadProgress(0)
    setUploadCurrent(0)
    fetchAll()
  }

  async function downloadFile(file: ProjectFile) {
    try {
      const res = await fetch(file.file_url, { mode: 'cors', credentials: 'omit' })
      if (!res.ok) throw new Error('fetch failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = file.file_name
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      window.open(file.file_url, '_blank')
    }
  }

  const isMobile = () => typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches

  // canShare가 없는 브라우저도 있어 존재 여부부터 확인(없으면 그냥 공유 시도)
  const canShareFiles = (fs: File[]) => !('canShare' in navigator) || (navigator.canShare?.({ files: fs }) ?? true)

  async function shareFile(file: ProjectFile) {
    if (isMobile() && navigator.share) {
      try {
        const res = await fetch(file.file_url, { mode: 'cors', credentials: 'omit' })
        const blob = await res.blob()
        const fileObj = new File([blob], file.file_name, { type: blob.type })
        if (canShareFiles([fileObj])) {
          await navigator.share({ files: [fileObj], title: file.file_name })
          return
        }
      } catch (e: unknown) {
        if (e instanceof Error && e.name === 'AbortError') return
      }
    }
    downloadFile(file)
  }

  async function shareFiles(fileList: ProjectFile[]) {
    if (fileList.length === 0) return
    if (isMobile() && navigator.share) {
      try {
        const fileObjects = await Promise.all(fileList.map(async f => {
          const res = await fetch(f.file_url, { mode: 'cors', credentials: 'omit' })
          const blob = await res.blob()
          return new File([blob], f.file_name, { type: blob.type })
        }))
        // 1) 한 번에 전부 공유
        if (canShareFiles(fileObjects)) {
          await navigator.share({ files: fileObjects, title: 'JM 자료' })
          return
        }
        // 2) 한 번에 안 되면 나눠서 공유(다운로드 대신 공유 유지) — 카톡 등 공유창이 여러 번 열림
        const chunk = 10
        for (let i = 0; i < fileObjects.length; i += chunk) {
          const part = fileObjects.slice(i, i + chunk).filter(fo => canShareFiles([fo]))
          if (part.length) await navigator.share({ files: part, title: 'JM 자료' })
        }
        return
      } catch (e: unknown) {
        if (e instanceof Error && e.name === 'AbortError') return
      }
    }
    // 공유 미지원(주로 데스크톱) → 다운로드
    for (const f of fileList) {
      await downloadFile(f)
      await new Promise(r => setTimeout(r, 300))
    }
  }

  // 폴더를 한 번만 고르면 그 안에 전부 저장 (PC 크롬 등). 미지원 시 기존 방식으로.
  async function saveAll(fileList: ProjectFile[]) {
    if (fileList.length === 0) return
    const w = window as unknown as { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> }
    if (typeof w.showDirectoryPicker === 'function') {
      let dir: FileSystemDirectoryHandle
      try { dir = await w.showDirectoryPicker() } catch { return } // 사용자가 취소
      const used = new Set<string>()
      let ok = 0
      for (let i = 0; i < fileList.length; i++) {
        const f = fileList[i]
        try {
          const res = await fetch(f.file_url, { mode: 'cors', credentials: 'omit' })
          if (!res.ok) continue
          const blob = await res.blob()
          let name = f.file_name || `file_${i}`
          if (used.has(name)) {
            const dot = name.lastIndexOf('.')
            name = dot > 0 ? `${name.slice(0, dot)}_${i}${name.slice(dot)}` : `${name}_${i}`
          }
          used.add(name)
          const fh = await dir.getFileHandle(name, { create: true })
          const ws = await fh.createWritable()
          await ws.write(blob)
          await ws.close()
          ok++
        } catch { /* 개별 실패는 건너뜀 */ }
      }
      alert(`${ok}개 저장 완료!`)
      return
    }
    // 폴더 선택 미지원(모바일/사파리) → 공유 또는 개별 다운로드
    await shareFiles(fileList)
  }

  async function copyFileUrl(file: ProjectFile) {
    await navigator.clipboard.writeText(`${file.file_name}\n${file.file_url}`)
    setCopiedUrlId(file.id)
    setTimeout(() => setCopiedUrlId(null), 2000)
  }

  async function deleteFile(file: ProjectFile) {
    if (!confirm(`"${file.file_name}" 을 삭제할까요?`)) return
    if (file.file_url) {
      const path = file.file_url.split('/uploads/')[1]
      if (path) await supabase.storage.from('uploads').remove([path])
    }
    await supabase.from('project_files').delete().eq('id', file.id)
    fetchAll()
  }

  async function deleteSelectedFiles() {
    if (selectedFileIds.size === 0) return
    if (!confirm(`선택한 ${selectedFileIds.size}장을 삭제할까요?`)) return
    const toDelete = files.filter(f => selectedFileIds.has(f.id))
    const paths = toDelete.map(f => f.file_url.split('/uploads/')[1]).filter(Boolean)
    if (paths.length > 0) await supabase.storage.from('uploads').remove(paths)
    const ids = Array.from(selectedFileIds)
    const { error } = await supabase.from('project_files').delete().in('id', ids)
    if (error) { alert('삭제 실패: ' + error.message); return }
    setSelectedFileIds(new Set())
    fetchAll()
  }

  function toggleSelectFile(fileId: string) {
    setSelectedFileIds(prev => {
      const next = new Set(prev)
      next.has(fileId) ? next.delete(fileId) : next.add(fileId)
      return next
    })
    setSelectMode(true) // 한 번 선택을 시작하면 탭으로 계속 선택되게
  }

  function clearSelection() {
    setSelectedFileIds(new Set())
    setSelectMode(false)
  }

  // ── 외부협력업체 현장별 공개 설정 (관리자) ──
  useEffect(() => {
    if (!showAccess) return
    supabase.from('profiles').select('id, name').eq('role', 'partner').then(({ data }) => setPartners(data || []))
    supabase.from('project_access').select('user_id').eq('project_id', id).then(({ data, error }) => {
      if (error) { alert('공개설정을 불러오지 못했어요.\n(관리자에게: db/project_access.sql 실행 필요)\n' + error.message); setShowAccess(false); return }
      setAccessIds(new Set((data || []).map(r => r.user_id)))
    })
  }, [showAccess, id])

  async function toggleAccess(uid: string) {
    if (accessBusy) return
    setAccessBusy(true)
    if (accessIds.has(uid)) {
      const { error } = await supabase.from('project_access').delete().eq('project_id', id).eq('user_id', uid)
      if (!error) setAccessIds(prev => { const n = new Set(prev); n.delete(uid); return n })
      else alert('해제 실패: ' + error.message)
    } else {
      const { error } = await supabase.from('project_access').insert([{ project_id: id, user_id: uid }])
      if (!error) setAccessIds(prev => new Set(prev).add(uid))
      else alert('공개 실패: ' + error.message)
    }
    setAccessBusy(false)
  }

  // ── 선택 자료 이동/공유 ──
  useEffect(() => {
    if (!showMove) return
    setMoveProj(id)   // 기본: 현재 현장
    setMoveCat('')    // 분류는 직접 선택해야 이동 가능
    supabase.from('projects').select('id, name').neq('id', id).order('name').then(({ data }) => setMoveProjects(data || []))
  }, [showMove, id])

  useEffect(() => {
    if (!showChatShare || !profile?.id) return
    supabase.from('profiles').select('id, name').neq('id', profile.id).then(({ data }) => setChatPeople(data || []))
    supabase.from('chat_room_members').select('room_id').eq('user_id', profile.id).then(async ({ data }) => {
      const ids = (data || []).map(m => m.room_id)
      if (!ids.length) { setChatRooms([]); return }
      const { data: rooms } = await supabase.from('chat_rooms').select('id, name').in('id', ids)
      setChatRooms(rooms || [])
    })
  }, [showChatShare, profile?.id])

  // 현장 + 분류를 모두 고른 뒤 [이동하기]로 실행
  async function doMove() {
    if (!moveCat || moving) return
    setMoving(true)
    const payload: Record<string, string> = { category: moveCat }
    if (moveProj && moveProj !== id) payload.project_id = moveProj
    const { error } = await supabase.from('project_files').update(payload).in('id', Array.from(selectedFileIds))
    setMoving(false)
    if (error) { alert('이동 실패: ' + error.message); return }
    setShowMove(false)
    clearSelection()
    fetchAll()
  }

  // 선택 자료를 채팅으로 보내기 — 파일을 다시 올리지 않고 기존 URL 그대로 메시지로 전송
  async function sendToChat(target: { kind: 'all' | 'dm' | 'room'; id?: string; name: string }) {
    if (moving || !profile?.id) return
    const sel = files.filter(f => selectedFileIds.has(f.id) && f.file_type !== 'link' && f.file_url)
    if (!sel.length) { alert('보낼 수 있는 파일이 없어요 (링크 항목은 제외됩니다)'); return }
    setMoving(true)
    const isImg = (f: ProjectFile) => (f.file_type || '').startsWith('image') || /\.(jpg|jpeg|png|gif|webp|heic)$/i.test(f.file_name || '')
    const recipient_id = target.kind === 'dm' ? target.id : null
    const room_id = target.kind === 'room' ? target.id : null
    const imgUrls = sel.filter(isImg).map(f => f.file_url)
    const others = sel.filter(f => !isImg(f))
    const base = { sender_id: profile.id, sender_name: profile.name || '직원', recipient_id, room_id, content: '' }
    const rows: Record<string, unknown>[] = []
    // 사진들은 한 묶음(한 메시지)으로
    if (imgUrls.length === 1) rows.push({ ...base, image_url: imgUrls[0] })
    else if (imgUrls.length > 1) rows.push({ ...base, image_url: imgUrls[0], images: imgUrls })
    others.forEach(f => rows.push({ ...base, file_url: f.file_url, file_name: f.file_name }))
    const { error } = await supabase.from('messages').insert(rows)
    setMoving(false)
    if (error) { alert('공유 실패: ' + error.message); return }
    const body = `${project?.name || '현장'} 자료 ${sel.length}건`
    if (target.kind === 'dm' && target.id && target.id !== profile.id) notifyDM(target.id, `${profile.name || '직원'} 님의 메시지`, body, `/chat?dm=${profile.id}`)
    else if (target.kind === 'room' && target.id) notifyRoom(target.id, `${target.name} · ${profile.name || '직원'}`, body, `/chat?room=${target.id}`)
    setShowChatShare(false)
    clearSelection()
    alert(`${sel.length}건을 "${target.name}"(으)로 보냈어요. 채팅에서 확인하세요!`)
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
      notifyOthers(profile?.id, { type: 'schedule', title: `${project?.name || '현장'} · 공정 추가`, body: `${sForm.task_name} (${sForm.scheduled_date})`, link: `/projects/${id}?tab=공정` })
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

  async function handleCost(e: React.FormEvent) {
    e.preventDefault()
    if (!cForm.month) return
    setSavingC(true)
    let file_url = editingCost?.file_url || ''
    let file_name = editingCost?.file_name || ''
    if (costFile) {
      const ext = costFile.name.split('.').pop() || 'bin'
      const path = `costs/${id}/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('uploads').upload(path, costFile, {
        contentType: costFile.type || 'application/octet-stream',
        upsert: true,
      })
      if (upErr) { alert('파일 업로드 실패: ' + upErr.message); setSavingC(false); return }
      const { data: urlData } = supabase.storage.from('uploads').getPublicUrl(path)
      file_url = urlData.publicUrl
      file_name = costFile.name
    }
    const payload = {
      month: cForm.month + '-01',
      amount: Number(cForm.amount) || 0,
      memo: cForm.memo,
      file_url, file_name,
    }
    if (editingCost) {
      await supabase.from('project_costs').update(payload).eq('id', editingCost.id)
      setEditingCost(null)
    } else {
      await supabase.from('project_costs').insert([{ project_id: id, ...payload }])
      // 금액은 알림에 노출하지 않음 (금액 숨김 대상 직원도 알림은 받으므로)
      notifyOthers(profile?.id, { type: 'cost', title: `${project?.name || '현장'} · 비용 자료 등록`, body: `${cForm.month}${file_name ? ` · ${file_name}` : ''}`, link: `/projects/${id}?tab=비용` })
    }
    setCForm({ month: '', amount: '', memo: '' })
    setCostFile(null)
    setShowCostForm(false)
    setSavingC(false)
    fetchAll()
  }

  function openEditCost(c: ProjectCost) {
    setEditingCost(c)
    setCForm({ month: c.month ? c.month.slice(0, 7) : '', amount: String(c.amount), memo: c.memo || '' })
    setCostFile(null)
    setShowCostForm(true)
  }

  async function deleteCost(c: ProjectCost) {
    if (!confirm(`${c.month?.slice(0,7)} 자료를 삭제할까요?`)) return
    if (c.file_url) {
      const path = c.file_url.split('/uploads/')[1]
      if (path) await supabase.storage.from('uploads').remove([path])
    }
    await supabase.from('project_costs').delete().eq('id', c.id)
    fetchAll()
  }


  const zoneOf = (f: ProjectFile) => (f.memo || '').trim() || '미분류'
  const groupByZone = (arr: ProjectFile[]): [string, ProjectFile[]][] => {
    const m = new Map<string, ProjectFile[]>()
    arr.forEach(f => { const z = zoneOf(f); if (!m.has(z)) m.set(z, []); m.get(z)!.push(f) })
    return Array.from(m.entries()).sort((a, b) =>
      a[0] === '미분류' ? 1 : b[0] === '미분류' ? -1 : a[0].localeCompare(b[0], 'ko'))
  }

  // 파일명에 날짜(20260615 / 2026-06-15 등)가 있으면 그 날짜, 없으면 업로드 날짜로
  const fileDate = (f: ProjectFile): string => {
    const mt = (f.file_name || '').match(/(20\d{2})[._-]?(0[1-9]|1[0-2])[._-]?(0[1-9]|[12]\d|3[01])/)
    if (mt) return `${mt[1]}-${mt[2]}-${mt[3]}`
    return (f.created_at || '').slice(0, 10)
  }

  // 사진 분류에 섞인 문서(PDF·엑셀 등) 열기
  function openDocFile(f: ProjectFile) {
    const name = (f.file_name || f.file_url).toLowerCase()
    if (/\.(xlsx|xls|xlsb|xlsm|doc|docx|ppt|pptx)$/.test(name)) window.open(`https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(f.file_url)}`, '_blank')
    else if (name.endsWith('.pdf')) window.open(`https://docs.google.com/viewer?url=${encodeURIComponent(f.file_url)}`, '_blank')
    else window.open(f.file_url, '_blank')
  }

  function renderPhotoTile(f: ProjectFile) {
    const isSelected = selectedFileIds.has(f.id)
    const isHovered = hoveredFileId === f.id
    const isDoc = !isVideoFile(f) && !isImageFile(f) && f.file_type !== 'link'
    return (
      <div key={f.id} className="relative group aspect-square"
        onMouseEnter={() => setHoveredFileId(f.id)}
        onMouseLeave={() => setHoveredFileId(null)}>
        {isDoc ? (
          <button
            onClick={() => (selectMode && !readOnly) ? toggleSelectFile(f.id) : openDocFile(f)}
            className={`w-full h-full rounded-lg border flex flex-col items-center justify-center gap-1.5 px-2 bg-gray-50 hover:bg-gray-100 transition-all ${
              isSelected ? 'border-green-500 ring-2 ring-green-500' : 'border-gray-200'
            }`}>
            <span className="text-3xl">{/\.pdf$/i.test(f.file_name || '') ? '📄' : /\.(xlsx?|xlsb|xlsm)$/i.test(f.file_name || '') ? '📊' : '📎'}</span>
            <span className="text-[11px] text-gray-600 text-center leading-snug line-clamp-3 break-all">{f.file_name}</span>
            <span className="text-[10px] text-green-600">눌러서 열기</span>
          </button>
        ) : isVideoFile(f) ? (
          <video src={f.file_url} muted playsInline preload="metadata"
            onClick={() => (selectMode && !readOnly) ? toggleSelectFile(f.id) : setLightbox(f.file_url)}
            className={`w-full h-full object-cover rounded-lg border cursor-pointer transition-all ${
              isSelected ? 'border-green-500 ring-2 ring-green-500 brightness-90' : 'border-gray-200'
            }`} />
        ) : (
          <HeicImg src={f.file_url} alt={f.file_name} thumb
            onClick={() => (selectMode && !readOnly) ? toggleSelectFile(f.id) : setLightbox(f.file_url)}
            className={`w-full h-full object-cover rounded-lg border cursor-pointer transition-all ${
              isSelected ? 'border-green-500 ring-2 ring-green-500 brightness-90' : 'border-gray-200'
            }`} />
        )}
        {isVideoFile(f) && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="bg-black/55 text-white rounded-full w-9 h-9 flex items-center justify-center text-base">▶</span>
          </div>
        )}
        {isSelected && (<div className="absolute inset-0 bg-green-500/15 rounded-lg pointer-events-none" />)}
        {!readOnly && (
        <button
          onClick={e => { e.stopPropagation(); toggleSelectFile(f.id) }}
          title="선택"
          className={`absolute top-1.5 left-1.5 w-7 h-7 rounded-full border-2 flex items-center justify-center text-sm font-bold transition-all shadow-sm z-10 ${
            isSelected ? 'bg-green-500 border-green-500 text-white' : `bg-white/80 border-gray-300 ${selectMode ? 'opacity-100' : 'opacity-100 md:opacity-0 md:group-hover:opacity-100'}`
          }`}>
          {isSelected ? '✓' : ''}
        </button>
        )}
        <button
          onClick={e => { e.stopPropagation(); setLightbox(f.file_url) }}
          className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/50 text-white flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity z-10"
          title="크게 보기">⛶</button>
        {f.uploaded_by && !isHovered && (
          <span className="absolute bottom-1 left-1 bg-black/55 text-white text-[10px] px-1.5 py-0.5 rounded max-w-[85%] truncate pointer-events-none">{f.uploaded_by}</span>
        )}
        {isHovered && (
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent rounded-b-lg flex items-end justify-between p-1.5 gap-1">
            <button onClick={e => { e.stopPropagation(); shareFile(f) }}
              className="text-white bg-black/40 text-xs px-1.5 py-0.5 rounded hover:bg-black/60">내보내기</button>
            <button onClick={e => { e.stopPropagation(); downloadFile(f) }}
              className="text-white bg-black/40 text-xs px-1.5 py-0.5 rounded hover:bg-black/60">저장</button>
          </div>
        )}
      </div>
    )
  }

  const canSeeMoney = profile?.role !== 'field' && profile?.role !== 'partner'
  const readOnly = !canEdit(profile)
  const visibleTabs = canSeeMoney ? TAB_LIST : TAB_LIST.filter(t => t !== '비용')
  const doneCount = schedules.filter(s => (s.phase_status || '예정') === '완료').length
  const inProgressCount = schedules.filter(s => s.phase_status === '진행중').length
  const progressPct = schedules.length ? Math.round((doneCount / schedules.length) * 100) : 0
  const photos = files.filter(f => PHOTO_CATS.includes(f.category))
  const recentPhotos = photos.slice(0, 8)
  const totalCost = costs.reduce((sum, c) => sum + (c.amount || 0), 0)
  const staff = Array.from(new Set(assignments.map(a => a.employee_name).filter(Boolean)))
  // 기본 분류 + 직접 추가된(파일에 존재하는) 분류
  const allCategories = Array.from(new Set([...CATEGORY_LIST, ...files.map(f => f.category).filter(Boolean)]))

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

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <Sidebar />

      <div className="flex-1 flex flex-col">
        {/* 헤더 */}
        <header className="bg-white border-b border-gray-200 px-4 md:px-8 py-4 md:py-5">
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
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                {project.client_name && <p className="text-sm text-gray-500">고객: {project.client_name}</p>}
                {project.manager && <p className="text-sm text-gray-500">담당: {project.manager}</p>}
                <p className="text-sm text-gray-500">{project.address || <span className="text-gray-300">주소 미입력</span>}</p>
              </div>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              {!readOnly && (
                <button onClick={() => setShowAccess(true)}
                  className="border border-amber-300 text-amber-700 px-3 py-1.5 rounded-lg text-sm hover:bg-amber-50">
                  🔒 외부공개
                </button>
              )}
              {!readOnly && (
                <button onClick={openEditProject}
                  className="border border-gray-300 text-gray-600 px-3 py-1.5 rounded-lg text-sm hover:bg-gray-50">
                  현장 수정
                </button>
              )}
            </div>
          </div>
        </header>

        {/* 탭 */}
        <div className="bg-white border-b border-gray-200 px-4 md:px-8">
          <div className="flex gap-1">
            {visibleTabs.map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`relative px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                  tab === t ? 'border-green-600 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}>
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-auto px-4 md:px-8 py-4 md:py-6 pb-20 md:pb-6">

          {/* SNS 탭 */}
          {tab === 'SNS' && <SnsTab projectId={id} readOnly={readOnly} />}

          {/* 현황(대시보드) 탭 */}
          {tab === '현황' && (
            <div className="flex flex-col gap-4">
              {/* 요약 카드 */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <button onClick={() => setTab('공정')}
                  className="bg-white rounded-xl border border-gray-200 p-4 text-left hover:border-green-400 transition-colors">
                  <p className="text-xs text-gray-400 mb-1">공정 진행률</p>
                  <p className="text-2xl font-bold text-gray-900">{progressPct}%</p>
                  <p className="text-xs text-gray-400 mt-0.5">{doneCount}/{schedules.length} 완료 · 진행 {inProgressCount}</p>
                </button>
                <button onClick={() => setTab('자료')}
                  className="bg-white rounded-xl border border-gray-200 p-4 text-left hover:border-green-400 transition-colors">
                  <p className="text-xs text-gray-400 mb-1">등록 자료</p>
                  <p className="text-2xl font-bold text-gray-900">{files.length}<span className="text-sm font-normal text-gray-400">개</span></p>
                  <p className="text-xs text-gray-400 mt-0.5">사진 {photos.length} · 기타 {files.length - photos.length}</p>
                </button>
                <button onClick={() => setTab('자료')}
                  className="bg-white rounded-xl border border-gray-200 p-4 text-left hover:border-green-400 transition-colors">
                  <p className="text-xs text-gray-400 mb-1">사진</p>
                  <p className="text-2xl font-bold text-gray-900">{photos.length}<span className="text-sm font-normal text-gray-400">장</span></p>
                </button>
                {canSeeMoney ? (
                  <button onClick={() => setTab('비용')}
                    className="bg-white rounded-xl border border-gray-200 p-4 text-left hover:border-green-400 transition-colors">
                    <p className="text-xs text-gray-400 mb-1">누적 비용</p>
                    <p className="text-2xl font-bold text-gray-900">{Math.round(totalCost / 10000).toLocaleString()}<span className="text-sm font-normal text-gray-400">만원</span></p>
                  </button>
                ) : (
                  <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <p className="text-xs text-gray-400 mb-1">누적 비용</p>
                    <p className="text-sm text-gray-300 mt-2">관리자만 열람</p>
                  </div>
                )}
              </div>

              {/* 공정 현황 */}
              <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-700">공정 현황</h3>
                  <button onClick={() => setTab('공정')} className="text-xs text-green-600 hover:text-green-700">공정 자세히 →</button>
                </div>
                {schedules.length === 0 ? (
                  <p className="text-sm text-gray-400 py-6 text-center">등록된 공정이 없어요</p>
                ) : (
                  <>
                    <div className="mb-4">
                      <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span>전체 진행</span><span>{progressPct}%</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2.5">
                        <div className="bg-green-500 h-2.5 rounded-full transition-all" style={{ width: `${progressPct}%` }} />
                      </div>
                    </div>
                    <div className="flex flex-col gap-2.5">
                      {schedules.map(s => {
                        const ps = s.phase_status || '예정'
                        const barW = ps === '완료' ? 100 : ps === '진행중' ? 50 : 0
                        const barColor = ps === '완료' ? 'bg-green-500' : ps === '진행중' ? 'bg-amber-400' : 'bg-gray-200'
                        const labelColor = ps === '완료' ? 'text-green-600' : ps === '진행중' ? 'text-amber-600' : 'text-gray-400'
                        return (
                          <div key={s.id} className="flex items-center gap-3">
                            <span className="w-20 md:w-28 text-sm text-gray-700 truncate flex-shrink-0">{s.task_name}</span>
                            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${barColor}`} style={{ width: `${barW}%` }} />
                            </div>
                            <span className={`w-12 text-right text-xs font-medium flex-shrink-0 ${labelColor}`}>{ps}</span>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>

              {/* 자료 미리보기 + 비용 요약 */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-700">현장 자료</h3>
                    <button onClick={() => setTab('자료')} className="text-xs text-green-600 hover:text-green-700">자료 자세히 →</button>
                  </div>
                  {recentPhotos.length === 0 ? (
                    <p className="text-sm text-gray-400 py-6 text-center">등록된 사진이 없어요</p>
                  ) : (
                    <div className="grid grid-cols-4 gap-1.5">
                      {recentPhotos.map(f => (
                        <div key={f.id} className="relative aspect-square cursor-pointer" onClick={() => setLightbox(f.file_url)}>
                          {isVideoFile(f) ? (
                            <video src={f.file_url} muted playsInline preload="metadata"
                              className="w-full h-full object-cover rounded-lg border border-gray-200" />
                          ) : (
                            <img src={f.file_url} alt={f.file_name}
                              className="w-full h-full object-cover rounded-lg border border-gray-200 hover:brightness-95" />
                          )}
                          {isVideoFile(f) && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                              <span className="bg-black/55 text-white rounded-full w-7 h-7 flex items-center justify-center text-sm">▶</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {allCategories.map(cat => {
                      const n = files.filter(f => f.category === cat).length
                      if (!n) return null
                      return <span key={cat} className="text-xs bg-gray-50 text-gray-500 border border-gray-200 rounded-full px-2 py-0.5">{cat} {n}</span>
                    })}
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-700">배정 직원 · 비용</h3>
                    {canSeeMoney && <button onClick={() => setTab('비용')} className="text-xs text-green-600 hover:text-green-700">비용 자세히 →</button>}
                  </div>

                  {/* 배정 직원 */}
                  {staff.length === 0 && !project.manager ? (
                    <p className="text-sm text-gray-400 mb-3">배정된 직원이 없어요</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {project.manager && (
                        <span className="inline-flex items-center gap-1.5 bg-green-50 border border-green-200 rounded-full px-2.5 py-1 text-sm text-green-700">
                          <span className="w-5 h-5 rounded-full bg-green-200 text-green-800 flex items-center justify-center text-xs">{project.manager.slice(0, 1)}</span>
                          {project.manager} <span className="text-green-500 text-xs">담당</span>
                        </span>
                      )}
                      {staff.filter(n => n !== project.manager).map(name => (
                        <span key={name} className="inline-flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-full px-2.5 py-1 text-sm text-gray-700">
                          <span className="w-5 h-5 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center text-xs">{name.slice(0, 1)}</span>
                          {name}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* 비용 */}
                  {canSeeMoney ? (
                    <div className="border-t border-gray-100 pt-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm text-gray-500">누적 원가</span>
                        <span className="text-lg font-bold text-gray-900">{totalCost.toLocaleString()}원</span>
                      </div>
                      {costs.slice(0, 3).map(c => (
                        <div key={c.id} className="flex items-center justify-between text-sm mt-1">
                          <span className="text-gray-400">{c.month?.slice(0, 7) || '-'}</span>
                          <span className="text-gray-700">{c.amount.toLocaleString()}원</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="border-t border-gray-100 pt-3 text-sm text-gray-300">비용 정보는 관리자만 볼 수 있어요</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 자료 탭 */}
          {tab === '자료' && (
            <div>
              <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
                <div className="flex gap-2 items-center">
                  {!readOnly && (
                    <button onClick={() => { setSelectMode(m => !m); if (selectMode) setSelectedFileIds(new Set()) }}
                      className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        selectMode ? 'bg-green-600 text-white border-green-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                      }`}>
                      {selectMode ? '선택 완료' : '☑︎ 사진 선택'}
                    </button>
                  )}
                  {/* 사진 정렬: 날짜별 / 구역별 */}
                  <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
                    <button onClick={() => setPhotoGroup('date')}
                      className={`px-3 py-2 font-medium ${photoGroup === 'date' ? 'bg-green-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>📅 날짜순</button>
                    <button onClick={() => setPhotoGroup('zone')}
                      className={`px-3 py-2 font-medium border-l border-gray-200 ${photoGroup === 'zone' ? 'bg-green-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>📁 구역별</button>
                  </div>
                </div>
                {!readOnly && (
                  <button onClick={() => setShowFileForm(true)}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700">
                    + 자료 추가
                  </button>
                )}
              </div>
              {files.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-200 text-center py-16 text-gray-400">
                  <p className="text-3xl mb-2">📁</p><p>등록된 자료가 없어요</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {allCategories.map(cat => {
                    const catFiles = files.filter(f => f.category === cat)
                      .sort((a, b) => (a.file_name || '').localeCompare(b.file_name || '', undefined, { numeric: true }))
                    if (catFiles.length === 0) return null
                    const isPhoto = ['공사전사진','시공전사진','시공사진','마감사진'].includes(cat)
                    const isCollapsed = collapsedCats[cat] !== false
                    const allSelected = catFiles.every(f => selectedFileIds.has(f.id))
                    const anySelected = selectedFileIds.size > 0
                    return (
                      <div key={cat} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                        {/* 카테고리 헤더 토글 */}
                        <div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                          <button onClick={() => setCollapsedCats(prev => ({ ...prev, [cat]: !isCollapsed }))}
                            className="flex-1 flex items-center gap-2 text-left">
                            <span className="text-sm font-semibold text-gray-700">
                              {cat} <span className="text-gray-400 font-normal ml-1">({catFiles.length})</span>
                            </span>
                            <span className="text-gray-400 text-xs">{isCollapsed ? '▼ 펼치기' : '▲ 접기'}</span>
                          </button>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button onClick={() => saveAll(catFiles)}
                              className="text-xs px-3 py-1 rounded-lg border border-gray-300 text-gray-600 hover:border-green-400 hover:text-green-600 whitespace-nowrap">
                              ⤓ 전체 저장
                            </button>
                            {!readOnly && (
                            <button onClick={() => {
                              if (allSelected) {
                                setSelectedFileIds(prev => {
                                  const next = new Set(prev)
                                  catFiles.forEach(f => next.delete(f.id))
                                  return next
                                })
                              } else {
                                setSelectedFileIds(prev => {
                                  const next = new Set(prev)
                                  catFiles.forEach(f => next.add(f.id))
                                  return next
                                })
                              }
                            }} className={`text-xs px-3 py-1 rounded-lg border transition-colors whitespace-nowrap ${allSelected ? 'border-green-500 text-green-600 bg-green-50' : 'border-gray-300 text-gray-500 hover:border-green-400 hover:text-green-600'}`}>
                              {allSelected ? '전체해제' : '전체선택'}
                            </button>
                            )}
                          </div>
                        </div>
                        {!isCollapsed && (
                          <div className="border-t border-gray-100 p-3">
                            {isPhoto ? (
                              photoGroup === 'date' ? (
                                // 📅 날짜순 정렬 (묶지 않고 평평하게, 최신 날짜가 맨 위)
                                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
                                  {[...catFiles].sort((a, b) => {
                                    const d = fileDate(b).localeCompare(fileDate(a))
                                    if (d !== 0) return d
                                    const c = (b.created_at || '').localeCompare(a.created_at || '') // 같은 날짜면 나중에 올린 게 위
                                    return c !== 0 ? c : (a.file_name || '').localeCompare(b.file_name || '', undefined, { numeric: true })
                                  }).map(f => renderPhotoTile(f))}
                                </div>
                              ) : (() => {
                                const zones = groupByZone(catFiles)
                                if (zones.length === 1) {
                                  return (
                                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
                                      {catFiles.map(f => renderPhotoTile(f))}
                                    </div>
                                  )
                                }
                                return (
                                  <div className="flex flex-col gap-4">
                                    {zones.map(([zone, zFiles]) => {
                                      const zKey = `${cat}::${zone}`
                                      const zCollapsed = collapsedZones[zKey] !== false
                                      return (
                                        <div key={zKey}>
                                          <button onClick={() => setCollapsedZones(p => ({ ...p, [zKey]: !zCollapsed }))}
                                            className="flex items-center gap-2 w-full text-left px-3 py-2.5 rounded-lg bg-gray-50 hover:bg-gray-100 border border-gray-200">
                                            <span>📁</span>
                                            <span className="text-sm font-medium text-gray-700">{zone}</span>
                                            <span className="text-xs text-gray-400">{zFiles.length}장</span>
                                            <span className="text-gray-400 text-xs ml-auto">{zCollapsed ? '▼ 펼치기' : '▲ 접기'}</span>
                                          </button>
                                          {!zCollapsed && (
                                            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 mt-2">
                                              {zFiles.map(f => renderPhotoTile(f))}
                                            </div>
                                          )}
                                        </div>
                                      )
                                    })}
                                  </div>
                                )
                              })()
                            ) : (
                              <div>
                                {catFiles.map((f, i) => {
                                  const isSelected = selectedFileIds.has(f.id)
                                  return (
                                  <div key={f.id} className={`flex items-center gap-3 px-2 py-2.5 rounded-lg transition-colors ${i > 0 ? 'border-t border-gray-100' : ''} ${isSelected ? 'bg-green-50' : 'hover:bg-gray-50'}`}>
                                    {/* 체크박스 */}
                                    {!readOnly && (
                                    <button
                                      onClick={() => toggleSelectFile(f.id)}
                                      className={`w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                                        isSelected ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-green-400'
                                      }`}>
                                      {isSelected && <span className="text-xs font-bold">✓</span>}
                                    </button>
                                    )}
                                    <span className="text-lg flex-shrink-0">{f.file_type === 'text' ? '📝' : f.file_type === 'link' ? '🔗' : f.file_type?.includes('pdf') ? '📄' : f.file_type?.includes('image') ? '🖼️' : '📎'}</span>
                                    {/* 파일명 클릭 = 열기 (글 메모는 내용이 아래에 그대로 보임) */}
                                    <button onClick={() => {
                                      const type = f.file_type?.toLowerCase() || ''
                                      const name = f.file_name?.toLowerCase() || ''
                                      if (type === 'text' || !f.file_url) {
                                        // 글만 있는 항목 — 열 것 없음
                                      } else if (type === 'link') {
                                        window.open(f.file_url, '_blank')
                                      } else if (type.startsWith('video') || /\.(mp4|mov|webm|m4v|ogg)$/.test(name)) {
                                        setLightbox(f.file_url)
                                      } else if (type.includes('image') || /\.(jpg|jpeg|png|gif|webp|heic)$/.test(name)) {
                                        setLightbox(f.file_url)
                                      } else {
                                        openDocFile(f) // PDF=구글뷰어, 엑셀·워드=오피스뷰어 — 다운로드 없이 바로 보기
                                      }
                                    }} className="flex-1 min-w-0 text-left">
                                      <p className="text-sm font-medium text-gray-800 hover:text-green-600 truncate">{f.file_name}</p>
                                      {f.memo && <p className={`text-xs text-gray-400 ${f.file_type === 'text' ? 'whitespace-pre-wrap' : ''}`}>{f.memo}</p>}
                                    </button>
                                    <span className="text-xs text-gray-400 flex-shrink-0 hidden sm:block">{f.uploaded_by ? `${f.uploaded_by} · ` : ''}{new Date(f.created_at).toLocaleDateString('ko-KR')}</span>
                                    {f.file_type !== 'link' && f.file_type !== 'text' && f.file_url && (<>
                                      <button onClick={() => shareFile(f)}
                                        className="text-xs text-blue-400 hover:text-blue-600 flex-shrink-0">내보내기</button>
                                      {/* 저장: 직접 다운로드 */}
                                      <button onClick={() => downloadFile(f)}
                                        className="text-xs text-gray-400 hover:text-green-600 flex-shrink-0">저장</button>
                                    </>)}
                                    {!readOnly && f.file_type === 'link' && (
                                      <button onClick={() => {
                                        setEditingLink(f)
                                        setFileForm({ category: '구매링크', memo: f.memo || '', linkUrl: f.file_url, linkTitle: f.file_name || '' })
                                        setShowFileForm(true)
                                      }} className="text-xs text-green-500 hover:text-green-700 flex-shrink-0">수정</button>
                                    )}
                                    {!readOnly && (
                                      <button onClick={() => deleteFile(f)}
                                        className="text-xs text-red-400 hover:text-red-600 flex-shrink-0">삭제</button>
                                    )}
                                  </div>
                                )})}
                              </div>
                            )}
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
              {!readOnly && (
                <div className="flex justify-end mb-4">
                  <button onClick={() => setShowScheduleForm(true)}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700">
                    + 공정 추가
                  </button>
                </div>
              )}
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
                            {readOnly ? (
                              <span className={`text-xs px-2 py-1 rounded-full font-medium border ${
                                ps === '예정' ? 'bg-gray-200 text-gray-700 border-gray-300'
                                  : ps === '진행중' ? 'bg-blue-100 text-blue-700 border-blue-300'
                                  : 'bg-green-100 text-green-700 border-green-300'
                              }`}>{ps}</span>
                            ) : (
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
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {!readOnly && (
                              <div className="flex items-center gap-2">
                                <button onClick={() => openEditSchedule(s)}
                                  className="text-xs text-green-500 hover:text-green-700 hover:bg-green-50 px-2 py-1 rounded transition-colors">
                                  수정
                                </button>
                                <button onClick={() => deleteSchedule(s)}
                                  className="text-xs text-red-400 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded transition-colors">
                                  삭제
                                </button>
                              </div>
                            )}
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

          {/* 비용 탭 */}
          {tab === '비용' && (
            <div>
              <div className="flex justify-end mb-4" style={{ display: readOnly ? 'none' : undefined }}>
                <button onClick={() => setShowCostForm(true)}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700">
                  + 월별 자료 추가
                </button>
              </div>
              {costs.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-200 text-center py-16 text-gray-400">
                  <p className="text-3xl mb-2">💰</p><p>등록된 비용 자료가 없어요</p>
                  <p className="text-xs mt-1">경리나라에서 정리한 월별 자료를 올려보세요</p>
                </div>
              ) : (
                <>
                  {/* 월별 추이 그래프 */}
                  <div className="bg-white rounded-xl border border-gray-200 px-4 py-5 mb-4">
                    <p className="text-sm font-semibold text-gray-700 mb-4">월별 비용 추이</p>
                    {(() => {
                      const sorted = [...costs].sort((a, b) => (a.month || '').localeCompare(b.month || ''))
                      const max = Math.max(...sorted.map(c => c.amount), 1)
                      return (
                        <div className="flex items-end gap-2 h-40 overflow-x-auto pb-1">
                          {sorted.map(c => (
                            <div key={c.id} className="flex flex-col items-center gap-1 flex-shrink-0" style={{ minWidth: '52px' }}>
                              <span className="text-[10px] text-gray-500 whitespace-nowrap">{(c.amount/10000).toFixed(0)}만</span>
                              <div className="w-8 bg-green-500 rounded-t-md transition-all" style={{ height: `${Math.max((c.amount / max) * 110, 4)}px` }} />
                              <span className="text-[10px] text-gray-400 whitespace-nowrap">{c.month?.slice(2,7).replace('-','.')}</span>
                            </div>
                          ))}
                        </div>
                      )
                    })()}
                  </div>

                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50">
                          <th className="text-left text-xs font-semibold text-gray-400 px-6 py-3">월</th>
                          <th className="text-right text-xs font-semibold text-gray-400 px-4 py-3">금액</th>
                          <th className="text-left text-xs font-semibold text-gray-400 px-4 py-3">첨부 자료</th>
                          <th className="text-left text-xs font-semibold text-gray-400 px-4 py-3">메모</th>
                          <th className="px-4 py-3"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {costs.map(c => (
                          <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="px-6 py-3 text-sm font-medium text-gray-800">{c.month?.slice(0,7) || '-'}</td>
                            <td className="px-4 py-3 text-sm text-right font-semibold text-gray-800">{c.amount.toLocaleString()}원</td>
                            <td className="px-4 py-3">
                              {c.file_url ? (
                                <button onClick={() => {
                                  const name = c.file_name?.toLowerCase() || ''
                                  if (name.endsWith('.pdf')) window.open(`https://docs.google.com/viewer?url=${encodeURIComponent(c.file_url)}`, '_blank')
                                  else if (/\.(jpg|jpeg|png|gif|webp)$/.test(name)) setLightbox(c.file_url)
                                  else window.open(c.file_url, '_blank')
                                }} className="text-xs text-green-600 hover:underline truncate max-w-[160px] inline-block">📎 {c.file_name}</button>
                              ) : <span className="text-xs text-gray-300">-</span>}
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-400">{c.memo || '-'}</td>
                            <td className="px-4 py-3">
                              {!readOnly && (
                              <div className="flex items-center gap-2 justify-end">
                                <button onClick={() => openEditCost(c)}
                                  className="text-xs text-green-500 hover:text-green-700 hover:bg-green-50 px-2 py-1 rounded transition-colors">수정</button>
                                <button onClick={() => deleteCost(c)}
                                  className="text-xs text-red-400 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded transition-colors">삭제</button>
                              </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

        </div>
      </div>

      {/* 자료 추가 모달 */}
      {showFileForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 sticky top-0 bg-white">
              <h2 className="text-lg font-bold">{editingLink ? '구매링크 수정' : '자료 업로드'}</h2>
              <button onClick={() => { setShowFileForm(false); setSelectedFiles([]); setEditingLink(null) }} className="text-gray-400 text-2xl">&times;</button>
            </div>
            <form onSubmit={handleFileUpload} className="px-6 py-5 flex flex-col gap-4">
              {/* 자료 종류 선택 (수정 중엔 링크로 고정) */}
              <div className={`flex gap-2 ${editingLink ? 'hidden' : ''}`}>
                <button type="button"
                  onClick={() => { if (fileForm.category === '구매링크') setFileForm({ ...fileForm, category: '공사전사진' }) }}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium border ${fileForm.category !== '구매링크' ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-300'}`}>
                  📎 파일/사진
                </button>
                <button type="button"
                  onClick={() => setFileForm({ ...fileForm, category: '구매링크', linkUrl: '', linkTitle: '' })}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium border ${fileForm.category === '구매링크' ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-300'}`}>
                  🔗 구매링크
                </button>
              </div>

              {fileForm.category !== '구매링크' && (
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1.5">분류</label>
                  <select
                    value={allCategories.filter(c => c !== '구매링크').includes(fileForm.category) ? fileForm.category : '__custom__'}
                    onChange={e => setFileForm({ ...fileForm, category: e.target.value === '__custom__' ? '' : e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                    {allCategories.filter(c => c !== '구매링크').map(c => <option key={c} value={c}>{c}</option>)}
                    <option value="__custom__">➕ 직접 입력 (예: 제안서)</option>
                  </select>
                  {!allCategories.filter(c => c !== '구매링크').includes(fileForm.category) && (
                    <input value={fileForm.category} onChange={e => setFileForm({ ...fileForm, category: e.target.value })}
                      placeholder="새 분류 이름 (예: 제안서, 견적서)" autoFocus
                      className="w-full mt-2 border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                  )}
                </div>
              )}

              {fileForm.category === '구매링크' ? (
                <>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1.5">구매 링크 URL *</label>
                    <input value={fileForm.linkUrl} onChange={e => setFileForm({...fileForm, linkUrl: e.target.value})}
                      placeholder="https://smartstore.naver.com/..."
                      type="url"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1.5">제목 <span className="text-gray-400 font-normal">(선택)</span></label>
                    <input value={fileForm.linkTitle} onChange={e => setFileForm({...fileForm, linkTitle: e.target.value})}
                      placeholder="예) 거실 조명 - 쿠팡"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                  </div>
                </>
              ) : (
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1.5">
                    파일 선택 {fileForm.category === '미팅내용' ? <span className="text-gray-400 font-normal">(선택 — 글만 저장도 가능)</span> : <>* <span className="text-gray-400 font-normal">(여러 장 동시 선택 가능)</span></>}
                  </label>
                  <DropZone files={selectedFiles} onChange={setSelectedFiles} />
                  {/* 사진 업로드 속도/화질 선택 */}
                  <div className="mt-2">
                    <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
                      <button type="button" onClick={() => setPhotoQuality('fast')}
                        className={`flex-1 py-2 font-medium ${photoQuality === 'fast' ? 'bg-green-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                        🚀 빠른 업로드 (권장)
                      </button>
                      <button type="button" onClick={() => setPhotoQuality('original')}
                        className={`flex-1 py-2 font-medium border-l border-gray-200 ${photoQuality === 'original' ? 'bg-green-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                        원본 그대로 (느림)
                      </button>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1">
                      {photoQuality === 'fast'
                        ? '사진 크기를 줄여 5~10배 빨라요. 압축파일이 아니라 바로 보이고, 화면·인쇄에 충분한 화질이에요. (동영상·문서는 그대로)'
                        : '촬영 원본 그대로 올려요. 용량이 커서 장당 수십 초 걸릴 수 있어요.'}
                    </p>
                  </div>
                </div>
              )}

              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">
                  {PHOTO_CATS.includes(fileForm.category) ? '구역/공간' : fileForm.category === '미팅내용' ? '미팅 내용' : '메모'}
                  {PHOTO_CATS.includes(fileForm.category) && <span className="text-gray-400 font-normal ml-1">(같은 이름끼리 묶여요)</span>}
                </label>
                {fileForm.category === '미팅내용' ? (
                  <textarea value={fileForm.memo} onChange={e => setFileForm({...fileForm, memo: e.target.value})} rows={5}
                    placeholder="미팅에서 나온 내용을 입력하세요 (파일 없이 글만 저장해도 돼요)"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-y leading-relaxed" />
                ) : (
                  <input value={fileForm.memo} onChange={e => setFileForm({...fileForm, memo: e.target.value})}
                    placeholder={PHOTO_CATS.includes(fileForm.category) ? '예) 거실, 주방, 화장실, 1층' : fileForm.category === '구매링크' ? '예) 3개 주문 · 색상 화이트' : '예) 평면도 v2'}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                )}
              </div>

              {/* 업로드 진행바 */}
              {uploading && (
                <div>
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>{uploadCurrent}/{selectedFiles.length} 업로드 중...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div className="bg-green-500 h-2 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                  </div>
                </div>
              )}

              <div className="flex gap-3 mt-2">
                <button type="button" onClick={() => { setShowFileForm(false); setSelectedFiles([]); setEditingLink(null) }}
                  className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm font-medium">취소</button>
                <button type="submit"
                  disabled={uploading
                    || (fileForm.category === '구매링크' && !fileForm.linkUrl.trim())
                    || (fileForm.category === '미팅내용' && selectedFiles.length === 0 && !fileForm.memo.trim())
                    || (fileForm.category !== '구매링크' && fileForm.category !== '미팅내용' && selectedFiles.length === 0)}
                  className="flex-1 bg-green-600 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
                  {uploading ? `업로드 중...` : editingLink ? '수정 저장' : selectedFiles.length > 1 ? `${selectedFiles.length}개 업로드` : selectedFiles.length === 1 ? '업로드' : fileForm.category === '미팅내용' ? '글 저장' : '업로드'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 선택 플로팅 액션바 */}
      {selectedFileIds.size > 0 && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-40 bg-gray-900 text-white rounded-2xl shadow-2xl px-3 py-2.5 flex items-center gap-1.5 max-w-[95vw] flex-wrap justify-center">
          <span className="text-sm font-semibold text-green-300 whitespace-nowrap mr-1">{selectedFileIds.size}개</span>
          <button onClick={() => setShowMove(true)}
            className="bg-white/10 hover:bg-white/20 text-white text-sm px-2.5 py-1.5 rounded-lg transition-colors">📁 이동</button>
          <button onClick={() => setShowChatShare(true)}
            className="bg-white/10 hover:bg-white/20 text-white text-sm px-2.5 py-1.5 rounded-lg transition-colors">💬 채팅</button>
          <button onClick={() => shareFiles(files.filter(f => selectedFileIds.has(f.id)))}
            className="bg-white/10 hover:bg-white/20 text-white text-sm px-2.5 py-1.5 rounded-lg transition-colors">내보내기</button>
          <button onClick={() => saveAll(files.filter(f => selectedFileIds.has(f.id)))}
            className="bg-white/10 hover:bg-white/20 text-white text-sm px-2.5 py-1.5 rounded-lg transition-colors">저장</button>
          <button onClick={deleteSelectedFiles}
            className="bg-red-500 hover:bg-red-600 text-white text-sm px-2.5 py-1.5 rounded-lg transition-colors">삭제</button>
          <button onClick={clearSelection}
            className="text-gray-400 hover:text-white text-lg leading-none px-1 transition-colors">&times;</button>
        </div>
      )}

      {/* 외부협력업체 공개 설정 모달 (관리자) */}
      {showAccess && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowAccess(false)}>
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 sticky top-0 bg-white">
              <h2 className="text-lg font-bold">🔒 외부공개 설정</h2>
              <button onClick={() => setShowAccess(false)} className="text-gray-400 text-2xl">&times;</button>
            </div>
            <div className="px-6 py-5">
              <p className="text-xs text-gray-500 mb-3 leading-relaxed">
                체크한 <b>외부협력업체</b>만 이 현장(현황·자료·공정)을 볼 수 있어요.
                체크 안 된 업체는 목록에서도 안 보이고 주소로 들어와도 차단됩니다.
              </p>
              {partners.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-6">외부협력업체 계정이 없어요<br /><span className="text-xs">(회원 관리에서 역할을 &apos;외부협력업체&apos;로 지정)</span></p>
              ) : (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  {partners.map(p => {
                    const on = accessIds.has(p.id)
                    return (
                      <button key={p.id} onClick={() => toggleAccess(p.id)} disabled={accessBusy}
                        className={`w-full flex items-center gap-2.5 px-3 py-3 text-left border-b border-gray-100 last:border-0 disabled:opacity-60 ${on ? 'bg-green-50' : 'hover:bg-gray-50'}`}>
                        <span className={`w-5 h-5 rounded border-2 flex items-center justify-center text-xs flex-shrink-0 ${on ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300'}`}>{on ? '✓' : ''}</span>
                        <span className="text-sm text-gray-800 flex-1 truncate">{p.name}</span>
                        <span className={`text-xs flex-shrink-0 ${on ? 'text-green-600 font-medium' : 'text-gray-300'}`}>{on ? '공개 중' : '비공개'}</span>
                      </button>
                    )
                  })}
                </div>
              )}
              <p className="text-[11px] text-gray-400 mt-3">이 현장에 공개 중: {accessIds.size}곳</p>
            </div>
          </div>
        </div>
      )}

      {/* 분류/현장 이동 모달 */}
      {showMove && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowMove(false)}>
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 sticky top-0 bg-white">
              <h2 className="text-lg font-bold">{selectedFileIds.size}개 이동</h2>
              <button onClick={() => setShowMove(false)} className="text-gray-400 text-2xl">&times;</button>
            </div>
            <div className="px-6 py-5 flex flex-col gap-5">
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2">① 현장 선택</p>
                <div className="border border-gray-200 rounded-lg max-h-44 overflow-auto">
                  <button onClick={() => setMoveProj(id)}
                    className={`w-full text-left px-3 py-2.5 text-sm border-b border-gray-100 flex items-center gap-2 ${moveProj === id ? 'bg-green-50 text-green-700 font-medium' : 'text-gray-700 hover:bg-gray-50'}`}>
                    <span>{moveProj === id ? '✅' : '📍'}</span> 이 현장 (현재)
                  </button>
                  {moveProjects.map(p => (
                    <button key={p.id} onClick={() => setMoveProj(p.id)}
                      className={`w-full text-left px-3 py-2.5 text-sm border-b border-gray-100 last:border-0 flex items-center gap-2 ${moveProj === p.id ? 'bg-green-50 text-green-700 font-medium' : 'text-gray-700 hover:bg-gray-50'}`}>
                      <span>{moveProj === p.id ? '✅' : '🏗️'}</span> {p.name}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2">② 분류 선택 *</p>
                <div className="flex gap-1.5 flex-wrap">
                  {allCategories.filter(c => c !== '구매링크').map(c => (
                    <button key={c} onClick={() => setMoveCat(c)}
                      className={`text-sm px-3 py-1.5 rounded-full border ${moveCat === c ? 'bg-green-600 text-white border-green-600' : 'border-gray-300 text-gray-600 hover:border-green-400'}`}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={doMove} disabled={moving || !moveCat}
                className="w-full bg-green-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                {moving ? '이동 중...' : moveCat
                  ? `${moveProj === id ? '이 현장' : moveProjects.find(p => p.id === moveProj)?.name || ''} · ${moveCat}(으)로 이동`
                  : '분류를 선택하세요'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 채팅으로 공유 모달 */}
      {showChatShare && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowChatShare(false)}>
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 sticky top-0 bg-white">
              <h2 className="text-lg font-bold">{selectedFileIds.size}개 채팅으로 보내기</h2>
              <button onClick={() => setShowChatShare(false)} className="text-gray-400 text-2xl">&times;</button>
            </div>
            <div className="px-4 py-3">
              <p className="text-xs text-gray-400 px-2 pb-2">다시 업로드하지 않고 바로 전송돼요 (링크 항목 제외)</p>
              <button onClick={() => sendToChat({ kind: 'dm', id: profile?.id, name: '나와의 채팅' })} disabled={moving}
                className="w-full flex items-center gap-2.5 px-3 py-3 text-left rounded-lg hover:bg-gray-50 disabled:opacity-50">
                <span className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-sm flex-shrink-0">📝</span>
                <span className="text-sm font-medium text-gray-800">나와의 채팅</span>
              </button>
              <button onClick={() => sendToChat({ kind: 'all', name: '전체 채팅방' })} disabled={moving}
                className="w-full flex items-center gap-2.5 px-3 py-3 text-left rounded-lg hover:bg-gray-50 disabled:opacity-50">
                <span className="w-8 h-8 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-sm flex-shrink-0">📢</span>
                <span className="text-sm font-medium text-gray-800">전체 채팅방</span>
              </button>
              {chatRooms.length > 0 && <p className="text-xs text-gray-400 font-semibold px-2 pt-2 pb-1">채팅방</p>}
              {chatRooms.map(r => (
                <button key={r.id} onClick={() => sendToChat({ kind: 'room', id: r.id, name: r.name })} disabled={moving}
                  className="w-full flex items-center gap-2.5 px-3 py-3 text-left rounded-lg hover:bg-gray-50 disabled:opacity-50">
                  <span className="w-8 h-8 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-sm flex-shrink-0">#</span>
                  <span className="text-sm font-medium text-gray-800 truncate">{r.name}</span>
                </button>
              ))}
              <p className="text-xs text-gray-400 font-semibold px-2 pt-2 pb-1">직원 (1:1)</p>
              {chatPeople.map(p => (
                <button key={p.id} onClick={() => sendToChat({ kind: 'dm', id: p.id, name: p.name })} disabled={moving}
                  className="w-full flex items-center gap-2.5 px-3 py-3 text-left rounded-lg hover:bg-gray-50 disabled:opacity-50">
                  <span className="w-8 h-8 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-sm flex-shrink-0">{p.name?.slice(0, 1) || '?'}</span>
                  <span className="text-sm font-medium text-gray-800 truncate">{p.name}</span>
                </button>
              ))}
              {moving && <p className="text-xs text-green-600 text-center py-2">보내는 중...</p>}
            </div>
          </div>
        </div>
      )}

      {/* 사진 크게 보기 (좌우 넘기기) */}
      {lightbox && (() => {
        const cur = files.find(f => f.file_url === lightbox)
        const gallery = (cur ? files.filter(f => f.category === cur.category) : [])
          .filter(f => (f.file_type || '') !== 'link' && (isVideoFile(f) || isImageFile(f)))
          .sort((a, b) => {
            if (photoGroup === 'date') {
              const d = fileDate(b).localeCompare(fileDate(a)); if (d !== 0) return d
              const c = (b.created_at || '').localeCompare(a.created_at || ''); if (c !== 0) return c
            }
            return (a.file_name || '').localeCompare(b.file_name || '', undefined, { numeric: true })
          })
          .map(f => f.file_url)
        const idx = gallery.indexOf(lightbox)
        const go = (d: number) => { const n = idx + d; if (n >= 0 && n < gallery.length) setLightbox(gallery[n]) }
        return (
          <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
            onClick={() => setLightbox(null)}
            onTouchStart={e => { touchStartX.current = e.touches[0].clientX }}
            onTouchEnd={e => { const dx = e.changedTouches[0].clientX - touchStartX.current; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1) }}>
            {isVideoUrl(lightbox) ? (
              <video src={lightbox} controls autoPlay playsInline
                onClick={e => e.stopPropagation()}
                className="max-w-full max-h-full rounded-lg" />
            ) : (
              <HeicImg src={lightbox} alt="" onClick={e => e.stopPropagation()} className="max-w-full max-h-full object-contain rounded-lg" />
            )}
            {idx > 0 && (
              <button onClick={e => { e.stopPropagation(); go(-1) }}
                className="absolute left-2 md:left-6 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/20 hover:bg-white/30 text-white text-2xl flex items-center justify-center">‹</button>
            )}
            {idx < gallery.length - 1 && (
              <button onClick={e => { e.stopPropagation(); go(1) }}
                className="absolute right-2 md:right-6 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/20 hover:bg-white/30 text-white text-2xl flex items-center justify-center">›</button>
            )}
            {gallery.length > 1 && (
              <div className="absolute bottom-5 left-1/2 -translate-x-1/2 bg-black/50 text-white text-xs px-3 py-1 rounded-full">{idx + 1} / {gallery.length}</div>
            )}
            <button onClick={e => { e.stopPropagation(); setLightbox(null) }} className="absolute top-4 right-4 text-white text-3xl leading-none">&times;</button>
          </div>
        )
      })()}

      {/* 현장 수정 모달 */}
      {showEditForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 sticky top-0 bg-white">
              <h2 className="text-lg font-bold text-gray-900">현장 수정</h2>
              <button onClick={() => setShowEditForm(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleUpdateProject} className="px-6 py-5 flex flex-col gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">현장명 <span className="text-red-500">*</span></label>
                <input required value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1.5">고객명</label>
                  <input value={editForm.client_name} onChange={e => setEditForm({...editForm, client_name: e.target.value})}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1.5">담당자</label>
                  <input value={editForm.manager} onChange={e => setEditForm({...editForm, manager: e.target.value})}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">주소</label>
                <input value={editForm.address} onChange={e => setEditForm({...editForm, address: e.target.value})}
                  placeholder="서울시 강남구 ..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">현재 단계</label>
                <select value={editForm.status} onChange={e => setEditForm({...editForm, status: e.target.value})}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                  {STATUS_LIST.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1.5">시작일</label>
                  <input type="date" value={editForm.start_date} onChange={e => setEditForm({...editForm, start_date: e.target.value})}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1.5">완료 예정일</label>
                  <input type="date" value={editForm.end_date} onChange={e => setEditForm({...editForm, end_date: e.target.value})}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">메모</label>
                <textarea value={editForm.memo} onChange={e => setEditForm({...editForm, memo: e.target.value})}
                  rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none" />
              </div>
              <div className="flex gap-3 mt-2">
                <button type="button" onClick={() => setShowEditForm(false)}
                  className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50">취소</button>
                <button type="submit" disabled={savingEdit}
                  className="flex-1 bg-green-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                  {savingEdit ? '저장 중...' : '저장'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 공정 추가 모달 */}
      {showScheduleForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 sticky top-0 bg-white">
              <h2 className="text-lg font-bold">{editingSchedule ? '공정 수정' : '공정 추가'}</h2>
              <button onClick={() => { setShowScheduleForm(false); setEditingSchedule(null); setSForm({ task_name: '', scheduled_date: '', end_date: '', manager: '' }) }} className="text-gray-400 text-2xl">&times;</button>
            </div>
            <form onSubmit={handleSchedule} className="px-6 py-5 flex flex-col gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">공정명 *</label>
                <input required value={sForm.task_name} onChange={e => setSForm({...sForm, task_name: e.target.value})}
                  placeholder="목공, 타일, 입주청소"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1.5">시작일</label>
                  <input type="date" value={sForm.scheduled_date} onChange={e => setSForm({...sForm, scheduled_date: e.target.value})}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1.5">종료일</label>
                  <input type="date" value={sForm.end_date} onChange={e => setSForm({...sForm, end_date: e.target.value})}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">담당자</label>
                <input value={sForm.manager} onChange={e => setSForm({...sForm, manager: e.target.value})}
                  placeholder="김팀장"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
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

      {/* 비용 추가 모달 */}
      {showCostForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 sticky top-0 bg-white">
              <h2 className="text-lg font-bold">{editingCost ? '비용 자료 수정' : '월별 비용 자료 추가'}</h2>
              <button onClick={() => { setShowCostForm(false); setEditingCost(null); setCForm({ month: '', amount: '', memo: '' }); setCostFile(null) }} className="text-gray-400 text-2xl">&times;</button>
            </div>
            <form onSubmit={handleCost} className="px-6 py-5 flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1.5">월 *</label>
                  <input required type="month" value={cForm.month} onChange={e => setCForm({...cForm, month: e.target.value})}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1.5">총 금액 *</label>
                  <input required type="number" value={cForm.amount} onChange={e => setCForm({...cForm, amount: e.target.value})}
                    placeholder="5000000"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">
                  경리나라 자료 첨부 {editingCost?.file_name && <span className="text-gray-400 font-normal">(현재: {editingCost.file_name})</span>}
                </label>
                <input type="file" onChange={e => setCostFile(e.target.files?.[0] || null)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-green-50 file:text-green-700 file:text-xs" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">메모</label>
                <input value={cForm.memo} onChange={e => setCForm({...cForm, memo: e.target.value})}
                  placeholder="예) 자재비+인건비 합산"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div className="flex gap-3 mt-2">
                <button type="button" onClick={() => { setShowCostForm(false); setEditingCost(null); setCForm({ month: '', amount: '', memo: '' }); setCostFile(null) }}
                  className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm font-medium">취소</button>
                <button type="submit" disabled={savingC}
                  className="flex-1 bg-green-600 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
                  {savingC ? '저장 중...' : editingCost ? '수정' : '추가'}
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

  const totalMB = files.reduce((sum, f) => sum + f.size, 0) / 1024 / 1024

  return (
    <div>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`flex flex-col items-center justify-center w-full h-28 border-2 border-dashed rounded-xl cursor-pointer transition-all ${
          dragging ? 'border-green-500 bg-green-100 scale-[1.01]' :
          files.length > 0 ? 'border-green-400 bg-green-50' :
          'border-gray-300 hover:border-green-400 hover:bg-green-50'
        }`}
      >
        <input ref={inputRef} type="file" multiple className="hidden"
          onChange={e => addFiles(e.target.files)} />
        {files.length > 0 ? (
          <div className="text-center pointer-events-none">
            <p className="text-2xl mb-1">📁</p>
            <p className="text-sm font-semibold text-green-600">{files.length}개 선택됨</p>
            <p className="text-xs text-gray-400 mt-0.5">총 {totalMB.toFixed(1)}MB · 클릭해서 추가</p>
          </div>
        ) : (
          <div className="text-center pointer-events-none">
            <p className="text-2xl mb-1">{dragging ? '📂' : '📁'}</p>
            <p className="text-sm font-medium text-gray-600">{dragging ? '여기에 놓으세요!' : '드래그·클릭 또는 Ctrl+V 붙여넣기'}</p>
            <p className="text-xs text-gray-400 mt-0.5">캡처 화면도 붙여넣기 가능</p>
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
