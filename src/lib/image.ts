// 사진 빠른 업로드용 리사이즈 — ZIP 압축이 아니라 '크기 축소'라 저장 후 바로 보인다.
// 긴 변 maxDim(px)로 줄이고 JPEG로 저장. 실패하거나 오히려 커지면 원본 그대로 반환.
export async function compressImage(file: File, maxDim = 2000, quality = 0.85): Promise<File> {
  try {
    const isHeic = /\.hei[cf]$/i.test(file.name) || (file.type || '').includes('hei')
    const isImage = (file.type || '').startsWith('image/') || /\.(jpg|jpeg|png|webp|heic|heif)$/i.test(file.name)
    if (!isImage) return file                       // 동영상·문서는 그대로
    if ((file.type || '').includes('gif')) return file // 움짤은 변환하면 멈춤
    if (file.size < 400 * 1024 && !isHeic) return file // 400KB 미만은 줄일 필요 없음 (HEIC는 표시용 변환 필요해서 예외)

    const bmp = await createImageBitmap(file).catch(() => null)
    if (!bmp) return file                            // 디코딩 불가(HEIC 등) → 원본
    const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height))
    const w = Math.max(1, Math.round(bmp.width * scale))
    const h = Math.max(1, Math.round(bmp.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bmp, 0, 0, w, h)
    bmp.close()
    const blob: Blob | null = await new Promise(res => canvas.toBlob(res, 'image/jpeg', quality))
    if (!blob || blob.size >= file.size) return file // 줄어들지 않으면 원본 유지
    const base = file.name.replace(/\.[^.]+$/, '')
    return new File([blob], base + '.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}
