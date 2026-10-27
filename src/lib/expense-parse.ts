// 본사 월지출 엑셀(경리나라 손익보고서를 지피티가 정리한 파일) → 용도별 금액
// 표 머리에 '용도'(또는 용도명·항목) 칸과 '지출액'(또는 금액) 칸이 있으면 읽는다. '합계' 줄에서 멈추고, 같은 용도는 합친다.
// '보고서 구분' 칸이 있으면 '비용' 줄만 더한다(환불=매출·할인=매입 제외 → 경리나라 '비용 합계'와 같음).
// 회사 양식(public/templates/본사_월지출_양식.xlsx)과 예전 정리 파일(9월 지출요약, 1~8월 지출상세) 모두 같은 규칙으로 읽힌다.

export type ExpenseSheet = {
  month: string | null            // 'YYYY-MM' (제목·기간·파일명에서 찾음)
  rows: { label: string; amount: number }[]
  total: number
  fileTotal: number | null        // 파일의 '합계' 줄 금액(있으면 검산)
}

const LABEL_HEADS = ['용도', '용도명', '항목', '항목명', '계정과목']
const AMOUNT_HEADS = ['지출액', '금액(원)', '금액', '지출']
const cell = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim()
const num = (v: unknown) => typeof v === 'number' ? v : Number(cell(v).replace(/[^0-9.-]/g, ''))

function findMonth(rows: unknown[][], fileName: string): string | null {
  const head = rows.slice(0, 6).flat().map(cell).join(' ')
  let m = head.match(/(20\d{2})\s*년\s*(\d{1,2})\s*월/) || head.match(/(20\d{2})-(\d{2})-\d{2}/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}`
  m = fileName.match(/(20\d{2})[-_. ]?(\d{2})/)
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) return `${m[1]}-${m[2]}`
  const mm = fileName.match(/(\d{1,2})\s*월/)
  return mm ? `${new Date().getFullYear()}-${mm[1].padStart(2, '0')}` : null
}

export function parseExpenseRows(rows: unknown[][], fileName = ''): ExpenseSheet | null {
  let h = -1, lc = -1, ac = -1, kc = -1
  for (let r = 0; r < Math.min(rows.length, 40) && h < 0; r++) {
    const row = (rows[r] || []).map(cell)
    const l = row.findIndex(c => LABEL_HEADS.includes(c))
    const a = AMOUNT_HEADS.map(k => row.indexOf(k)).find(i => i >= 0) ?? -1
    if (l >= 0 && a >= 0) { h = r; lc = l; ac = a; kc = row.indexOf('보고서 구분') }
  }
  if (h < 0) return null

  const sums = new Map<string, number>()
  let fileTotal: number | null = null
  for (let r = h + 1; r < rows.length; r++) {
    const row = rows[r] || []
    const first = row.map(cell).find(Boolean) || ''
    if (/^(합\s*계|총\s*계)/.test(first)) { const t = num(row[ac]); fileTotal = isNaN(t) ? null : t; break }
    if (kc >= 0 && cell(row[kc]) && cell(row[kc]) !== '비용') continue
    const label = cell(row[lc]), amount = num(row[ac])
    if (!label || !amount || isNaN(amount)) continue
    sums.set(label, (sums.get(label) || 0) + amount)
  }
  const list = [...sums].map(([label, amount]) => ({ label, amount })).sort((a, b) => b.amount - a.amount)
  if (list.length === 0) return null
  return { month: findMonth(rows, fileName), rows: list, total: list.reduce((s, x) => s + x.amount, 0), fileTotal }
}

// 첫 시트부터 차례로 — 읽히는 첫 시트를 쓴다
export async function readExpenseFile(file: File): Promise<ExpenseSheet | null> {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array', cellDates: true })
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, defval: '' })
    const parsed = parseExpenseRows(rows, file.name)
    if (parsed) return parsed
  }
  return null
}
