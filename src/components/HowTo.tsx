'use client'

import { useState, type ReactNode } from 'react'

// 화면 위 '📖 사용 방법' 접이식 안내 — 접고 펼친 상태는 이 기기에 기억(실패해도 기본 펼침)
export default function HowTo({ id, children }: { id: string; children: ReactNode }) {
  const key = `howto:${id}`
  const [open, setOpen] = useState(() => {
    try { return typeof window === 'undefined' || localStorage.getItem(key) !== 'closed' } catch { return true }
  })
  return (
    <details open={open} className="bg-white border border-green-200 rounded-xl text-sm"
      onToggle={e => {
        const now = (e.currentTarget as HTMLDetailsElement).open
        setOpen(now)
        try { localStorage.setItem(key, now ? 'open' : 'closed') } catch { /* 저장 안 돼도 무관 */ }
      }}>
      <summary className="cursor-pointer select-none px-4 py-2.5 font-semibold text-green-800">📖 사용 방법</summary>
      <div className="px-4 pb-4 text-gray-700 leading-relaxed flex flex-col gap-3 [&_h4]:font-bold [&_h4]:text-gray-900 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mt-0.5">
        {children}
      </div>
    </details>
  )
}
