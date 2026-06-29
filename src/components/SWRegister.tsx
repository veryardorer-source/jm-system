'use client'

import { useEffect } from 'react'

export default function SWRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => { reg.update().catch(() => {}) }) // 최신 서비스워커 확인(공유 텍스트 기능 갱신)
        .catch(() => {})
    }
  }, [])
  return null
}
