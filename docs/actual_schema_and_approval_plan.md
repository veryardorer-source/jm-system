# ⚠️ 실제 운영 DB 구조 & 가입 승인 기능 계획

> 작성: 2026-06-22 · Supabase 프로젝트 `jm-system` (ref: btpgmtuvtkhdifpaynes)

## ‼️ 가장 중요 — 설계 문서 ≠ 실제 DB

`관리시스템/supabase/migrations/0001_schema.sql`, `0002_rls.sql` 및 `ERD.md`에 그려진
스키마(`users`, `customers`, `projects` ...)는 **운영 DB에 적용된 적이 없다.**
(`select from public.users` → `relation "public.users" does not exist` 확인됨)

실제 라이브 앱은 **다른 스키마**로 직접 만들어져 있다. 다음 작업은 반드시 아래 실제 구조 기준으로 한다.

## 실제 운영 DB의 public 테이블 (15개)

```
company_documents, employees, finance_fixed_costs, finance_payroll,
finance_project_profit, finance_sales, notices, profiles,
project_assignments, ... (외 일부)
```
- 설계 문서와 달리 **finance_* 재무 테이블이 실제로 존재**한다 (설계 메모엔 "회계는 외부"였음).

## profiles 테이블 = 권한의 핵심

컬럼: `id`(= auth.users.id), `name`, `role`, `team`

현재 데이터(4명):

| 이메일 | name | role |
|--------|------|------|
| veryardorer@naver.com | 관리자 | `admin` |
| 4woman1207@naver.com | 윤준호 | `admin` |
| interiorlenakwon@gmail.com | 권소현 | `designer` |
| jminterior0611@naver.com | JM건축인테리어 | `field` |

- 실제 사용 역할 값: **`admin`, `designer`, `field`** (설계 문서의 representative/director/... 와 다름)
- **승인/상태(pending) 컬럼 없음** → 지금은 가입 즉시 사용 가능, 승인 절차 없음.
- 가입 시 profiles 행은 자동 생성됨(4명 모두 존재) — 기본 role은 `field`로 보임.

## 원하는 기능: 가입 → 대표 승인 → 사용

### 필요한 작업 (다음 세션, 앱 소스 있는 PC에서)

**① DB (이 PC에서 SQL로 가능, 단 ②와 함께 배포)**
- `profiles`에 상태 컬럼 추가:
  ```sql
  alter table public.profiles
    add column status text not null default 'pending';   -- pending | approved | rejected
  -- 기존 4명은 모두 승인 처리
  update public.profiles set status = 'approved';
  ```
- (선택) RLS로 pending 사용자의 데이터 접근 차단 — 방어선 추가.

**② 앱 (앱 소스 필수 — 이 PC에 없음)**
- 로그인 후 `status = 'pending'`이면 → "대표 승인 대기 중" 화면만 보이고 나머지 차단.
- **관리자(admin) 전용 "직원 승인" 화면**:
  - pending 직원 목록 표시 → [승인] 버튼 + 역할(admin/designer/field)·팀 지정.
  - 승인 시 `status='approved'` + role/team 저장.
- (선택) 거절(rejected) 처리.

### ⚠️ 주의 — 순서
①만 먼저 적용하면(앱에 승인 화면 없는데 pending 차단), **신규 직원이 앱에서 승인받을 길이 없어 오히려 막힌다.**
→ 반드시 ①과 ②를 **같이** 배포할 것. (그 전까지는 현행 유지: 가입=즉시 사용, 역할은 대표가 DB에서 변경)

## 다음에 할 일 체크리스트
- [ ] 앱 소스 확보 (6/17 작업 PC → GitHub push → 이 PC로 clone) — HANDOFF.md 참고
- [ ] 앱 코드에서 profiles 사용/역할 분기 로직 파악
- [ ] 위 ①+② 함께 구현·배포
- [ ] 직원 가입 완료 후 "신규 가입 허용(Allow new users to sign up)" OFF
