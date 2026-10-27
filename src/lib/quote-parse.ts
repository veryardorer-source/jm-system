// 회사 견적서(PDF·엑셀)의 갑지에서 공사금액·부가세·고용산재를 읽어 온다.
// 갑지 양식: … 고용보험 1.01% 금액 / 산재보험 3.56% 금액 / … / 부가세 10% 금액 / [합계] 금액 / 특기사항 : (네고 내용)
// 노무비가 없으면 고용·산재 금액 칸이 비어 있다 → 0. 특기사항에 '… 부가세 280,000원 합계 : 3,080,000원으로 계약'이 있으면 네고 금액을 쓴다.

export type QuoteAmounts = {
  amount: number | null; vat: number | null; insurance: number | null; nego: boolean
  source?: '견적서' | '계약서'
  vatEstimated?: boolean // 계약서에 부가세가 따로 없어 금액에서 계산한 값
}

const NUM = '(\\d{1,3}(?:,\\d{3})+|\\d{4,})'
const toNum = (s: string) => Number(s.replace(/,/g, ''))
const sp = (word: string) => word.split('').join('\\s*') // 글자 사이 띄어쓰기 허용('부  가  세')
const VAT = sp('부가') + '\\s*(?:' + sp('가치') + '\\s*)?' + sp('세')

// 이름 바로 뒤(요율 %가 있으면 그 뒤)에 붙은 금액만 — 비어 있으면 다음 줄 숫자를 집지 않게
function rateAmount(text: string, label: string): { value: number; end: number } | null {
  const m = new RegExp(label + '\\s*(?:[\\d.]+\\s*%\\s*)?' + NUM).exec(text)
  if (m) return { value: toNum(m[1]), end: m.index + m[0].length }
  return new RegExp(label).test(text) ? { value: 0, end: -1 } : null
}

export function parseQuoteText(text: string): QuoteAmounts | null {
  const cut = new RegExp(sp('특기사항')).exec(text)
  const main = cut ? text.slice(0, cut.index) : text
  const note = cut ? text.slice(cut.index, cut.index + 300) : ''

  const emp = rateAmount(main, sp('고용보험'))
  const acc = rateAmount(main, sp('산재보험'))
  const insurance = emp || acc ? (emp?.value || 0) + (acc?.value || 0) : null

  const vatHit = rateAmount(main, VAT)
  let vat = vatHit ? vatHit.value : null
  let amount: number | null = null
  if (vatHit && vatHit.end > 0) {
    // 합계는 부가세 바로 다음 '[합 계]' 금액
    const t = new RegExp('\\[?\\s*' + sp('합계') + '\\s*\\]?\\s*' + NUM).exec(main.slice(vatHit.end))
    if (t) amount = toNum(t[1])
  }

  // 특기사항의 네고 금액(최종 계약 금액)
  let nego = false
  const negoTotal = new RegExp(sp('합계') + '\\s*[:：]?\\s*' + NUM + '\\s*원').exec(note)
  if (negoTotal) {
    amount = toNum(negoTotal[1]); nego = true
    const negoVat = new RegExp(VAT + '\\s*[:：]?\\s*' + NUM).exec(note)
    if (negoVat) vat = toNum(negoVat[1])
  }

  if (amount == null) return null // 합계가 없으면 회사 견적서 양식이 아님(디자인 견적 등)
  return { amount, vat, insurance, nego, source: '견적서' }
}

// 계약서 — '일금 ￦61,523,000원정(부가세포함)' · '계약금액 금8,000,000원(부가세포함)' ·
// '총 공사금액 : … ￦6,182,000원 / 부가가치세 : … ￦562,000원' · '총금액: KRW 47,990,000 (VAT별도)'
// 고용산재는 계약서에 없어 비워 둔다. 금액은 쉼표가 있는 숫자만(날짜 2026 등을 집지 않게).
const CNUM = '(\\d{1,3}(?:,\\d{3})+)'
export function parseContractText(text: string): QuoteAmounts | null {
  const t = text.replace(/\s+/g, ' ')
  const head = ['총공사금액', '계약금액', '총금액', '공사금액', '일금'].map(sp).join('|')
  const m = new RegExp('(?:' + head + ')[^\\d]{0,40}?' + CNUM).exec(t)
  if (!m) return null
  const base = toNum(m[1])
  const after = t.slice(m.index + m[0].length, m.index + m[0].length + 40)
  const excl = /포\s*함/.test(after) ? false
    : /별\s*도/.test(after) ? true
    : /(부가세|VAT)\s*별도/i.test(t) && !/(부가세|VAT)\s*포함/i.test(t)
  const vatM = new RegExp(sp('부가가치세') + '\\s*[:：][^\\d]{0,30}?' + CNUM).exec(t)
  if (excl) {
    const vat = vatM ? toNum(vatM[1]) : Math.round(base * 0.1)
    return { amount: base + vat, vat, insurance: null, nego: false, source: '계약서', vatEstimated: !vatM }
  }
  return { amount: base, vat: vatM ? toNum(vatM[1]) : Math.round(base / 11), insurance: null, nego: false, source: '계약서', vatEstimated: !vatM }
}

// 견적서 갑지 양식이면 견적서로, 아니면 계약서 문구로
export function parseDocText(text: string): QuoteAmounts | null {
  return parseQuoteText(text) || parseContractText(text)
}

// PDF 앞 3쪽(표지·갑지·집계표) 글자
async function pdfText(file: File): Promise<string> {
  const lib = await import('pdfjs-dist')
  lib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
  // cMap: 글꼴이 안 박힌 한글 PDF(계약서 등)도 글자를 읽으려면 필요 — public/cmaps(pdfjs-dist/cmaps 복사본)
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), cMapUrl: '/cmaps/', cMapPacked: true }).promise
  const parts: string[] = []
  for (let i = 1; i <= Math.min(3, doc.numPages); i++) {
    const content = await (await doc.getPage(i)).getTextContent()
    parts.push(content.items.map(it => ('str' in it ? it.str : '')).join('\n'))
  }
  await doc.destroy()
  return parts.join('\n')
}

// 엑셀(xlsb 포함) — 갑지 시트(고용보험이 있는 시트) 글자, 셀 표시 형식 그대로('195,574')
async function excelText(file: File): Promise<string> {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' })
  const texts = wb.SheetNames.slice(0, 6).map(n =>
    XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, raw: false, defval: '' })
      .flat().map(v => String(v).trim()).filter(Boolean).join('\n'))
  return texts.find(t => new RegExp(sp('고용보험')).test(t)) || texts.join('\n')
}

// 견적서·계약서 파일 → 금액. 읽을 수 없는 파일(사진·스캔 PDF·한글 파일·다른 양식)은 null
export async function readQuoteAmounts(file: File): Promise<QuoteAmounts | null> {
  const name = file.name.toLowerCase()
  try {
    if (name.endsWith('.pdf')) return parseDocText(await pdfText(file))
    if (/\.(xlsx|xlsb|xlsm|xls)$/.test(name)) return parseDocText(await excelText(file))
  } catch { /* 깨진 파일 등 — 손으로 입력 */ }
  return null
}
