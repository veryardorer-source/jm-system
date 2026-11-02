// 출금 요청 글(카톡 붙여넣기)에서 금액·받는 분·계좌·날짜를 찾아 칸 채우기 제안
// - 확실할 때만 금액을 채운다: '합계/총/금액' 표시, '하루 OO원씩 N일', 금액이 하나뿐일 때.
//   그 외엔 비워 두고 찾은 금액 후보를 보여줘 사람이 고르게 한다(계산 방식 확정은 대표 몫).
// - 전화번호·주민번호는 금액/계좌로 오인하지 않도록 먼저 가린다.

export type WithdrawalGuess = {
  amount: number | null           // 채울 금액(확실할 때만)
  amountNote: string              // 어떻게 찾았는지 (예: '하루 200,000원 × 3일')
  candidates: number[]            // 글에 나온 금액 후보(중복 제거, 나온 순서)
  recipient: string               // 받는 분(예금주)
  bankAccount: string             // 은행 + 계좌번호
  dates: string[]                 // 날짜 표시용 (예: '10월 8~9일', '29·30·31일')
  days: number | null             // 일수(명시된 경우)
}

const BANKS = [
  '카카오뱅크', '토스뱅크', '케이뱅크', '새마을금고', '새마을', '우체국', '농협', '축협', '수협', '신협',
  '국민', 'KB', '신한', '우리', '하나', '기업', 'IBK', 'NH', 'SC제일', '제일', '부산', '경남', '대구',
  '광주', '전북', '제주', '씨티', '산업', '카카오', '토스', '저축은행',
]
const BANK_RE = new RegExp(`(${BANKS.join('|')})(?:은행)?`)
const STOP_NAMES = new Set([
  ...BANKS, '은행', '계좌', '예금주', '통장', '입금', '송금', '이체', '금액', '합계', '일용직', '인건비', '노무비',
  '감사합니다', '올려주세요', '해주세요', '부탁', '드립니다', '입니다', '확인', '계산서', '발행', '식대', '자재비',
  '사본', '사진', '만원', '천원', '원씩', '번호', '정보', '보냅니다', '보내요', '오늘', '내일', '어제',
])

// 숫자 + 단위 → 원
function toWon(num: string, unit: string): number | null {
  const u = unit.replace(/\s/g, '')
  const hasSep = /\d[,.]\d{3}(?!\d)/.test(num)
  const n = hasSep ? Number(num.replace(/[,.]/g, '')) : Number(num)
  if (!isFinite(n) || n <= 0) return null
  if (u.startsWith('만')) {
    const extra = u.match(/만(\d{1,4})천/)
    return Math.round(n * 10000 + (extra ? Number(extra[1]) * 1000 : 0))
  }
  if (u.startsWith('천')) return Math.round(n * 1000)
  if (u === '원') return n >= 100 ? Math.round(n) : null
  // 단위 없음: 천 단위 구분이 있거나 5자리 이상 숫자만 금액으로 본다
  if (hasSep || (/^\d{5,9}$/.test(num) && n >= 10000)) return Math.round(n)
  return null
}

const AMT = String.raw`(\d{1,3}(?:[,.]\d{3})+|\d+(?:\.\d+)?)\s*(만\s*(?:\d{1,4}\s*천)?\s*원?|천\s*원?|원)?`

function mask(text: string): string {
  return text
    .replace(/\d{6}\s?-\s?[1-4]\d{6}/g, m => '#'.repeat(m.length))                         // 주민번호
    .replace(/01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}/g, m => '#'.repeat(m.length))            // 휴대폰
}

type Account = { bank: string; account: string; start: number; end: number; lineNo: number }

// 계좌: 은행명(또는 '계좌') 뒤 숫자 묶음. 뒤에 붙은 금액(…234567 20만원)은 떼어낸다.
function findAccount(text: string): Account | null {
  const lines = text.split(/\n/)
  let offset = 0
  for (let lineNo = 0; lineNo < lines.length; lineNo++) {
    const line = lines[lineNo]
    const heads = [
      new RegExp(String.raw`${BANK_RE.source}\s*[:\-]?\s*(?:계좌(?:번호)?\s*[:\-]?\s*)?(?=\d)`, 'g'),
      /계좌(?:번호)?\s*[:\-]?\s*(?=\d)/g,
    ]
    for (const [hi, head] of heads.entries()) {
      let h: RegExpExecArray | null
      while ((h = head.exec(line))) {
        const from = h.index + h[0].length
        // 숫자 조각들(구분: 하이픈 또는 공백 1~3칸)
        const run = line.slice(from).match(/^\d+(?:(?:[ \t]*-[ \t]*|[ \t]{1,3})\d+)*/)
        if (!run) continue
        const parts = [...run[0].matchAll(/\d+/g)]
        // 긴 것부터 줄여가며 10~16자리 + 바로 뒤가 금액 단위가 아닌 것을 고른다
        for (let k = parts.length; k >= 1; k--) {
          const last = parts[k - 1]
          const len = (last.index || 0) + last[0].length
          const acc = run[0].slice(0, len)
          const digits = acc.replace(/\D/g, '').length
          const after = line.slice(from + len)
          if (digits < 10 || digits > 16) continue
          if (/^\s*(?:만|천|원)/.test(after)) continue
          const b = hi === 0 ? (h[1] === '카카오' ? '카카오뱅크' : h[1] === '토스' ? '토스뱅크' : h[1]) : ''
          return { bank: b, account: acc, start: offset + from, end: offset + from + len, lineNo }
        }
      }
    }
    offset += line.length + 1
  }
  return null
}

function isName(w: string) {
  return /^[가-힣]{2,4}$/.test(w) && !STOP_NAMES.has(w) && !BANKS.some(b => w.startsWith(b)) && !/(월|씩|님|요|다|비|니다)$/.test(w)
}

function findRecipient(text: string, acc: Account | null): string {
  const labeled = text.match(/(?:예금주|받는\s*분|받는\s*사람|입금자|통장)\s*[:\-]?\s*([가-힣]{2,4}?)(?=님|씨|[^가-힣]|$)/)
  if (labeled && isName(labeled[1])) return labeled[1]
  if (!acc) return ''
  const lines = text.split(/\n/)
  // 계좌가 적힌 줄의 이름 (박지숙. 카카오뱅크 3333… / 기업 177-… 진영수)
  const words = (lines[acc.lineNo] || '').replace(/[^가-힣\s]/g, ' ').split(/\s+/).filter(isName)
  if (words.length) return words[0]
  // 계좌 바로 앞·뒤 줄이 이름 하나뿐이면
  for (const j of [acc.lineNo - 1, acc.lineNo + 1]) {
    const l = (lines[j] || '').replace(/[.*·\s]/g, '').replace(/(님|씨)$/, '')
    if (isName(l)) return l
  }
  return ''
}

function findDates(text: string): { dates: string[]; days: number | null } {
  const dates: string[] = []
  const re = /(\d{1,2})\s*월\s*(\d{1,2})(?:\s*[~\-]\s*(\d{1,2}))?\s*일/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) dates.push(m[3] ? `${m[1]}월 ${m[2]}~${m[3]}일` : `${m[1]}월 ${m[2]}일`)
  // '날짜 29 30 31' / '날자29, 30, 31일'
  const list = text.match(/(?:날짜|날자|일자|작업일)[ \t]*[:\-]?[ \t]*((?:\d{1,2}[ \t]*(?:일)?[ \t]*[,.·][ \t]*|\d{1,2}[ \t]+)+\d{1,2})/)
  let listed: string[] = []
  if (list) {
    listed = list[1].match(/\d{1,2}/g) || []
    if (listed.length) dates.push(listed.join('·') + '일')
  }
  // 일수: 'N일로 / N일간 / N일 동안' — '10월 8일'처럼 날짜인 것과 나열한 날짜의 끝 숫자는 제외
  let days: number | null = null
  const dre = /(?<!월\s*)(?<![\d~\-])(\d{1,2})\s*일\s*(?:로|간|동안|치|분)/g
  while ((m = dre.exec(text))) {
    const before = text.slice(Math.max(0, m.index - 3), m.index)
    if (/[~\-]\s*$/.test(before)) continue
    if (listed.length && m[1] === listed[listed.length - 1] && text.slice(0, m.index).trimEnd().match(/\d$/)) continue
    days = Number(m[1]); break
  }
  if (days == null && listed.length > 1) days = listed.length
  return { dates: [...new Set(dates)], days }
}

export function parseWithdrawalText(raw: string): WithdrawalGuess {
  const text = (raw || '').replace(/\r/g, '')
  const masked = mask(text)
  const acc = findAccount(masked)
  // 계좌 숫자도 금액 후보에서 빼기 (찾은 위치 그대로 가림)
  const noAcc = acc ? masked.slice(0, acc.start) + '#'.repeat(acc.end - acc.start) + masked.slice(acc.end) : masked

  const all: number[] = []          // 나온 횟수 그대로
  const amtRe = new RegExp(AMT, 'g')
  let m: RegExpExecArray | null
  while ((m = amtRe.exec(noAcc))) {
    // 날짜(10월 8일)·호수·일수 뒤 숫자는 제외
    const after = noAcc.slice(m.index + m[0].length, m.index + m[0].length + 1)
    if (!m[2] && /[월일호층명개장시분]/.test(after)) continue
    const won = toWon(m[1], m[2] || '')
    if (won) all.push(won)
  }
  const candidates = [...new Set(all)]

  const { dates, days } = findDates(noAcc)
  let amount: number | null = null
  let amountNote = ''

  // 1) 합계·총액 표시(가장 확실) → 없으면 '합/금액'이 글의 마지막 금액일 때만
  //    (예: '합 685,000원' 뒤에 사람별 금액이 더 나오면 한 사람 몫일 수 있어 채우지 않는다)
  const lastLabeled = (labels: string) => {
    const re = new RegExp(String.raw`(?:${labels})\s*[:=]?\s*` + AMT, 'g')
    let hit: RegExpExecArray | null = null
    while ((m = re.exec(noAcc))) { if (toWon(m[1], m[2] || '')) hit = m }
    return hit
  }
  const strong = lastLabeled(String.raw`합\s*계|총\s*액|총\s*금액|총\s*합|총`)
  if (strong) { amount = toWon(strong[1], strong[2] || ''); amountNote = '글의 합계·총액 표시' }
  else {
    const weak = lastLabeled('합|금액|계')
    const v = weak ? toWon(weak[1], weak[2] || '') : null
    if (v && all[all.length - 1] === v) { amount = v; amountNote = '글의 금액 표시' }
  }

  // 2) 하루 OO원씩 × N일 (금액이 일당 하나뿐일 때만)
  if (amount == null && all.length === 1) {
    const rate = noAcc.match(new RegExp(String.raw`(?:하루|일당|1일)\s*` + AMT + String.raw`\s*씩?`))
    const r = rate ? toWon(rate[1], rate[2] || '') : null
    if (r && days) { amount = r * days; amountNote = `하루 ${r.toLocaleString('ko-KR')}원 × ${days}일` }
  }

  // 3) 금액이 딱 한 번 나옴
  if (amount == null && all.length === 1) { amount = all[0]; amountNote = '글에 나온 금액' }

  return {
    amount, amountNote, candidates,
    recipient: findRecipient(noAcc, acc),
    bankAccount: acc ? `${acc.bank} ${acc.account.replace(/\s+/g, ' ')}`.trim() : '',
    dates, days,
  }
}

// 알림 본문용 — 금액·계좌 등 숫자가 든 말은 빼고 40자까지 (알림에 금액을 싣지 않는 원칙)
export function notifySafeText(raw: string): string {
  return (raw || '').split(/\s+/).filter(w => w && !/\d/.test(w)).join(' ').slice(0, 40)
}

export const formatWon = (n: number | null | undefined) => (n ? `${n.toLocaleString('ko-KR')}원` : '')
export const parseWonInput = (s: string) => {
  const n = Number(String(s).replace(/[^\d]/g, ''))
  return isFinite(n) ? n : 0
}
