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

// ───────────── 급여대장 파서 ─────────────
export type PayrollRow = { name: string; base: number; gross: number; net: number }
export type PayrollLedger = { month: string; rows: PayrollRow[] } // month: 'YYYY-MM'

function readNamedSheet(file: File, keyword: string): Promise<unknown[][]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const wb = XLSX.read(e.target?.result, { type: 'binary' })
        const name = wb.SheetNames.find(n => n.includes(keyword)) || wb.SheetNames[0]
        const sheet = wb.Sheets[name]
        // raw:false → 표시 형식(날짜·통화 포함)을 문자열로 반환 (예: 날짜셀 "2026년 6월", "6,875,000")
        resolve(XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: false }))
      } catch (err) { reject(err) }
    }
    reader.onerror = reject
    reader.readAsBinaryString(file)
  })
}

const numOf = (v: unknown) => Number(String(v ?? '').replace(/[^0-9.-]/g, '')) || 0

/** '급여대장' 시트를 읽어 월(YYYY-MM)과 직원별 (기본급/급여합계/차감지급액)을 추출. 실패 시 null. */
export async function parsePayrollLedger(file: File): Promise<PayrollLedger | null> {
  const rows = await readNamedSheet(file, '급여대장')

  // 월 찾기: "2026년 7월", "2026-07", "2026.7" 등
  let month = ''
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    for (const cell of rows[r] || []) {
      const s = String(cell ?? '')
      const m = s.match(/(20\d{2})\s*[년.\-/]\s*(\d{1,2})\s*월?/)
      if (m) {
        const mm = Number(m[2])
        if (mm >= 1 && mm <= 12) { month = `${m[1]}-${String(mm).padStart(2, '0')}`; break }
      }
    }
    if (month) break
  }

  // 헤더 행: '성명'과 '급여합계'가 있는 행
  let headerIdx = -1, nameCol = -1, baseCol = -1, grossCol = -1, netCol = -1
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const row = (rows[r] || []).map(c => String(c ?? '').replace(/\s/g, ''))
    const nc = row.findIndex(c => c === '성명' || c === '이름')
    const gc = row.findIndex(c => c.includes('급여합계'))
    if (nc >= 0 && gc >= 0) {
      headerIdx = r; nameCol = nc; grossCol = gc
      baseCol = row.findIndex(c => c.includes('기본급'))
      netCol = row.findIndex(c => c.includes('차감지급'))
      break
    }
  }
  if (headerIdx < 0) return null

  const result: PayrollRow[] = []
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r]
    if (!row) continue
    const name = String(row[nameCol] ?? '').trim()
    if (!name || name.includes('합계') || name.includes('총계') || /^[0-9]+$/.test(name)) continue
    const gross = grossCol >= 0 ? numOf(row[grossCol]) : 0
    if (!gross) continue
    result.push({
      name,
      base: baseCol >= 0 ? numOf(row[baseCol]) : 0,
      gross,
      net: netCol >= 0 ? numOf(row[netCol]) : 0,
    })
  }
  return result.length ? { month, rows: result } : null
}

// ── 급여대장 전체 시트 (지급·공제 모든 항목) ──
export type PayrollLedgerFull = {
  month: string            // 'YYYY-MM'
  headers: string[]        // 성명 ~ 차감지급액 구간의 항목명
  rows: string[][]         // 직원별 값(표시 문자열 그대로)
  total: string[] | null   // '총 합계' 행
}

/** '급여대장' 시트를 통째로 읽어 성명~차감지급액 구간의 모든 컬럼(수당·공제 포함)을 반환.
 *  뒤쪽 참고용 컬럼(연금상한 등)과 빈 헤더 컬럼은 제외. 실패 시 null. */
export async function parsePayrollLedgerFull(file: File): Promise<PayrollLedgerFull | null> {
  const rows = await readNamedSheet(file, '급여대장')

  // 월 찾기 (parsePayrollLedger와 동일 규칙)
  let month = ''
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    for (const cell of rows[r] || []) {
      const m = String(cell ?? '').match(/(20\d{2})\s*[년.\-/]\s*(\d{1,2})\s*월?/)
      if (m) { const mm = Number(m[2]); if (mm >= 1 && mm <= 12) { month = `${m[1]}-${String(mm).padStart(2, '0')}`; break } }
    }
    if (month) break
  }

  // 헤더 행 + 성명/차감지급액 컬럼 위치
  const clean = (v: unknown) => String(v ?? '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
  let headerIdx = -1, nameCol = -1, endCol = -1
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const row = (rows[r] || []).map(c => clean(c).replace(/\s/g, ''))
    const nc = row.findIndex(c => c === '성명' || c === '이름')
    if (nc < 0 || !row.some(c => c.includes('급여합계'))) continue
    headerIdx = r; nameCol = nc
    endCol = row.findIndex(c => c.includes('차감지급'))
    if (endCol < 0) endCol = row.findIndex(c => c.includes('공제합계'))
    if (endCol < 0) endCol = row.findIndex(c => c.includes('급여합계'))
    break
  }
  if (headerIdx < 0 || endCol < nameCol) return null

  // 성명~차감지급액 구간에서 헤더가 비어있지 않은 컬럼만
  const headerRow = rows[headerIdx] || []
  const cols: number[] = []
  for (let c = nameCol; c <= endCol; c++) if (clean(headerRow[c])) cols.push(c)
  const headers = cols.map(c => clean(headerRow[c]))

  const body: string[][] = []
  let total: string[] | null = null
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r]
    if (!row) continue
    const first = clean(row[nameCol])
    if (first.includes('합계') || first.includes('총계') || clean(row[0]).includes('합계')) {
      if (!total) total = cols.map(c => clean(row[c]))
      continue
    }
    // 유효 직원 행: 이름이 있고 '0'이 아니며 급여합계 컬럼에 값이 있는 행
    if (!first || first === '0' || /^[0-9]+$/.test(first)) continue
    const grossIdx = headers.findIndex(h => h.replace(/\s/g, '').includes('급여합계'))
    const vals = cols.map(c => clean(row[c]))
    if (grossIdx >= 0 && !numOf(vals[grossIdx])) continue
    body.push(vals)
  }
  return body.length ? { month, headers, rows: body, total } : null
}
