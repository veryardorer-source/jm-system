import { test, expect } from '@playwright/test'
import { retirementNet } from '../../src/lib/retirement-settlement'

test('퇴직금·퇴직연금은 직접 입력한 원천징수액만 빼고 별도 실지급액을 보여준다', () => {
  expect(retirementNet({ amount: 10_000_000, incomeTax: 200_000, localTax: 20_000 }))
    .toBe(10_000_000 - 200_000 - 20_000)
})

test('잘못된 음수·초과 공제를 저장하지 않는다', () => {
  expect(() => retirementNet({ amount: -1, incomeTax: 0, localTax: 0 })).toThrow()
  expect(() => retirementNet({ amount: 100, incomeTax: 101, localTax: 0 })).toThrow()
})
