// 퇴직금/퇴직연금은 월 급여·근로소득세와 별도로 기록한다.
// 세액은 자동 계산하지 않고 노무사/금융기관이 확정한 금액만 직접 입력한다.
export function retirementNet({ amount, incomeTax, localTax }: {
  amount: number; incomeTax: number; localTax: number
}): number {
  if (![amount, incomeTax, localTax].every(n => Number.isSafeInteger(n) && n >= 0)) {
    throw new Error('퇴직 정산 금액은 0원 이상의 정수로 입력해 주세요.')
  }
  if (incomeTax + localTax > amount) {
    throw new Error('원천징수 합계가 퇴직 지급액보다 클 수 없습니다.')
  }
  return amount - incomeTax - localTax
}
