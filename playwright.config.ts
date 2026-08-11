import { defineConfig } from '@playwright/test'

// E2E 테스트 — 로컬 서버(3100)에서 실행. 운영 DB를 쓰되 전용 e2e-* 계정과
// 'E2E_' 접두어 데이터만 만들고, 전역 teardown에서 전부 정리한다.
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // 같은 DB의 같은 테스트 계정을 쓰므로 순차 실행
  workers: 1,
  retries: 1,
  reporter: [['list']],
  globalSetup: './tests/e2e/global.setup.ts',
  globalTeardown: './tests/e2e/global.teardown.ts',
  use: {
    baseURL: 'http://localhost:3100',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run build && npx next start -p 3100',
    url: 'http://localhost:3100/login',
    reuseExistingServer: true,
    timeout: 180_000,
  },
})
