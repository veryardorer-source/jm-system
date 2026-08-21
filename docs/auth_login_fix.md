# 🔐 로그인 문제 해결 기록 & 권한(역할) 설계 메모

> 최종 업데이트: 2026-06-22

## 1. 무슨 문제였나

회원가입은 되는데 로그인 시 **"이메일 또는 비밀번호가 올바르지 않다"** 오류.

- 원인: Supabase 인증의 **"Confirm email(이메일 인증 필요)" 설정이 켜져 있어서**,
  가입 후 이메일 확인 링크를 누르기 전까지 계정이 "미인증" 상태로 막혀 있었음.
- 미인증 계정은 비밀번호가 맞아도 무조건 "Invalid login credentials"를 반환함.

## 2. 어떻게 해결했나 (2026-06-22)

Supabase 프로젝트: **jm-system** (ref: `btpgmtuvtkhdifpaynes`)

1. **Confirm email 설정 끄기** — Authentication → Sign In / Providers → User Signups
   → "Confirm email" 토글 OFF (저장 완료). 앞으로 가입자는 인증 없이 바로 로그인.
2. **이미 막혀 있던 기존 계정 인증 처리** — SQL Editor에서 실행:
   ```sql
   update auth.users
   set email_confirmed_at = now()
   where email_confirmed_at is null
   returning email, email_confirmed_at;
   ```
   → `interiorlenakwon@gmail.com`, `jminterior0611@naver.com` 두 계정 인증 처리됨.

## 3. "로그인 됨" vs "권한"은 별개 — 권한 구별은 언제?

- **로그인(인증)** = 신원 확인일 뿐, 그 자체로 데이터 권한을 주지 않음.
- **권한**은 `public.users.role` 값으로 결정됨 (대표/이사/디자인/현장/경리).
- 신규 가입자는 **자동으로 `field`(현장팀, 최저 권한)** 로 시작 (`0001_schema.sql`).
- 흐름: **가입 → 로그인 가능(현장팀 권한) → 대표가 역할 지정 → 역할별 권한 부여.**
  RLS가 역할 기준으로 데이터 접근을 막으므로, 로그인이 먼저 돼도 보안 구멍 아님.

## 4. ⚠️ 다음에 점검할 것 (TODO)

- [ ] **가입 시 `public.users` 프로필 행이 자동 생성되는지 확인.**
      현재 DB에 `handle_new_user` 같은 트리거가 없음 (`0001_schema.sql` 기준).
      앱 코드가 가입 시 `users` 행을 안 만들어주면 역할 구분이 작동 안 할 수 있음.
      → 트리거 추가 또는 앱 가입 로직 확인 필요.
- [ ] **"Allow new users to sign up(신규 가입 허용)"** 현재 ON 상태.
      주소만 알면 외부인도 가입 가능. 직원 가입 끝나면 OFF 권장.
- [ ] 대표가 직원 역할을 지정하는 방법(관리 화면 or DB) 정리.
