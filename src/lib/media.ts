// 파일/사진 공통 유틸 — 다운로드 없이 보기 + 쉬운 공유(내보내기)

export function isImageUrl(u: string) {
  return /\.(jpg|jpeg|png|gif|webp|heic|heif|bmp)$/i.test((u || '').split('?')[0])
}
export function isVideoUrl(u: string) {
  return /\.(mp4|mov|webm|m4v|ogg|avi|mkv)$/i.test((u || '').split('?')[0])
}

// PDF를 새 탭에서 열되, 탭 제목이 앱에 보이는 파일명으로 나오게.
// 저장 주소가 숫자 이름(1785…pdf)이라 그냥 열면 탭 제목이 숫자로 나와서, 제목을 붙인 래퍼 페이지로 연다.
// 모바일은 내장 PDF 표시가 기기마다 달라 기존처럼 바로 연다.
export function openPdfTitled(url: string, title?: string) {
  const name = (title || '').trim()
  const isMobile = typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches
  if (isMobile || !name) { window.open(url, '_blank'); return }
  const w = window.open('', '_blank')
  if (!w) { window.open(url, '_blank'); return }
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(name)}</title><style>html,body{margin:0;height:100%;overflow:hidden}</style></head><body><embed src="${esc(url)}" type="application/pdf" style="width:100%;height:100%"></body></html>`)
  w.document.close()
}

// 다운로드 없이 브라우저에서 열어 보기 — PDF는 브라우저 내장 뷰어(탭 제목=파일명), 오피스는 MS 온라인 뷰어
export function viewInBrowser(url: string, name?: string) {
  const n = (name || url || '').toLowerCase().split('?')[0]
  if (/\.(xlsx|xls|doc|docx|ppt|pptx)$/.test(n)) {
    window.open(`https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(url)}`, '_blank')
  } else if (n.endsWith('.pdf')) {
    openPdfTitled(url, name)
  } else {
    window.open(url, '_blank')
  }
}

// 바로 인쇄 — 이미지는 인쇄용 창을 열어 즉시 인쇄 대화상자, PDF는 브라우저 뷰어(인쇄 버튼)로
export function printUrl(url: string) {
  const n = (url || '').toLowerCase().split('?')[0]
  if (n.endsWith('.pdf')) { window.open(url, '_blank'); return }
  const w = window.open('', '_blank')
  if (!w) { window.open(url, '_blank'); return }
  w.document.write(
    `<html><head><title>인쇄</title><style>@page{margin:10mm}body{margin:0;display:flex;justify-content:center;align-items:flex-start}img{max-width:100%;max-height:100vh}</style></head>` +
    `<body><img src="${url}" onload="setTimeout(function(){window.print()},300)" /></body></html>`
  )
  w.document.close()
}

// 내보내기(공유) — 모바일은 공유 시트, 안 되면 다운로드로 폴백
export async function shareUrl(url: string, name?: string) {
  const filename = name || url.split('/').pop()?.split('?')[0] || 'file'
  try {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        const res = await fetch(url, { mode: 'cors', credentials: 'omit' })
        const blob = await res.blob()
        const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' })
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: filename })
          return
        }
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return
      }
      try { await navigator.share({ url, title: filename }); return } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return
      }
    }
  } catch { /* 무시 */ }
  await downloadUrl(url, filename)
}

// 저장(다운로드)
export async function downloadUrl(url: string, name?: string) {
  const filename = name || url.split('/').pop()?.split('?')[0] || 'file'
  try {
    const res = await fetch(url, { mode: 'cors', credentials: 'omit' })
    if (!res.ok) throw new Error('fetch failed')
    const blob = await res.blob()
    const u = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = u; a.download = filename
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(u)
  } catch {
    window.open(url, '_blank')
  }
}
