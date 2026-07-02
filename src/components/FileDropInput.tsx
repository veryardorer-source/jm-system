'use client'

import { useEffect, useRef, useState } from 'react'

// 단일 파일 업로드칸 — 클릭·드래그·Ctrl+V 붙여넣기(캡처) 지원
export default function FileDropInput({
  onFile, currentName, accept, hint,
}: {
  onFile: (f: File) => void
  currentName?: string
  accept?: string
  hint?: string
}) {
  const [drag, setDrag] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const h = (e: ClipboardEvent) => {
      const img = Array.from(e.clipboardData?.items || []).find(it => it.type.startsWith('image/'))
      if (!img) return
      e.preventDefault()
      const f = img.getAsFile()
      if (f) onFile(f)
    }
    window.addEventListener('paste', h)
    return () => window.removeEventListener('paste', h)
  }, [onFile])

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={e => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f) }}
      className={`w-full border-2 border-dashed rounded-lg px-3 py-4 text-center cursor-pointer transition-all ${
        drag ? 'border-green-500 bg-green-50' : currentName ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-green-400'
      }`}
    >
      <input ref={inputRef} type="file" accept={accept} className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
      {currentName ? (
        <p className="text-sm font-medium text-green-700 truncate">{currentName}</p>
      ) : (
        <>
          <p className="text-sm font-medium text-gray-600">클릭 · 드래그 · <span className="text-green-600">Ctrl+V 붙여넣기</span></p>
          {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
        </>
      )}
    </div>
  )
}
