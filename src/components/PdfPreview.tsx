'use client'
// PDF 미리보기 — 내려받지 않고 페이지를 그림처럼 바로 보여 준다 (pdf.js로 캔버스에 그림)
// 폰 브라우저는 PDF를 화면 안에 못 띄우는 경우가 많아서, 직접 그려서 어느 기기에서든 똑같이 보이게.
import { useEffect, useRef, useState } from 'react'
import { resolveFileUrl } from '@/lib/media'

type PdfLib = typeof import('pdfjs-dist')
let libPromise: Promise<PdfLib> | null = null
function loadPdfLib() {
  if (!libPromise) {
    // 구형 아이폰(iOS 17.4 미만)엔 pdf.js가 쓰는 Promise.withResolvers가 없어 보충
    const P = Promise as unknown as { withResolvers?: () => unknown }
    if (!P.withResolvers) {
      P.withResolvers = function () {
        let resolve: unknown, reject: unknown
        const promise = new Promise((res, rej) => { resolve = res; reject = rej })
        return { promise, resolve, reject }
      }
    }
    libPromise = import('pdfjs-dist').then(lib => {
      lib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
      return lib
    })
  }
  return libPromise
}

export default function PdfPreview({ url, file, maxPages = 1, width = 800, className = '', onPages, lazy = true, compact = false }: {
  url?: string
  file?: Blob      // 올리기 전 로컬 파일 (주소 대신)
  maxPages?: number // 몇 쪽까지 그릴지 (썸네일은 1쪽)
  width?: number    // 그릴 해상도(px) — 화면 표시 크기는 className으로
  className?: string
  onPages?: (n: number) => void
  lazy?: boolean   // false면 화면에 안 보여도 바로 그림
  compact?: boolean // 작은 칸용 — 그리기 전엔 아이콘만
}) {
  const outerRef = useRef<HTMLDivElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<'wait' | 'ok' | 'fail'>('wait')
  const [visible, setVisible] = useState(!lazy)

  // 화면에 보일 때만 그림 — 목록에 PDF가 많아도 느려지지 않게
  useEffect(() => {
    const el = outerRef.current
    if (!el || !lazy) return
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { setVisible(true); io.disconnect() } }, { rootMargin: '200px' })
    io.observe(el)
    return () => io.disconnect()
  }, [lazy])

  useEffect(() => {
    if (!visible) return
    let cancelled = false
    let doc: { destroy: () => Promise<void> } | null = null
    ;(async () => {
      try {
        const lib = await loadPdfLib()
        const pdf = await lib.getDocument(file
          ? { data: new Uint8Array(await file.arrayBuffer()) }
          : { url: await resolveFileUrl(url || ''), withCredentials: false }).promise
        doc = pdf
        if (cancelled) return
        onPages?.(pdf.numPages)
        const box = boxRef.current
        if (!box) return
        box.innerHTML = ''
        const n = Math.min(pdf.numPages, maxPages)
        for (let i = 1; i <= n; i++) {
          const page = await pdf.getPage(i)
          if (cancelled) return
          const base = page.getViewport({ scale: 1 })
          const vp = page.getViewport({ scale: width / base.width })
          const canvas = document.createElement('canvas')
          canvas.width = Math.floor(vp.width)
          canvas.height = Math.floor(vp.height)
          canvas.style.width = '100%'
          canvas.style.height = 'auto'
          canvas.style.display = 'block'
          canvas.style.background = '#fff'
          if (i > 1) canvas.style.marginTop = '8px'
          box.appendChild(canvas)
          await page.render({ canvasContext: canvas.getContext('2d')!, viewport: vp }).promise
          if (i === 1 && !cancelled) setState('ok')
        }
      } catch (e) {
        console.warn('PDF 미리보기 실패', e)
        if (!cancelled) setState('fail')
      }
    })()
    return () => { cancelled = true; doc?.destroy().catch(() => {}) }
  }, [visible, url, file, maxPages, width, onPages])

  return (
    <div ref={outerRef} className={`relative ${className}`}>
      <div ref={boxRef} className={state === 'ok' ? '' : 'hidden'} />
      {state !== 'ok' && (
        <div className={`w-full h-full min-h-[inherit] flex flex-col items-center justify-center gap-1.5 ${compact ? '' : 'py-6'}`}>
          <span className={compact ? 'text-lg' : 'text-3xl'}>📄</span>
          {!compact && <span className="text-[11px] text-gray-500">{state === 'wait' ? '미리보기 불러오는 중…' : '미리보기를 못 그렸어요'}</span>}
        </div>
      )}
    </div>
  )
}

export const isPdfUrl = (u: string) => /\.pdf$/i.test((u || '').split('?')[0])
