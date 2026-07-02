// 견적 계산 로직 — 기존 견적서(갑지) 계산식을 그대로 재현
// 검증 근거: 2024~2026 견적서 90건 분석 (고용·산재보험=노무비 기준, 일반관리비·이윤=직접공사비 기준)

export type EstimateItem = {
  name: string   // 품명
  spec: string   // 규격
  unit: string   // 단위 (EA, M2, 식, 인 ...)
  qty: number    // 수량
  mat: number    // 재료비 단가
  lab: number    // 노무비 단가
  exp: number    // 경비 단가
}

export type EstimateSection = {
  name: string   // 공종명 (가설작업, 목작업 ...)
  items: EstimateItem[]
}

export type EstimateRates = {
  employ: number      // 고용보험 (노무비 기준) 기본 0.0101
  accident: number    // 산재보험 (노무비 기준) 기본 0.0356
  mgmt: number        // 일반관리비 (직접공사비 기준) 기본 0.05
  profit: number      // 이윤 (직접공사비 기준) 기본 0.10
  vat: number         // 부가세 기본 0.10
  safety_amt: number  // 산업안전보건관리비 (금액 직접 입력, 0=미적용)
}

export type Estimate = {
  id: string
  title: string
  work_name: string | null
  customer: string | null
  category: string | null
  area_py: number | null
  status: string
  est_date: string
  note: string | null
  project_id: string | null
  sections: EstimateSection[]
  rates: EstimateRates
  nego: number
  created_at: string
  updated_at: string
}

export const DEFAULT_RATES: EstimateRates = {
  employ: 0.0101, accident: 0.0356, mgmt: 0.05, profit: 0.10, vat: 0.10, safety_amt: 0,
}

export const TRADE_PRESETS = [
  '가설작업', '철거작업', '목작업', '전기, 통신작업', '조명', '소방작업', '설비작업',
  '도장작업', '필름작업', '도배작업', '바닥작업', '타일작업', '데코타일작업',
  '금속, 창호작업', '유리작업', '가구', '싸인작업', '냉난방기', '기타작업',
]

export const CATEGORY_LIST = ['학원/교습소', '뷰티/미용', '사무실', '식음료', '주거', '상업/기타', '부분공사']

export const STATUS_LIST = ['작성중', '제출', '계약', '완료'] as const

export const UNIT_LIST = ['식', 'EA', 'M2', 'M', 'SET', '인', 'BOX', '롤', '개소']

// 개략견적용 업종별 평당가 (VAT 포함, 2024~2026 실적 중앙값·범위) — 손익표 분석 리포트 기준
export const PY_PRICE_STATS: Record<string, { median: number; min: number; max: number }> = {
  '뷰티/미용':   { median: 2_270_000, min: 1_490_000, max: 3_260_000 },
  '식음료':     { median: 1_600_000, min: 570_000, max: 4_510_000 },
  '상업/기타':   { median: 1_500_000, min: 530_000, max: 2_710_000 },
  '사무실':     { median: 1_470_000, min: 560_000, max: 3_890_000 },
  '학원/교습소': { median: 1_380_000, min: 590_000, max: 2_230_000 },
}

// ── 금액 계산 ──────────────────────────────────────────────

export function itemAmounts(it: EstimateItem) {
  const mat = Math.round((it.mat || 0) * (it.qty || 0))
  const lab = Math.round((it.lab || 0) * (it.qty || 0))
  const exp = Math.round((it.exp || 0) * (it.qty || 0))
  return { mat, lab, exp, total: mat + lab + exp }
}

export function sectionSubtotal(sec: EstimateSection) {
  return sec.items.reduce(
    (s, it) => {
      const a = itemAmounts(it)
      return { mat: s.mat + a.mat, lab: s.lab + a.lab, exp: s.exp + a.exp, total: s.total + a.total }
    },
    { mat: 0, lab: 0, exp: 0, total: 0 },
  )
}

export type GapjiCalc = {
  directMat: number; directLab: number; directExp: number; direct: number   // 직접공사비
  employ: number; accident: number; mgmt: number; profit: number; safety: number
  indirect: number                        // 간접공사비계
  grossBeforeCut: number; gross: number   // 절사 전/후 총공사비
  nego: number; grossFinal: number        // 네고 반영 최종 총공사비
  vat: number; grandTotal: number         // 부가세, 합계
}

export function calcGapji(sections: EstimateSection[], rates: EstimateRates, nego: number): GapjiCalc {
  const d = sections.reduce(
    (s, sec) => {
      const t = sectionSubtotal(sec)
      return { mat: s.mat + t.mat, lab: s.lab + t.lab, exp: s.exp + t.exp }
    },
    { mat: 0, lab: 0, exp: 0 },
  )
  const direct = d.mat + d.lab + d.exp
  const employ = d.lab * (rates.employ || 0)      // 고용보험: 노무비 기준
  const accident = d.lab * (rates.accident || 0)  // 산재보험: 노무비 기준
  const mgmt = direct * (rates.mgmt || 0)         // 일반관리비: 직접공사비 기준
  const profit = direct * (rates.profit || 0)     // 이윤: 직접공사비 기준
  const safety = rates.safety_amt || 0            // 산업안전보건관리비: 직접 입력
  const indirect = employ + accident + mgmt + profit + safety
  const grossBeforeCut = direct + indirect
  const gross = Math.floor(grossBeforeCut / 1000) * 1000  // 천단위 절사
  const grossFinal = gross + (nego || 0)
  const vat = Math.round(grossFinal * (rates.vat || 0))
  return {
    directMat: d.mat, directLab: d.lab, directExp: d.exp, direct,
    employ, accident, mgmt, profit, safety, indirect,
    grossBeforeCut, gross, nego: nego || 0, grossFinal, vat,
    grandTotal: grossFinal + vat,
  }
}

// ── 한글 금액 (일금 오천삼백일십일만구천 원정) ───────────────

const KO_DIGIT = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구']
const KO_SMALL = ['', '십', '백', '천']
const KO_BIG = ['', '만', '억', '조']

export function toKoreanAmount(n: number): string {
  if (!n || n <= 0) return '일금 영 원정'
  let num = Math.floor(n)
  const groups: number[] = []
  while (num > 0) { groups.push(num % 10000); num = Math.floor(num / 10000) }
  let out = ''
  for (let g = groups.length - 1; g >= 0; g--) {
    const v = groups[g]
    if (!v) continue
    let part = ''
    const digits = String(v).padStart(4, '0').split('').map(Number)
    for (let i = 0; i < 4; i++) {
      const d = digits[i]
      if (!d) continue
      part += KO_DIGIT[d] + KO_SMALL[3 - i]
    }
    out += part + KO_BIG[g]
  }
  return `일금 ${out} 원정`
}

export function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return ''
  return Math.round(n).toLocaleString('ko-KR')
}

export const EMPTY_ITEM: EstimateItem = { name: '', spec: '', unit: 'EA', qty: 1, mat: 0, lab: 0, exp: 0 }

export function newSection(name: string): EstimateSection {
  return { name, items: [{ ...EMPTY_ITEM }] }
}
