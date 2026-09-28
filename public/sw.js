// JM관리 서비스워커 — Web Share Target(공유) + Web Push(알림) 처리.
// v8 (2026-09-28): 공유 본문을 읽지 못하면 서버 수신 경로로 재시도한다.

const SW_VERSION = 'v8-2026-09-28'

// 페이지가 '지금 동작 중인 서비스워커 버전'을 물어볼 수 있게 (진단용)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'version' && event.ports && event.ports[0]) {
    event.ports[0].postMessage({ version: SW_VERSION })
  }
})

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

// 웹 푸시 수신 → OS 알림 표시 (앱이 꺼져 있어도 동작)
self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = {} }
  const title = data.title || 'JM 관리 시스템'
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.tag || undefined,
    data: { link: data.link || '/' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

// 알림 클릭 → 앱 열기/포커스 + 해당 화면 이동
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const link = (event.notification.data && event.notification.data.link) || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) { client.navigate(link); return client.focus() }
      }
      if (self.clients.openWindow) return self.clients.openWindow(link)
    })
  )
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method === 'POST' && url.pathname === '/share-target') {
    event.respondWith(handleShare(event.request))
  }
})

async function handleShare(request) {
  const attemptedAt = Date.now()
  // formData()가 실패해도 원본 본문을 서버로 전달할 수 있도록 먼저 복제한다.
  const serverRequest = request.clone()
  let received = 0
  let saved = 0
  const detail = []
  const fields = []
  let stage = 'formData'
  try {
    const formData = await request.formData()
    stage = 'cache'
    const cache = await caches.open('shared-media')
    for (const key of await cache.keys()) await cache.delete(key)

    // 파일 필드는 'files'가 표준이지만 기기·앱마다 이름이 다를 수 있어 전부 훑는다
    const entries = []
    for (const [key, value] of formData.entries()) {
      if (value && typeof value === 'object' && typeof value.arrayBuffer === 'function') {
        entries.push(value)
        fields.push({ key, kind: 'file', type: value.type || '', size: value.size || 0 })
      } else {
        fields.push({ key, kind: 'text', length: String(value).length })
      }
    }
    received = entries.length

    for (const file of entries) {
      try {
        // size가 0으로 보고돼도 실제로는 읽히는 기기가 있어(문자 수신 사진 등) 끝까지 시도한다
        const buf = await file.arrayBuffer()
        detail.push({ name: file.name || '', type: file.type || '', size: buf.byteLength })
        if (!buf.byteLength) continue
        await cache.put(
          '/__shared/' + saved,
          new Response(buf, {
            headers: {
              'content-type': file.type || 'application/octet-stream',
              'x-filename': encodeURIComponent(file.name || 'file' + saved),
            },
          })
        )
        saved++
      } catch (e) {
        detail.push({ name: file.name || '', type: file.type || '', size: -1, err: String((e && e.message) || e) })
      }
    }
    await cache.put('/__shared/count', new Response(String(saved)))

    // 공유로 함께 넘어온 텍스트(카톡 메시지 내용 등)도 저장 — 공유 페이지에서 메모로 사용
    const sharedText = [formData.get('title'), formData.get('text'), formData.get('url')]
      .filter((v) => typeof v === 'string' && v.trim())
      .join('\n')
      .trim()
    await cache.put('/__shared/text', new Response(sharedText))
    // 받았지만 못 읽은 경우를 화면에서 안내할 수 있게 결과를 남긴다
    await cache.put('/__shared/meta', new Response(JSON.stringify({ received, saved, detail, fields, attemptedAt, source: 'service-worker' })))
  } catch (e) {
    let serverError = ''
    try {
      // 삼성 인터넷 등에서 SW의 본문 읽기가 실패하면 기존 서버 수신 경로를 쓴다.
      // 서버의 303 목적지를 다시 돌려주어 주소창도 /share로 이동시킨다.
      const response = await fetch(serverRequest)
      if (response.redirected && response.url && new URL(response.url).origin === new URL(request.url).origin) {
        return Response.redirect(response.url, 303)
      }
      serverError = '서버 응답 ' + response.status + ' (공유 화면으로 이동하지 않음)'
    } catch (fallbackError) {
      serverError = String((fallbackError && fallbackError.message) || fallbackError)
    }
    try {
      const cache = await caches.open('shared-media')
      await cache.put('/__shared/meta', new Response(JSON.stringify({ received, saved, fields, attemptedAt, source: 'service-worker', error: stage + ': ' + String((e && e.message) || e) + ' / 서버 재시도: ' + serverError })))
    } catch { /* 무시 */ }
  }
  return Response.redirect(new URL('/share?shareAttempt=' + attemptedAt, request.url).href, 303)
}
