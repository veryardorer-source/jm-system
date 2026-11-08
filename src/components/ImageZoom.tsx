'use client'

// 사진 크게 보기 — 확대/축소·끌어서 이동·여러 장 넘기기
// PC: 마우스 휠 확대, 끌어서 이동, 더블클릭 2.5배/원래대로, ←/→ 넘기기, Esc 닫기
// 폰: 두 손가락 벌려 확대, 한 손가락 이동, 두 번 톡 확대/원래대로, 원래 크기에서 좌우로 밀어 넘기기
import { useCallback, useEffect, useRef, useState } from 'react'

type Props = {
  images: string[]          // 볼 수 있는 주소(이미 서명된 주소)
  index: number
  onIndexChange: (i: number) => void
  onClose: () => void
}

const MIN = 1
const MAX = 8
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

export default function ImageZoom({ images, index, onIndexChange, onClose }: Props) {
  const [scale, setScale] = useState(1)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [rotate, setRotate] = useState(0)
  const [dragging, setDragging] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  // 제스처 상태 (렌더와 무관하므로 ref)
  const g = useRef({
    pointers: new Map<number, { x: number; y: number }>(),
    startDist: 0, startScale: 1, startPos: { x: 0, y: 0 }, startMid: { x: 0, y: 0 },
    lastTap: 0, moved: false, downAt: { x: 0, y: 0 },
  })
  const cur = useRef({ scale: 1, pos: { x: 0, y: 0 } })
  useEffect(() => { cur.current = { scale, pos } }, [scale, pos])

  const count = images.length
  const reset = useCallback(() => { setScale(1); setPos({ x: 0, y: 0 }) }, [])
  const go = useCallback((d: number) => {
    if (count < 2) return
    onIndexChange((index + d + count) % count)
    setScale(1); setPos({ x: 0, y: 0 }); setRotate(0)
  }, [count, index, onIndexChange])

  // 화면 중심 기준 좌표(px)로 특정 점을 고정한 채 배율 변경
  const zoomAt = useCallback((next: number, cx: number, cy: number) => {
    const { scale: s, pos: p } = cur.current
    const ns = clamp(next, MIN, MAX)
    if (ns === MIN) { setScale(1); setPos({ x: 0, y: 0 }); return }
    const k = ns / s
    setScale(ns)
    setPos({ x: cx - (cx - p.x) * k, y: cy - (cy - p.y) * k })
  }, [])

  const center = (clientX: number, clientY: number) => {
    const r = boxRef.current?.getBoundingClientRect()
    if (!r) return { x: 0, y: 0 }
    return { x: clientX - (r.left + r.width / 2), y: clientY - (r.top + r.height / 2) }
  }

  // 키보드
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose() }
      else if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
      else if (e.key === '+' || e.key === '=') zoomAt(cur.current.scale * 1.4, 0, 0)
      else if (e.key === '-') zoomAt(cur.current.scale / 1.4, 0, 0)
      else if (e.key === '0') reset()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [go, onClose, reset, zoomAt])

  // 휠 확대 (passive 해제가 필요해 직접 등록)
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const c = center(e.clientX, e.clientY)
      zoomAt(cur.current.scale * Math.exp(-e.deltaY * 0.0015), c.x, c.y)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAt])

  // 뒤 화면 스크롤 막기
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    const s = g.current
    s.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    s.moved = false
    s.downAt = { x: e.clientX, y: e.clientY }
    s.startScale = cur.current.scale
    s.startPos = { ...cur.current.pos }
    if (s.pointers.size === 2) {
      const [a, b] = [...s.pointers.values()]
      s.startDist = Math.hypot(a.x - b.x, a.y - b.y)
      s.startMid = center((a.x + b.x) / 2, (a.y + b.y) / 2)
    }
    setDragging(true)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const s = g.current
    if (!s.pointers.has(e.pointerId)) return
    s.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (Math.hypot(e.clientX - s.downAt.x, e.clientY - s.downAt.y) > 6) s.moved = true
    if (s.pointers.size >= 2) {
      const [a, b] = [...s.pointers.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      if (!s.startDist) return
      const ns = clamp(s.startScale * (dist / s.startDist), MIN, MAX)
      const mid = center((a.x + b.x) / 2, (a.y + b.y) / 2)
      const k = ns / s.startScale
      setScale(ns)
      setPos({
        x: mid.x - (s.startMid.x - s.startPos.x) * k,
        y: mid.y - (s.startMid.y - s.startPos.y) * k,
      })
    } else if (cur.current.scale > 1) {
      setPos({ x: s.startPos.x + (e.clientX - s.downAt.x), y: s.startPos.y + (e.clientY - s.downAt.y) })
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    const s = g.current
    const wasPinch = s.pointers.size >= 2
    s.pointers.delete(e.pointerId)
    if (s.pointers.size === 1) {
      // 두 손가락 중 하나만 뗐을 때 남은 손가락 기준으로 이어서 이동
      const [p] = [...s.pointers.values()]
      s.downAt = { ...p }
      s.startPos = { ...cur.current.pos }
      s.startScale = cur.current.scale
      s.moved = true
      return
    }
    if (s.pointers.size > 0) return
    setDragging(false)
    if (cur.current.scale <= 1.01) { setScale(1); setPos({ x: 0, y: 0 }) }
    if (wasPinch) return
    const dx = e.clientX - s.downAt.x
    // 원래 크기에서 좌우로 밀면 다음/이전 사진
    if (cur.current.scale === 1 && s.moved && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(e.clientY - s.downAt.y)) {
      go(dx < 0 ? 1 : -1)
      return
    }
    if (s.moved) return
    // 두 번 톡/더블클릭 → 2.5배 / 원래대로
    const now = Date.now()
    if (now - s.lastTap < 300) {
      s.lastTap = 0
      if (cur.current.scale > 1) reset()
      else { const c = center(e.clientX, e.clientY); zoomAt(2.5, c.x, c.y) }
    } else {
      s.lastTap = now
    }
  }

  const src = images[index]
  const btn = 'bg-white/15 hover:bg-white/25 text-white rounded-full h-10 min-w-10 px-3 flex items-center justify-center text-sm select-none'

  return (
    <div className="fixed inset-0 z-[60] bg-black/95 flex flex-col" role="dialog" aria-label="사진 크게 보기"
      onClick={e => e.stopPropagation()}>
      {/* 상단 막대 */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 text-white shrink-0">
        <span className="text-sm tabular-nums">{count > 1 ? `${index + 1} / ${count}` : ''}</span>
        <div className="flex items-center gap-1.5">
          <button className={btn} onClick={() => zoomAt(cur.current.scale / 1.5, 0, 0)} aria-label="축소">－</button>
          <button className={btn} onClick={reset} aria-label="원래 크기">{Math.round(scale * 100)}%</button>
          <button className={btn} onClick={() => zoomAt(cur.current.scale * 1.5, 0, 0)} aria-label="확대">＋</button>
          <button className={btn} onClick={() => setRotate(r => (r + 90) % 360)} aria-label="회전">⟳</button>
          <button className={`${btn} text-2xl`} onClick={onClose} aria-label="닫기">&times;</button>
        </div>
      </div>

      {/* 사진 영역 */}
      <div ref={boxRef}
        className={`relative flex-1 overflow-hidden touch-none select-none ${scale > 1 ? (dragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-zoom-in'}`}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={`사진 ${index + 1}`} draggable={false}
            className="absolute inset-0 m-auto max-w-full max-h-full object-contain pointer-events-none"
            style={{
              transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale}) rotate(${rotate}deg)`,
              transition: dragging ? 'none' : 'transform 0.15s ease-out',
            }} />
        ) : (
          <p className="absolute inset-0 flex items-center justify-center text-white/70 text-sm">불러오는 중...</p>
        )}
        {count > 1 && (
          <>
            <button onPointerDown={e => e.stopPropagation()} onClick={() => go(-1)} aria-label="이전 사진"
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white w-11 h-11 rounded-full text-2xl">‹</button>
            <button onPointerDown={e => e.stopPropagation()} onClick={() => go(1)} aria-label="다음 사진"
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white w-11 h-11 rounded-full text-2xl">›</button>
          </>
        )}
      </div>
      <p className="text-center text-[11px] text-white/50 py-1.5 shrink-0 hidden [@media(hover:hover)]:block">휠: 확대/축소 · 끌기: 이동 · 더블클릭: 2.5배/원래대로 · ←/→: 넘기기 · Esc: 닫기</p>
      <p className="text-center text-[11px] text-white/50 py-1.5 shrink-0 [@media(hover:hover)]:hidden">두 손가락으로 확대 · 두 번 톡: 확대/원래대로 · 좌우로 밀어 넘기기</p>
    </div>
  )
}
