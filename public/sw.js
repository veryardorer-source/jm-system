// JM관리 서비스워커 — Web Share Target(공유) + Web Push(알림) 처리.
// v6 (2026-09-23): 공유 진단(버전 응답) 추가. size 0 파일도 끝까지 읽고 실패 이유를 남긴다.

const SW_VERSION = 'v6-2026-09-23'

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
  let received = 0
  let saved = 0
  const detail = []
  try {
    const formData = await request.formData()
    const cache = await caches.open('shared-media')
    for (const key of await cache.keys()) await cache.delete(key)

    // 파일 필드는 'files'가 표준이지만 기기·앱마다 이름이 다를 수 있어 전부 훑는다
    const entries = []
    for (const [, value] of formData.entries()) {
      if (value && typeof value === 'object' && typeof value.arrayBuffer === 'function') entries.push(value)
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
    await cache.put('/__shared/meta', new Response(JSON.stringify({ received, saved, detail })))
  } catch (e) {
    try {
      const cache = await caches.open('shared-media')
      await cache.put('/__shared/meta', new Response(JSON.stringify({ received, saved, error: String((e && e.message) || e) })))
    } catch { /* 무시 */ }
  }
  return Response.redirect('/share', 303)
}
