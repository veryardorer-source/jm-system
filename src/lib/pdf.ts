// PDF 문서 속성 교정 — 복사해서 만든 제안서에 옛 현장 제목이 남아
// 뷰어 상단에 엉뚱한 제목이 뜨는 문제를 업로드 시점에 자동으로 고친다.
// (pdf-lib는 PDF 업로드 때만 동적 로드 — 평소 화면 속도에 영향 없음)
export async function normalizePdfTitle(file: File, title?: string): Promise<File> {
  try {
    if (!/\.pdf$/i.test(file.name)) return file
    const { PDFDocument } = await import('pdf-lib')
    const buf = await file.arrayBuffer()
    const doc = await PDFDocument.load(buf, { ignoreEncryption: true })
    doc.setTitle((title || file.name).replace(/\.pdf$/i, ''))
    const out = await doc.save()
    return new File([out], file.name, { type: 'application/pdf' })
  } catch {
    return file // 암호화·손상 등으로 실패하면 원본 그대로 (업로드는 계속)
  }
}
