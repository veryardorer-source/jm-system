'use client'

import { useEffect, useState } from 'react'

// 화면 위에 잠깐 떠났다 사라지는 알림(토스트) — alert() 대체.
// 어디서든 toast('저장했어요') / toast('실패: ...', 'error') 로 호출.
export type ToastType = 'ok' | 'error' | 'info'
type ToastItem = { id: number; msg: string; type: ToastType }

export function toast(msg: string, type?: ToastType) {
  if (typeof window === 'undefined') return
  // 종류를 안 주면 문구로 판별 — 실패/오류는 빨강, 완료/성공은 초록
  const auto: ToastType = type
    ?? (/실패|오류|없어요|못 |안 돼|만료/.test(msg) ? 'error'
    : /완료|했어요|보냈|성공/.test(msg) ? 'ok' : 'info')
  window.dispatchEvent(new CustomEvent('jm-toast', { detail: { msg, type: auto } }))
}

let seq = 1

export default function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([])

  useEffect(() => {
    const onToast = (e: Event) => {
      const { msg, type } = (e as CustomEvent).detail as { msg: string; type: ToastType }
      const id = seq++
      setItems(prev => [...prev.slice(-3), { id, msg, type }]) // 최대 4개
      setTimeout(() => setItems(prev => prev.filter(t => t.id !== id)), type === 'error' ? 5000 : 3000)
    }
    window.addEventListener('jm-toast', onToast)
    return () => window.removeEventListener('jm-toast', onToast)
  }, [])

  if (!items.length) return null
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 items-center pointer-events-none px-4 w-full max-w-md">
      {items.map(t => (
        <div key={t.id}
          className={`pointer-events-auto w-full text-sm px-4 py-3 rounded-xl shadow-lg border text-center break-words ${
            t.type === 'error' ? 'bg-red-50 border-red-200 text-red-700'
            : t.type === 'ok' ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-white border-gray-200 text-gray-700'
          }`}
          onClick={() => setItems(prev => prev.filter(x => x.id !== t.id))}>
          {t.msg}
        </div>
      ))}
    </div>
  )
}
