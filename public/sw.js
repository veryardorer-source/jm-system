// JM관리 서비스워커 — Web Share Target(공유) + Web Push(알림) 처리.
// v4 (2026-06-30): 웹 푸시(앱 꺼져 있어도 OS 알림) 추가.

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

// 웹 푸시 수신 → OS 알림 표시 (앱이 꺼져 있어도 동작)
self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch (e) { data = {} }
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
  try {
    const formData = await request.formData()
    const files = formData.getAll('files').filter((f) => f && f.size > 0)
    const cache = await caches.open('shared-media')
    for (const key of await cache.keys()) await cache.delete(key)
    let i = 0
    for (const file of files) {
      await cache.put(
        '/__shared/' + i,
        new Response(file, {
          headers: {
            'content-type': file.type || 'application/octet-stream',
            'x-filename': encodeURIComponent(file.name || 'file' + i),
          },
        })
      )
      i++
    }
    await cache.put('/__shared/count', new Response(String(i)))
    // 공유로 함께 넘어온 텍스트(카톡 메시지 내용 등)도 저장 — 공유 페이지에서 메모로 사용
    const sharedText = [formData.get('title'), formData.get('text'), formData.get('url')]
      .filter((v) => typeof v === 'string' && v.trim())
      .join('\n')
      .trim()
    await cache.put('/__shared/text', new Response(sharedText))
  } catch (e) {
    // 무시 — 공유 화면에서 "파일 없음" 처리
  }
  return Response.redirect('/share', 303)
}
