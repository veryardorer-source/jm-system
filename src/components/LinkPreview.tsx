'use client'

import { useEffect, useState } from 'react'

type Preview = { url: string; title?: string; description?: string; image?: string; siteName?: string }

// 같은 링크는 세션 내 재요청 안 함
const cache = new Map<string, Preview | null>()

export default function LinkPreview({ url }: { url: string }) {
  const [p, setP] = useState<Preview | null | undefined>(cache.get(url))

  useEffect(() => {
    if (cache.has(url)) { setP(cache.get(url)); return }
    let on = true
    fetch('/api/link-preview?url=' + encodeURIComponent(url))
      .then(r => (r.ok ? r.json() : null))
      .then((d: Preview | null) => {
        const v = d && (d.title || d.image) ? d : null
        cache.set(url, v)
        if (on) setP(v)
      })
      .catch(() => { cache.set(url, null); if (on) setP(null) })
    return () => { on = false }
  }, [url])

  if (!p) return null
  let host = ''
  try { host = new URL(url).hostname.replace(/^www\./, '') } catch {}

  return (
    <a href={url} target="_blank" rel="noreferrer"
      className="block w-[240px] max-w-full bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow">
      {p.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.image} alt="" className="w-full h-32 object-cover bg-gray-100"
          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
      )}
      <div className="px-3 py-2">
        {p.title && <p className="text-xs font-semibold text-gray-800 line-clamp-2 leading-snug">{p.title}</p>}
        {p.description && <p className="text-[11px] text-gray-500 line-clamp-2 mt-0.5 leading-snug">{p.description}</p>}
        <p className="text-[10px] text-gray-400 mt-1">🔗 {p.siteName || host}</p>
      </div>
    </a>
  )
}
