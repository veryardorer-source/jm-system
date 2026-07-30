// 사진 저장 최적화 파이프라인 — 용량(Storage 비용)과 로딩 속도를 함께 줄인다.
// 원칙: 긴 변 2400px 이하 + WebP 품질 80%로 저장, 목록용 500px 썸네일 별도 생성.
// 실패하거나 오히려 커지면 원본 그대로 반환(사진이 사라지는 일은 없게).

async function drawToCanvas(file: File, maxDim: number): Promise<HTMLCanvasElement | null> {
  const bmp = await createImageBitmap(file).catch(() => null)
  if (!bmp) return null // 디코딩 불가(HEIC 등) → 호출한 쪽에서 원본 처리
  const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height))
  const w = Math.max(1, Math.round(bmp.width * scale))
  const h = Math.max(1, Math.round(bmp.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(bmp, 0, 0, w, h)
  bmp.close()
  return canvas
}

// WebP 우선, 미지원 브라우저는 JPEG로
async function canvasToFile(canvas: HTMLCanvasElement, baseName: string, quality: number): Promise<File | null> {
  let blob: Blob | null = await new Promise(res => canvas.toBlob(res, 'image/webp', quality))
  let ext = 'webp'; let type = 'image/webp'
  if (!blob || blob.type !== 'image/webp') {
    blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', quality))
    ext = 'jpg'; type = 'image/jpeg'
  }
  if (!blob) return null
  return new File([blob], baseName + '.' + ext, { type })
}

export function isCompressibleImage(file: File): boolean {
  const isImage = (file.type || '').startsWith('image/') || /\.(jpg|jpeg|png|webp|heic|heif)$/i.test(file.name)
  if (!isImage) return false                          // 동영상·문서는 그대로
  if ((file.type || '').includes('gif')) return false // 움짤은 변환하면 멈춤
  return true
}

// 본 이미지: 긴 변 2400px 이하 + WebP 80%
export async function compressImage(file: File, maxDim = 2400, quality = 0.8): Promise<File> {
  try {
    if (!isCompressibleImage(file)) return file
    const isHeic = /\.hei[cf]$/i.test(file.name) || (file.type || '').includes('hei')
    if (file.size < 200 * 1024 && !isHeic && !/\.png$/i.test(file.name)) return file // 이미 작은 JPEG는 그대로
    const canvas = await drawToCanvas(file, maxDim)
    if (!canvas) return file
    const out = await canvasToFile(canvas, file.name.replace(/\.[^.]+$/, ''), quality)
    if (!out || out.size >= file.size) return file // 줄어들지 않으면 원본 유지
    return out
  } catch {
    return file
  }
}

// 목록(격자) 표시용 썸네일: 긴 변 500px WebP — 실패하면 null(본 이미지로 대체 표시)
export async function makeThumbnail(file: File, maxDim = 500, quality = 0.75): Promise<File | null> {
  try {
    if (!isCompressibleImage(file)) return null
    const canvas = await drawToCanvas(file, maxDim)
    if (!canvas) return null
    return await canvasToFile(canvas, file.name.replace(/\.[^.]+$/, '') + '_thumb', quality)
  } catch {
    return null
  }
}

// 동일 이미지 중복 업로드 방지용 지문(SHA-256) — 원본 파일 기준이라 같은 사진을 다시 골라도 잡아낸다
export async function hashFile(file: File): Promise<string> {
  try {
    const buf = await file.arrayBuffer()
    const digest = await crypto.subtle.digest('SHA-256', buf)
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
  } catch {
    return '' // http 환경 등 subtle 미지원이면 중복검사 없이 진행
  }
}

// 사진 파일명 규칙 — NAS 등에서 날짜순 정렬이 유지되게.
// 이름에 이미 날짜(20260730 / 2026-07-30 등)가 있으면 그대로 두고(확장자만 정리),
// 없으면(폰 공유 시 image.jpg 등으로 바뀌는 경우) 촬영·생성 시각으로 'YYYYMMDD_HHMMSS' 이름을 지어준다.
export function dateStampedName(file: File, finalExt?: string, seq?: number): string {
  const ext = (finalExt || file.name.split('.').pop() || 'jpg').replace(/^\./, '')
  const base = file.name.replace(/\.[^.]+$/, '')
  if (/20\d{2}[._-]?(0[1-9]|1[0-2])[._-]?(0[1-9]|[12]\d|3[01])/.test(base)) return `${base}.${ext}`
  const d = new Date(file.lastModified || Date.now())
  const p = (n: number) => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  return `${stamp}${seq != null ? '_' + (seq + 1) : ''}.${ext}`
}

// 용량 표시: 1.2MB / 340KB 식으로
export function formatBytes(n?: number | null): string {
  if (!n || n <= 0) return ''
  if (n >= 1024 * 1024 * 1024) return (n / 1024 / 1024 / 1024).toFixed(2) + 'GB'
  if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + 'MB'
  return Math.max(1, Math.round(n / 1024)) + 'KB'
}
