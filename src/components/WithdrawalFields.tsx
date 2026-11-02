'use client'

// 출금 요청 — 카톡 글에서 찾은 금액·받는 분·계좌·날짜를 칸으로 보여주고 고치게 하는 묶음
// 자동으로 채운 값은 사람이 고치기 전까지만 다시 인식에 따라 바뀐다(고친 값은 그대로 둠).
import { useEffect, useMemo, useRef } from 'react'
import { toast } from '@/components/Toaster'
import { parseWithdrawalText, formatWon, parseWonInput } from '@/lib/withdrawal-parse'

export type WithdrawalInfo = { amount: number; recipient: string; bank_account: string }
export const EMPTY_INFO: WithdrawalInfo = { amount: 0, recipient: '', bank_account: '' }

const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500'

export default function WithdrawalFields({ text, value, onChange, auto = true }: {
  text: string
  value: WithdrawalInfo
  onChange: (v: WithdrawalInfo) => void
  auto?: boolean   // false: 기존 건 수정 화면 — 자동 채움 없이 후보만 보여줌
}) {
  const guess = useMemo(() => parseWithdrawalText(text), [text])
  // 사람이 손댄 칸(입력·지움·후보 선택) — 이후 글이 바뀌어도 자동으로 덮어쓰지 않는다
  const touched = useRef<Record<keyof WithdrawalInfo, boolean>>({ amount: false, recipient: false, bank_account: false })
  const set = <K extends keyof WithdrawalInfo>(k: K, v: WithdrawalInfo[K]) => {
    touched.current[k] = true
    onChange({ ...value, [k]: v })
  }

  useEffect(() => {
    if (!auto) return
    const cur = value   // 글이 바뀐 그 렌더의 칸 값
    const t = touched.current
    const next = { ...cur }
    if (!t.amount) next.amount = guess.amount || 0
    if (!t.recipient) next.recipient = guess.recipient
    if (!t.bank_account) next.bank_account = guess.bankAccount
    if (next.amount !== cur.amount || next.recipient !== cur.recipient || next.bank_account !== cur.bank_account) onChange(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guess, auto])

  const found = !!(guess.candidates.length || guess.recipient || guess.bankAccount || guess.dates.length)

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-700">💰 출금 정보</p>
        {found && <span className="text-[11px] text-green-700">✨ 글에서 찾아 채웠어요 · 확인해 주세요</span>}
      </div>

      {guess.dates.length > 0 && (
        <div className="text-xs text-gray-600">
          <span className="text-gray-400 mr-1">날짜</span>
          {guess.dates.join(', ')}{guess.days ? ` (${guess.days}일)` : ''}
        </div>
      )}

      <div>
        <label className="text-xs text-gray-500 block mb-1">금액</label>
        <div className="relative">
          <input inputMode="numeric" value={value.amount ? value.amount.toLocaleString('ko-KR') : ''}
            onChange={e => set('amount', parseWonInput(e.target.value))}
            placeholder="예) 600,000" className={inputCls + ' pr-8'} />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">원</span>
        </div>
        {guess.amountNote && value.amount === guess.amount && (
          <p className="text-[11px] text-green-700 mt-1">{guess.amountNote}</p>
        )}
        {guess.candidates.length > 0 && !(guess.candidates.length === 1 && value.amount === guess.candidates[0]) && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            <span className="text-[11px] text-gray-400 self-center">글 속 금액:</span>
            {guess.candidates.slice(0, 8).map(n => (
              <button key={n} type="button" onClick={() => set('amount', n)}
                className={`text-[11px] px-2 py-0.5 rounded-full border ${value.amount === n ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-300 hover:border-green-400'}`}>
                {formatWon(n)}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.6fr] gap-2">
        <div>
          <label className="text-xs text-gray-500 block mb-1">받는 분(예금주)</label>
          <input value={value.recipient} onChange={e => set('recipient', e.target.value)}
            placeholder="예금주 이름" className={inputCls} />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">은행 · 계좌</label>
          <input value={value.bank_account} onChange={e => set('bank_account', e.target.value)}
            placeholder="예) 국민 123456-01-234567" className={inputCls} />
        </div>
      </div>
    </div>
  )
}

// 📋 버튼 — 카톡에서 '복사'한 글을 사유 칸 끝에 이어 붙인다 (여러 메시지를 하나씩 복사해 계속 누르면 쌓임)
export function PasteTextButton({ onText }: { onText: (t: string) => void }) {
  async function paste() {
    try {
      if (!navigator.clipboard?.readText) throw new Error('unsupported')
      const t = (await navigator.clipboard.readText()).trim()
      if (!t) { toast('복사된 글이 없어요. 카톡에서 메시지를 길게 눌러 ‘복사’한 뒤 눌러주세요.', 'error'); return }
      onText(t)
      toast('글을 붙였어요. 더 있으면 다음 메시지를 복사해서 또 누르세요.', 'ok')
    } catch {
      toast('붙여넣기를 못 했어요. 칸을 길게 눌러 ‘붙여넣기’ 해 주세요.', 'error')
    }
  }
  return (
    <button type="button" onClick={paste}
      className="text-xs text-green-700 font-medium border border-green-300 bg-green-50 rounded-full px-2.5 py-1 hover:bg-green-100">
      📋 복사한 글 붙이기
    </button>
  )
}

export const appendText = (prev: string, t: string) => (prev.trim() ? `${prev.replace(/\s+$/, '')}\n${t}` : t)
