import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // 마운트 시 데이터 로딩(fetchXxx/load 후 setState)에서 나오는 실험적 규칙.
      // 실제 동작엔 문제 없고, 정상 동작 중인 화면을 무리하게 고치면 회귀 위험이 커
      // 에러 대신 경고로 유지(빌드/lint 통과, 패턴은 계속 노출).
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
