'use client'
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, TouchEvent } from 'react'

// 사진 크게 보기 공통 넘김 — 폰: 손가락을 따라 움직이는 스와이프 / PC: ← → 키, Esc 닫기
// go(1)=다음, go(-1)=이전 (처음·끝에서 이어지는 건 호출하는 쪽 go가 결정)
export function useGalleryNav(open: boolean, go: (d: number) => void, close: () => void) {
  const goRef = useRef(go)
  const closeRef = useRef(close)
  useEffect(() => { goRef.current = go; closeRef.current = close })

  const [dx, setDx] = useState(0)
  const [animating, setAnimating] = useState(false)
  const start = useRef<{ x: number; y: number; t: number } | null>(null)
  const axis = useRef<'x' | 'y' | null>(null)
  const pinching = useRef(false) // 두 손가락 확대 중에는 넘기지 않음

  // 넘긴 뒤 새 사진이 넘긴 방향 쪽에서 살짝 밀려 들어오게
  const slideIn = (d: number) => {
    setAnimating(false)
    setDx(d > 0 ? 80 : -80)
    requestAnimationFrame(() => requestAnimationFrame(() => { setAnimating(true); setDx(0) }))
  }
  const slideRef = useRef(slideIn)

  // PC 키보드 — 수정창 등 입력칸에 글 쓰는 중이면 무시
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return
      if (e.key === 'ArrowRight') { e.preventDefault(); goRef.current(1); slideRef.current(1) }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); goRef.current(-1); slideRef.current(-1) }
      else if (e.key === 'Escape') closeRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const zoomed = () => typeof window !== 'undefined' && !!window.visualViewport && window.visualViewport.scale > 1.05

  const handlers = {
    onTouchStart: (e: TouchEvent) => {
      if (e.touches.length > 1) { pinching.current = true; start.current = null; setDx(0); return }
      pinching.current = false
      axis.current = null
      start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() }
      setAnimating(false)
    },
    onTouchMove: (e: TouchEvent) => {
      if (e.touches.length > 1) { pinching.current = true; start.current = null; setDx(0); return }
      if (!start.current || pinching.current || zoomed()) return
      const mx = e.touches[0].clientX - start.current.x
      const my = e.touches[0].clientY - start.current.y
      // 처음 움직인 방향으로 가로/세로 판정 — 세로로 움직이면 넘기지 않음
      if (!axis.current && Math.abs(mx) + Math.abs(my) > 8) axis.current = Math.abs(mx) > Math.abs(my) ? 'x' : 'y'
      if (axis.current === 'x') setDx(mx)
    },
    onTouchEnd: (e: TouchEvent) => {
      const s = start.current
      if (!s || pinching.current || e.touches.length > 0 || axis.current !== 'x') {
        if (e.touches.length === 0) { start.current = null; setAnimating(true); setDx(0) }
        return
      }
      start.current = null
      const moved = e.changedTouches[0].clientX - s.x
      const speed = Math.abs(moved) / Math.max(1, Date.now() - s.t)
      // 화면 1/6 넘게 끌었거나, 짧아도 휙 튕기면 넘김
      if (Math.abs(moved) > Math.min(90, window.innerWidth / 6) || (Math.abs(moved) > 20 && speed > 0.35)) {
        const d = moved < 0 ? 1 : -1
        goRef.current(d)
        slideIn(d)
      } else {
        setAnimating(true); setDx(0) // 덜 끌었으면 제자리로
      }
    },
  }

  // 버튼·키로 넘길 때도 같은 밀려 들어오기 효과
  const step = (d: number) => { goRef.current(d); slideIn(d) }

  const mediaStyle: CSSProperties = {
    transform: dx ? `translateX(${dx}px)` : undefined,
    transition: animating ? 'transform 180ms ease-out' : 'none',
  }

  return { handlers, mediaStyle, step }
}
