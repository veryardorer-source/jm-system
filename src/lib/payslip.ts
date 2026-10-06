// 임금명세서 — 노무사가 준 양식 '임금명세서' 시트 그대로 (대표 결정: 양식에 있는 내용만, 2026-10-06)
// 회사명·급여귀속·지급일·성명·입사일 / 지급(매월·부정기)·공제 / 지급액 계·공제액 계·실수령액 / 계산 방법 3줄
// 계산은 lib/payroll.ts calcPay 결과를 그대로 씀 — 급여대장과 금액이 어긋날 수 없게.
import { COMPANY, WORK_TYPES, WorkType, PayInput, PayResult } from './payroll'

export type SlipLine = { label: string; amount: number }
export type SlipMethod = { label: string; how: string; amount: number }
export type Slip = {
  month: string          // 'YYYY-MM'
  monthLabel: string     // '2026년 10월'
  payDate: string        // '2026년 11월 5일'
  name: string
  hireDate: string
  pays: SlipLine[]       // 매월 지급
  irregular: SlipLine[]  // 부정기 지급(상여금)
  deductions: SlipLine[]
  grossTotal: number
  dedTotal: number
  net: number
  methods: SlipMethod[]
}

const fmt = (n: number) => n.toLocaleString('ko-KR')
const hrs = (n: number) => `${Math.round(n * 100) / 100}`

/** 지급일: 귀속 달의 다음 달 5일 (노무사 양식 '매월 5일') */
export function payDateOf(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m, 5) // m(1~12)을 0부터 세면 다음 달
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 5일`
}

export function buildSlip(a: {
  month: string; name: string; hireDate: string | null; input: PayInput; r: PayResult
}): Slip {
  const { month, input: p, r } = a
  const [y, m] = month.split('-').map(Number)
  const wt = WORK_TYPES[p.work_type as WorkType] ?? WORK_TYPES['본사']

  // 양식 순서. 기본급·식대·차량유지비·연장수당은 항상, 나머지는 금액이 있을 때만
  const pays: SlipLine[] = [
    { label: '기본급', amount: r.base },
    { label: '식대', amount: r.meal },
    { label: '차량유지비', amount: r.car },
    { label: '연장수당', amount: r.ot },
    ...(r.extraOt ? [{ label: '연장추가수당', amount: r.extraOt }] : []),
    ...(r.position ? [{ label: '직책수당', amount: r.position }] : []),
  ]
  const irregular: SlipLine[] = r.bonus ? [{ label: '상여금', amount: r.bonus }] : []

  const deductions: SlipLine[] = [
    { label: '건강보험', amount: r.health },
    { label: '요양보험', amount: r.care },
    { label: '국민연금', amount: r.pension },
    { label: '고용보험', amount: r.empIns },
    { label: '소득세', amount: r.incomeTax },
    { label: '주민세', amount: r.localTax },
    ...(r.attendance ? [{ label: '근태공제', amount: r.attendance }] : []),
    ...(r.healthAdj ? [{ label: '건강보험정산', amount: r.healthAdj }] : []),
    ...(r.careAdj ? [{ label: '장기요양정산', amount: r.careAdj }] : []),
  ]

  // 계산 방법 — 양식 문구 그대로 (기본급·연장수당·연장추가수당)
  const methods: SlipMethod[] = [{ label: '기본급', how: '통상시급 x 209시간', amount: r.base }]
  if (r.ot) methods.push({ label: '연장수당', how: `통상시급 x ${hrs(wt.inclusiveOt)}시간 x 1.5`, amount: r.ot })
  if (r.extraOt) methods.push({ label: '연장추가수당', how: `통상시급 x ${hrs(r.extraHours)}시간`, amount: r.extraOt })

  return {
    month, monthLabel: `${y}년 ${m}월`, payDate: payDateOf(month),
    name: a.name, hireDate: a.hireDate || '',
    pays, irregular, deductions, grossTotal: r.gross, dedTotal: r.deductions, net: r.net, methods,
  }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** 명세서 한 장 HTML (인라인 스타일 — 인쇄 창·이미지 변환에 그대로 사용, XHTML로도 유효) */
export function slipHtml(s: Slip): string {
  const td = 'border:1px solid #9ca3af;padding:6px 8px;'
  const th = td + 'background:#f3f4f6;font-weight:600;'
  const num = 'text-align:right;font-variant-numeric:tabular-nums;'
  const payRows = [...s.pays.map(l => ({ ...l, kind: '매월' })), ...s.irregular.map(l => ({ ...l, kind: '부정기' }))]
  const rows = Math.max(payRows.length, s.deductions.length)
  let body = ''
  for (let i = 0; i < rows; i++) {
    const p = payRows[i], d = s.deductions[i]
    const firstIrregular = p && p.kind === '부정기' && (i === 0 || payRows[i - 1].kind !== '부정기')
    body += '<tr>' +
      `<td style="${td}color:#6b7280;font-size:11px;">${i === 0 ? '매월 지급' : firstIrregular ? '부정기 지급' : ''}</td>` +
      `<td style="${td}">${p ? esc(p.label) : ''}</td><td style="${td}${num}">${p ? fmt(p.amount) : ''}</td>` +
      `<td style="${td}">${d ? esc(d.label) : ''}</td><td style="${td}${num}">${d ? fmt(d.amount) : ''}</td>` +
      '</tr>'
  }
  const info = (k: string, v: string) => `<td style="${th}width:16%;">${k}</td><td style="${td}">${esc(v)}</td>`
  return `<div style="width:720px;padding:32px;background:#fff;color:#111827;font-family:'Malgun Gothic','Apple SD Gothic Neo','Noto Sans KR',sans-serif;font-size:13px;line-height:1.45;box-sizing:border-box;">` +
    `<div style="text-align:center;font-size:24px;font-weight:700;letter-spacing:12px;margin-bottom:20px;">임금명세서</div>` +
    `<table style="width:100%;border-collapse:collapse;margin-bottom:12px;">` +
    `<tr><td style="${th}width:16%;">회사명</td><td style="${td}" colspan="3">${esc(COMPANY.name)}</td></tr>` +
    `<tr>${info('급여귀속', s.monthLabel)}${info('지급일', s.payDate)}</tr>` +
    `<tr>${info('성명', s.name)}${info('입사일', s.hireDate)}</tr>` +
    `</table>` +
    `<table style="width:100%;border-collapse:collapse;">` +
    `<tr><td style="${th}width:12%;"></td><td style="${th}">임금항목</td><td style="${th}${num}width:18%;">지급금액(원)</td><td style="${th}">공제 항목</td><td style="${th}${num}width:18%;">공제금액(원)</td></tr>` +
    body +
    `<tr><td style="${th}" colspan="2">지급액 계</td><td style="${th}${num}">${fmt(s.grossTotal)}</td><td style="${th}">공제액 계</td><td style="${th}${num}">${fmt(s.dedTotal)}</td></tr>` +
    `<tr><td style="${td}" colspan="3"></td><td style="${th}background:#dcfce7;">실수령액(원)</td><td style="${th}${num}background:#dcfce7;font-size:15px;">${fmt(s.net)}</td></tr>` +
    `</table>` +
    `<div style="font-weight:700;margin:18px 0 6px;">계산 방법</div>` +
    `<table style="width:100%;border-collapse:collapse;">` +
    `<tr><td style="${th}width:18%;">구분</td><td style="${th}">산출식 또는 산출방법</td><td style="${th}${num}width:18%;">지급액(원)</td></tr>` +
    s.methods.map(x => `<tr><td style="${td}">${esc(x.label)}</td><td style="${td}">${esc(x.how)}</td><td style="${td}${num}">${fmt(x.amount)}</td></tr>`).join('') +
    `</table>` +
    `<div style="text-align:center;margin-top:24px;color:#374151;">귀하의 노고에 감사드립니다.</div>` +
    `</div>`
}

export const slipFileName = (s: Slip) => `${s.monthLabel} 임금명세서_${s.name}`

/** 명세서 HTML → PNG (SVG foreignObject로 그려 캔버스 변환, 2배 해상도) */
export async function slipToPng(html: string): Promise<Blob> {
  const holder = document.createElement('div')
  holder.style.cssText = 'position:fixed;left:-10000px;top:0;'
  holder.innerHTML = html
  document.body.appendChild(holder)
  const el = holder.firstElementChild as HTMLElement
  const width = el.offsetWidth, height = el.offsetHeight
  holder.remove()
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml">${html}</div></foreignObject></svg>`
  const img = new Image()
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
  await img.decode()
  const scale = 2
  const canvas = document.createElement('canvas')
  canvas.width = width * scale
  canvas.height = height * scale
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.scale(scale, scale)
  ctx.drawImage(img, 0, 0)
  return new Promise((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error('이미지 변환 실패'))), 'image/png'))
}

/** 여러 명세서를 A4 한 장에 한 명씩 PDF 하나로 */
export async function slipsToPdf(htmls: string[], title: string): Promise<Blob> {
  const { PDFDocument } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  doc.setTitle(title)
  for (const html of htmls) {
    const png = await doc.embedPng(await (await slipToPng(html)).arrayBuffer())
    const page = doc.addPage([595.28, 841.89]) // A4
    const margin = 28
    const w = page.getWidth() - margin * 2
    const hgt = Math.min(png.height * (w / png.width), page.getHeight() - margin * 2)
    const wFit = png.width * (hgt / png.height)
    page.drawImage(png, { x: (page.getWidth() - wFit) / 2, y: page.getHeight() - margin - hgt, width: wFit, height: hgt })
  }
  const bytes = await doc.save()
  const copy = new Uint8Array(bytes.length)
  copy.set(bytes)
  return new Blob([copy.buffer], { type: 'application/pdf' })
}

/** 인쇄 창 — 한 장에 한 명 */
export function printSlips(htmls: string[], title: string) {
  const w = window.open('', '_blank')
  if (!w) return false
  w.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>` +
    `<style>@page{size:A4;margin:10mm}body{margin:0}.pg{display:flex;justify-content:center;page-break-after:always}.pg:last-child{page-break-after:auto}</style>` +
    `</head><body>${htmls.map(h => `<div class="pg">${h}</div>`).join('')}` +
    `<script>window.onload=function(){setTimeout(function(){window.print()},300)}</script></body></html>`,
  )
  w.document.close()
  return true
}

/** 카톡 등으로 보내기(폰 공유 시트) — 안 되면 다운로드 */
export async function shareOrDownload(blob: Blob, filename: string) {
  const file = new File([blob], filename, { type: blob.type })
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: filename })
      return 'shared'
    }
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') return 'cancelled'
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return 'downloaded'
}
