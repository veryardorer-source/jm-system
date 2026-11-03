import { defineConfig } from '@playwright/test'

// 운영 DB에 닿지 않는 순수 계산 테스트. E2E 전역 setup/teardown은 사용하지 않는다.
export default defineConfig({
  testDir: './tests/unit',
  testMatch: '*.spec.ts',
  workers: 1,
  reporter: [['list']],
})
