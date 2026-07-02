// 견적서 엑셀 출력 — 기존 회사 양식(표지/갑지/공종별집계표/내역서 4시트) 재현
import ExcelJS from 'exceljs'
import { Estimate, calcGapji, sectionSubtotal, itemAmounts, toKoreanAmount } from './estimate'

const COMPANY = {
  name: 'JM건축인테리어',
  addr: '경상남도 창원시 의창구 평산로 135번길 4, 2층',
  bizno: '사업자등록번호 : 168-86-03200',
  ceo: '대표 : 이소연',
  tel: 'TEL : 055-252-0611',
  email: 'E-Mail :  jmworks0612@naver.com',
}

const FONT = '맑은 고딕'
const thin = { style: 'thin' as const, color: { argb: 'FF888888' } }
const BOX = { top: thin, left: thin, bottom: thin, right: thin }

function f(size = 10, opts: Partial<ExcelJS.Font> = {}): Partial<ExcelJS.Font> {
  return { name: FONT, size, ...opts }
}

export async function buildEstimateWorkbook(est: Estimate): Promise<Blob> {
  const wb = new ExcelJS.Workbook()
  const g = calcGapji(est.sections, est.rates, est.nego)
  const workName = est.work_name || `${est.title} 인테리어`

  // ── 1. 표지 ─────────────────────────────────────────────
  const cover = wb.addWorksheet('표지')
  cover.pageSetup = { paperSize: 9, orientation: 'portrait' }
  for (let c = 1; c <= 8; c++) cover.getColumn(c).width = 11
  cover.mergeCells('A8:H9')
  const t1 = cover.getCell('A8')
  t1.value = '견   적   서'
  t1.font = f(36, { bold: true })
  t1.alignment = { horizontal: 'center', vertical: 'middle' }
  cover.mergeCells('A12:H12')
  const t2 = cover.getCell('A12')
  t2.value = workName
  t2.font = f(18, { bold: true })
  t2.alignment = { horizontal: 'center' }
  cover.mergeCells('A14:H14')
  const t3 = cover.getCell('A14')
  t3.value = est.est_date
  t3.font = f(12)
  t3.alignment = { horizontal: 'center' }
  cover.mergeCells('A24:H24')
  const t4 = cover.getCell('A24')
  t4.value = COMPANY.name
  t4.font = f(22, { bold: true })
  t4.alignment = { horizontal: 'center' }

  // ── 2. 갑지 ─────────────────────────────────────────────
  const gz = wb.addWorksheet('갑지')
  gz.pageSetup = { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 1 }
  const gzW = [16, 22, 8, 7, 13, 13, 13, 15, 9]
  gzW.forEach((w, i) => { gz.getColumn(i + 1).width = w })

  gz.mergeCells('A2:I3')
  const gt = gz.getCell('A2')
  gt.value = '견    적    서'
  gt.font = f(20, { bold: true })
  gt.alignment = { horizontal: 'center', vertical: 'middle' }

  const info: Array<[number, string, string, string]> = [
    [6, '수          신 :', `${est.customer || '대표님'} 귀하`, COMPANY.addr],
    [7, '작 성 일 :', est.est_date, COMPANY.bizno],
    [8, '', '', COMPANY.ceo],
    [9, '공 사 명 :', workName, COMPANY.tel],
    [10, '계 약 금 액 :', toKoreanAmount(g.grandTotal), COMPANY.email],
  ]
  for (const [r, a, b, right] of info) {
    gz.getCell(r, 1).value = a
    gz.getCell(r, 1).font = f(10, { bold: true })
    gz.mergeCells(r, 2, r, 6)
    gz.getCell(r, 2).value = b
    gz.getCell(r, 2).font = f(10)
    gz.mergeCells(r, 7, r, 9)
    gz.getCell(r, 7).value = right
    gz.getCell(r, 7).font = f(9)
  }
  gz.getCell(12, 1).value = '아래와 같이 견적합니다.'
  gz.getCell(12, 1).font = f(10)

  const HEAD = ['품       명', '규      격', '수 량', '단위', '재 료 비', '노 무 비', '경    비', '합       계', '비  고']
  const hr = 14
  HEAD.forEach((h, i) => {
    const c = gz.getCell(hr, i + 1)
    c.value = h
    c.font = f(10, { bold: true })
    c.alignment = { horizontal: 'center', vertical: 'middle' }
    c.border = BOX
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } }
  })

  const money = '#,##0'
  type GRow = [string, string | number, string | number, string, number | string, number | string, number | string, number | string, string]
  const rows: GRow[] = [
    ['순 공 사 비', '', 1, '식', g.directMat, g.directLab, g.directExp, g.direct, ''],
    ['', '', '', '', '', '', '', '', ''],
    ['직 접 공 사 비 계', '', '', '', g.directMat, g.directLab, g.directExp, g.direct, ''],
    ['고용보험', est.rates.employ, '', '', '', '', '', Math.round(g.employ), '노무비 기준'],
    ['산재보험', est.rates.accident, '', '', '', '', '', Math.round(g.accident), '노무비 기준'],
    ...(g.safety ? [['산업안전보건관리비', '', '', '', '', '', '', g.safety, ''] as GRow] : []),
    ['일반관리비', est.rates.mgmt, '', '', '', '', '', Math.round(g.mgmt), ''],
    ['이윤', est.rates.profit, '', '', '', '', '', Math.round(g.profit), ''],
    ['단수정리', '', '', '', '', '', '', '천단위절사', ''],
    [' 간 접 공 사 비 계', '', '', '', '', '', '', Math.round(g.indirect), ''],
    ['총 공 사 비', '', '', '', '', '', '', g.gross, ''],
    ...(g.nego ? [
      ['네 고', '', '', '', '', '', '', g.nego, ''] as GRow,
      ['최 종 총 공 사 비', '', '', '', '', '', '', g.grossFinal, ''] as GRow,
    ] : []),
    ['부  가  세', est.rates.vat, '', '', '', '', '', g.vat, ''],
    ['       [    합        계    ]', '', '', '', '', '', '', g.grandTotal, ''],
  ]
  let r = hr + 1
  for (const row of rows) {
    row.forEach((v, i) => {
      const c = gz.getCell(r, i + 1)
      c.value = v === '' ? null : v
      c.font = f(10, { bold: i === 0 })
      c.border = BOX
      if (i >= 4 || i === 2) c.numFmt = money
      if (i === 1 && typeof v === 'number' && v < 1) c.numFmt = '0.00%'
      if (i >= 2 && i <= 7) c.alignment = { horizontal: i === 3 ? 'center' : 'right' }
    })
    r++
  }
  gz.getCell(r + 1, 1).value = `특기사항 : ${est.note || ''}`
  gz.getCell(r + 1, 1).font = f(10)

  // ── 3. 공종별집계표 ──────────────────────────────────────
  const sm = wb.addWorksheet('공종별집계표')
  sm.pageSetup = { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 1 }
  const smW = [5, 20, 14, 6, 7, 11, 12, 11, 12, 11, 12, 13]
  smW.forEach((w, i) => { sm.getColumn(i + 1).width = w })
  sm.mergeCells('B1:K1')
  sm.getCell('B1').value = '공 종 별 집 계 표'
  sm.getCell('B1').font = f(16, { bold: true })
  sm.getCell('B1').alignment = { horizontal: 'center' }
  sm.mergeCells('B2:K2')
  sm.getCell('B2').value = workName
  sm.getCell('B2').font = f(11)
  sm.getCell('B2').alignment = { horizontal: 'center' }

  const smHead1 = ['', '품 명', '규 격', '단위', '수 량', '재  료  비', '', '노  무  비', '', '경      비', '', '합       계']
  const smHead2 = ['', '', '', '', '', '단가', '금액', '단가', '금액', '단가', '금액', '금액']
  ;[smHead1, smHead2].forEach((hrow, hi) => {
    hrow.forEach((h, i) => {
      const c = sm.getCell(4 + hi, i + 1)
      c.value = h || null
      c.font = f(9, { bold: true })
      c.alignment = { horizontal: 'center' }
      c.border = BOX
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } }
    })
  })
  sm.mergeCells(4, 6, 4, 7); sm.mergeCells(4, 8, 4, 9); sm.mergeCells(4, 10, 4, 11)

  let sr = 6
  const totals = { mat: 0, lab: 0, exp: 0 }
  est.sections.forEach((sec, i) => {
    const sub = sectionSubtotal(sec)
    totals.mat += sub.mat; totals.lab += sub.lab; totals.exp += sub.exp
    const vals = [i + 1, sec.name, '', '식', 1, '', sub.mat, '', sub.lab, '', sub.exp, sub.total]
    vals.forEach((v, ci) => {
      const c = sm.getCell(sr, ci + 1)
      c.value = v === '' ? null : v
      c.font = f(9)
      c.border = BOX
      if (ci >= 5) { c.numFmt = money; c.alignment = { horizontal: 'right' } }
      if (ci === 3 || ci === 4 || ci === 0) c.alignment = { horizontal: 'center' }
    })
    sr++
  })
  const smTotal = ['', '합 계', '', '', '', '', totals.mat, '', totals.lab, '', totals.exp, totals.mat + totals.lab + totals.exp]
  smTotal.forEach((v, ci) => {
    const c = sm.getCell(sr + 1, ci + 1)
    c.value = v === '' ? null : v
    c.font = f(10, { bold: true })
    c.border = BOX
    if (ci >= 5) { c.numFmt = money; c.alignment = { horizontal: 'right' } }
  })

  // ── 4. 내역서 ────────────────────────────────────────────
  const dt = wb.addWorksheet('내역서')
  dt.pageSetup = { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1 }
  const dtW = [5, 22, 18, 6, 7, 10, 11, 10, 11, 9, 10, 11, 12]
  dtW.forEach((w, i) => { dt.getColumn(i + 1).width = w })
  dt.getCell('A1').value = '[내  역  서]'
  dt.getCell('A1').font = f(14, { bold: true })
  dt.getCell('A2').value = workName
  dt.getCell('A2').font = f(11)

  const dHead1 = ['항목', '품      명', '규      격', '단위', '수량', '재료비', '', '노무비', '', '경  비', '', '합  계', '']
  const dHead2 = ['', '', '', '', '', '단  가', '금  액', '단  가', '금  액', '단  가', '금  액', '단  가', '금  액']
  ;[dHead1, dHead2].forEach((hrow, hi) => {
    hrow.forEach((h, i) => {
      const c = dt.getCell(4 + hi, i + 1)
      c.value = h || null
      c.font = f(9, { bold: true })
      c.alignment = { horizontal: 'center' }
      c.border = BOX
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } }
    })
  })
  dt.mergeCells(4, 6, 4, 7); dt.mergeCells(4, 8, 4, 9); dt.mergeCells(4, 10, 4, 11); dt.mergeCells(4, 12, 4, 13)

  let dr = 6
  const put = (ci: number, v: string | number | null, bold = false, fmt = false) => {
    const c = dt.getCell(dr, ci)
    c.value = v
    c.font = f(9, { bold })
    c.border = BOX
    if (fmt) { c.numFmt = money; c.alignment = { horizontal: 'right' } }
    return c
  }
  est.sections.forEach((sec, si) => {
    put(1, si + 1, true).alignment = { horizontal: 'center' }
    put(2, sec.name, true)
    for (let ci = 3; ci <= 13; ci++) put(ci, null)
    dr++
    for (const it of sec.items) {
      if (!it.name) continue
      const a = itemAmounts(it)
      put(1, null)
      put(2, it.name)
      put(3, it.spec || null)
      put(4, it.unit || null).alignment = { horizontal: 'center' }
      put(5, it.qty || null, false, true)
      put(6, it.mat || null, false, true)
      put(7, a.mat || null, false, true)
      put(8, it.lab || null, false, true)
      put(9, a.lab || null, false, true)
      put(10, it.exp || null, false, true)
      put(11, a.exp || null, false, true)
      put(12, (it.mat + it.lab + it.exp) || null, false, true)
      put(13, a.total || null, false, true)
      dr++
    }
    const sub = sectionSubtotal(sec)
    put(1, null)
    put(2, '[소   계]', true)
    put(3, null); put(4, null); put(5, null)
    put(6, null); put(7, sub.mat, true, true)
    put(8, null); put(9, sub.lab, true, true)
    put(10, null); put(11, sub.exp, true, true)
    put(12, null); put(13, sub.total, true, true)
    dr++
    dr++ // 빈 줄
  })
  put(2, '[합   계]', true)
  put(7, g.directMat, true, true)
  put(9, g.directLab, true, true)
  put(11, g.directExp, true, true)
  put(13, g.direct, true, true)

  const buf = await wb.xlsx.writeBuffer()
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

export function downloadEstimateExcel(est: Estimate) {
  return buildEstimateWorkbook(est).then(blob => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const date = (est.est_date || '').replaceAll('-', '').slice(2)
    a.href = url
    a.download = `${date}_${est.title} 견적서.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  })
}
