'use client'

import { useEffect } from 'react'

// 지금 앱이 기대하는 서비스워커 버전 (public/sw.js의 SW_VERSION과 같아야 함)
const WANT_VERSION = 'v6-2026-09-23'
const HEAL_KEY = 'jm_sw_heal_' + WANT_VERSION

// 동작 중인 서비스워커에 버전을 물어본다 (옛 버전은 답하지 못함 → 빈 값)
function askVersion(sw: ServiceWorker): Promise<string> {
  return new Promise(resolve => {
    try {
      const ch = new MessageChannel()
      const timer = setTimeout(() => resolve(''), 1500)
      ch.port1.onmessage = e => { clearTimeout(timer); resolve((e.data && e.data.version) || '') }
      sw.postMessage({ type: 'version' }, [ch.port2])
    } catch { resolve('') }
  })
}

export default function SWRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    let on = true
    ;(async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js')
        await reg.update().catch(() => {})
        if (!on) return
        // 옛 서비스워커가 남아 있으면(공유·알림이 옛 코드로 동작) 한 번만 완전히 새로 설치해 자가 복구
        const active = reg.active
        if (!active) return
        const v = await askVersion(active)
        if (!on || v === WANT_VERSION) return
        if (localStorage.getItem(HEAL_KEY)) return // 같은 버전으로는 한 번만 시도 (무한 반복 방지)
        localStorage.setItem(HEAL_KEY, '1')
        await reg.unregister().catch(() => {})
        await navigator.serviceWorker.register('/sw.js').catch(() => {})
      } catch { /* 무시 */ }
    })()
    return () => { on = false }
  }, [])
  return null
}
