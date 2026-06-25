// JM관리 서비스워커 — Web Share Target(공유 대상) 처리 전용.
// 앱 자산 캐싱은 하지 않는다(POST /share-target 외에는 전부 네트워크로 통과 → 앱 동작에 영향 없음).

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

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
  } catch (e) {
    // 무시 — 공유 화면에서 "파일 없음" 처리
  }
  return Response.redirect('/share', 303)
}
