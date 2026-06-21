import * as XLSX from 'xlsx'

export type ParsedRow = { label: string; amount: number }

const LABEL_KEYWORDS = ['이름', '직원', '성명', '품목', '항목', '내용', '구분', '거래처', '품명']
const AMOUNT_KEYWORDS = ['금액', '합계', '공급가액', '총액', 'amount', 'total', '실지급액', '지급액']

function readSheet(file: File): Promise<unknown[][]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const data = e.target?.result
        const wb = XLSX.read(data, { type: 'binary' })
        const sheet = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' })
        resolve(rows)
      } catch (err) { reject(err) }
    }
    reader.onerror = reject
    reader.readAsBinaryString(file)
  })
}

/** 헤더 행을 찾아 라벨 컬럼과 금액 컬럼을 추론해 행 목록을 반환. 실패 시 null. */
export async function parseExcelRows(file: File): Promise<ParsedRow[] | null> {
  const rows = await readSheet(file)
  let headerIdx = -1, labelCol = -1, amountCol = -1
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const row = rows[r].map(c => String(c ?? '').trim())
    const lCol = row.findIndex(c => LABEL_KEYWORDS.some(k => c.includes(k)))
    const aCol = row.findIndex(c => AMOUNT_KEYWORDS.some(k => c.toLowerCase().includes(k.toLowerCase())))
    if (lCol >= 0 && aCol >= 0) { headerIdx = r; labelCol = lCol; amountCol = aCol; break }
  }
  if (headerIdx < 0) return null

  const result: ParsedRow[] = []
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r]
    if (!row || row.length === 0) continue
    const label = String(row[labelCol] ?? '').trim()
    const rawAmount = row[amountCol]
    const amount = Number(String(rawAmount ?? '').replace(/[^0-9.-]/g, ''))
    if (!label || !amount || isNaN(amount)) continue
    result.push({ label, amount })
  }
  return result.length > 0 ? result : null
}

/** 파일 내 금액 컬럼의 합계만 필요할 때 사용 */
export async function parseExcelTotal(file: File): Promise<number | null> {
  const rows = await parseExcelRows(file)
  if (!rows) return null
  return rows.reduce((sum, r) => sum + r.amount, 0)
}
