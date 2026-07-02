# JM건축인테리어 사내 관리 시스템 PRD

> 최초 작성: 2026-06-18 / 최종 수정: 2026-06-21
> 목적: Jandi(협업툴) + NAS 파일서버 + 경리나라(회계) 대체

---

## 1. 서비스 개요

JM건축인테리어의 현장 관리, 파일 공유, 일정/공정 관리, 공지사항, 영수증, 출금 요청, 직원정보, 재정관리, 회사 서류 보관을 통합 관리하는 사내 전용 웹 시스템.

- **Tech Stack**: Next.js 16 (App Router, TypeScript) + Supabase (PostgreSQL + Storage) + Tailwind CSS
- **배포 URL**: https://jm-interior.vercel.app
- **DB**: Supabase (btpgmtuvtkhdifpaynes)
- **Storage**: Supabase Storage `uploads` 버킷 (PUBLIC)
- **Git**: https://github.com/veryardorer-source/jm-system
- **PWA**: 모바일 홈 화면 설치 가능 (회사 로고 아이콘)
- **테마 색상**: 초록(green) — 파란색 사용 안 함

---

## 2. 환경 설정

### 로컬 개발 환경
```bash
git clone https://github.com/veryardorer-source/jm-system.git
cd jm-system
npm install
```

`.env.local` 파일 생성 (Supabase → Settings → API에서 확인):
```
NEXT_PUBLIC_SUPABASE_URL=https://btpgmtuvtkhdifpaynes.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=(Supabase anon public key)
SUPABASE_SERVICE_ROLE_KEY=(Supabase service_role secret key)
```

```bash
npm run dev   # 개발 서버
```

### 배포 (jm-system 폴더 안에서 실행)
```bash
npx vercel --prod
```

### 다른 컴퓨터에서 이어서 작업하기
1. `npm install -g @anthropic-ai/claude-code`
2. 위 클론 + `.env.local` 세팅
3. `claude` 실행 → Anthropic 계정 로그인 → `CLAUDE.md`를 자동으로 읽어서 프로젝트 맥락 파악

---

## 3. 현재 구현된 기능 (v3.0 — 2026-06-21)

### 3-1. 인증 / 권한
- **로그인**: 이메일 + 비밀번호 (Supabase Auth)
- **미들웨어**: 비로그인 시 `/login`으로 리다이렉트 (정적 파일/매니페스트는 제외)
- **역할(role)**: `admin`(관리자) / `designer`(디자인팀) / `field`(현장팀)
- **세션**: `@supabase/ssr` createBrowserClient 사용 (쿠키 기반, 미들웨어와 호환)
- **직원 가입**: 관리자가 `/admin/users`에서 직접 계정 생성 (이메일, 임시비밀번호, 권한). service_role key로 RLS 우회
- **관리자 계정**: veryardorer@naver.com

### 3-2. 대시보드 (`/`)
- 전체현장 / 진행중 / 완료 요약 카드
- 직원별 업무 현황
- 진행중인 현장 타임라인 (Gantt형)

### 3-3. 공지사항 (`/notices`)
- 카테고리: 전체 / 디자인팀 / 현장팀
- 프로그램 사용법(모바일 설치 방법 등)도 여기에 작성

### 3-4. 현장 관리 (`/projects`)
- 현장 목록 (상태별 그룹), 검색
- **진행단계 인라인 수정**: 배지 클릭 → 드롭다운(16단계: 상담중~완료)으로 즉시 변경, 위로 열려서 마지막 행도 안 잘림

#### 현장 상세 (`/projects/[id]`)
- **자료 탭**
  - 카테고리: 시공전사진 / 시공사진 / 마감사진 / 도면 / 3D / 미팅내용 / 고객요청 / 구매링크 / 기타
  - **구매링크**: URL 직접 입력 (파일 업로드 없음)
  - 사진 카테고리: 그리드 뷰, **탭하면 바로 선택(체크박스 상시 표시)**, ⛶ 버튼으로 라이트박스
  - 파일 목록: 체크박스 + 파일명 클릭=열기 + 내보내기 + 저장 + 삭제
  - 모든 카테고리에 전체선택 가능
  - **내보내기**: 모바일=Web Share API(카카오톡 등 공유시트), PC=다운로드. AbortError(취소)는 무시, 실패시 다운로드로 폴백
  - **저장**: 직접 다운로드
  - 다중 선택 후 하단 플로팅 바: 내보내기 / 저장 / 삭제
  - 파일 열기: 이미지→라이트박스, PDF→구글뷰어, 링크→새탭
  - 멀티 파일 업로드 (드래그앤드롭)
- **공정 탭**: 공정명, 시작일, 종료일, 담당자 / 상태(예정/진행중/완료)
- **비용 탭**: 항목별 집계 아님 — **월별 자료 업로드 방식**
  - 월 선택 + 총금액 입력 + 경리나라 자료 파일 첨부
  - **월별 비용 추이 막대그래프** 자동 생성
  - 첨부파일 PDF→뷰어, 사진→라이트박스로 바로 확인

### 3-5. 영수증 (`/receipts`)
- 영수증 사진 갤러리, 메모, 올린 사람 기록

### 3-6. 출금 요청 (`/withdrawals`)
- 출금 요청 사진 갤러리, 사유, 요청자 기록
- (예정: 관리자 승인/반려 워크플로우)

### 3-7. 회사 서류 (`/documents`) — 전체 직원 + 관리자 권한 분리
- 모든 직원이 볼 수 있는 회사 서류 보관함
- 분류: 사업자등록 / 보험·안전 / 계약서 양식 / 인사·총무 / 기타
- **서류 추가는 관리자만 가능**
- 서류마다 **공개범위 선택**: "전체공개" 또는 "관리자만"
  - "관리자만"으로 올리면 일반 직원 화면에 노출 안 됨 (카테고리 단위가 아닌 문서별 권한)
- 모든 직원: 내보내기(모바일 공유)/저장(다운로드) 가능
- 관리자: 수정/삭제 가능

### 3-8. 직원 관리 (`/admin/users`) — admin 전용
- 직원 계정 생성 (이름, 이메일, 임시비밀번호, 권한)
- 기존 직원 권한 변경 (관리자/디자인팀/현장팀), 이름 수정

### 3-9. 직원정보내역 (`/admin/employees`) — admin 전용, 민감정보
- **상용직 / 일용직** 구분된 표
- 이름, 주민번호(기본 마스킹·클릭시 전체표시), 부서/분야, 연락처, 입사/퇴사날짜(상용직만), 은행, 계좌번호, 메일, 재직상태
- 추가/수정/삭제, 재직중↔퇴사 토글
- ⚠️ 관리자 권한 없으면 자동으로 메인으로 리다이렉트

### 3-10. 재정관리 (`/admin/finance`) — admin 전용
4개 탭, 각각 월별 입력 + 추이 막대그래프:
- **고정지출**: 임대료/보험료 등 월별 항목. 직접 입력 또는 **엑셀 파일 일괄 업로드**
- **급여내역**: 직원별 월급여. 직접 입력 또는 **엑셀 파일 일괄 업로드**
- **현장별 이익**: 현장 선택 → 월별 매출/비용 입력 → 이익 자동계산, 현장별 필터
- **매출매입**: 매출/매입 구분 + 금액 + 파일첨부. **엑셀 첨부 시 금액 자동 인식**
- **엑셀 분석 로직** (`src/lib/excel-parse.ts`): 헤더에서 라벨 컬럼(이름/직원/품목/항목 등)과 금액 컬럼(금액/합계/공급가액/총액 등) 자동 탐색 → 표 형태로 파싱 → 미리보기에서 수정 가능 → 일괄 저장
  - 인식 실패시 직접 입력으로 폴백

### 3-11. PWA (모바일 앱 설치)
- 안드로이드: Chrome → ⋮ 메뉴 → 앱 설치
- 아이폰: Safari → 공유(↑) → 홈 화면에 추가
- 아이콘: 회사 로고 기반 정적 PNG (`scripts/gen-icons.mjs`로 재생성 가능)
- 테마색: 초록 (#16a34a)

---

## 4. DB 테이블 구조

| 테이블 | 주요 컬럼 |
|--------|----------|
| `profiles` | id(uuid, auth.users FK), name, role(admin/designer/field) |
| `projects` | id, name, client_name, address, status, manager, contract_date, start_date, end_date, memo |
| `project_files` | id, project_id, file_name, file_url, file_type, category, memo, uploaded_by |
| `project_costs` | id, project_id, month, amount, file_url, file_name, memo |
| `schedules` | id, project_id, task_name, scheduled_date, end_date, manager, is_done, phase_status |
| `notices` | id, title, content, category, author |
| `receipts` | id, image_url, memo, uploaded_by |
| `withdrawal_requests` | id, image_url, reason, requested_by, status, amount, recipient |
| `employees` | id, name, resident_number, department, phone, hire_date, resign_date, bank_name, account_number, email, employment_type, is_active, memo |
| `company_documents` | id, title, category, file_url, file_name, visibility(전체공개/관리자만), memo, uploaded_by |
| `finance_fixed_costs` | id, month, title, amount, memo |
| `finance_payroll` | id, month, employee_name, amount, memo |
| `finance_project_profit` | id, project_id, month, revenue, cost, memo |
| `finance_sales` | id, month, type(매출/매입), amount, file_url, file_name, memo |

**RLS**: ⚠️ 아래는 옛 상태였음. **2026-07-02 기준 전체 테이블 RLS 활성화 + 계층형 정책 적용됨** — anon 차단, admin전용(민감/재정), 본인데이터(알림·읽음), 역할별(금전·서류·현장자료), 채팅 참여자 기준, pending 업무데이터 차단. 적용 SQL: `db/rls_sensitive.sql`·`db/rls_notifications.sql`·`db/rls_money.sql`·`db/rls_chat.sql`. 상세·검증쿼리·역할 매트릭스: `../관리시스템/docs/security_status.md`, 요약: `CLAUDE.md`.
**Storage**: `uploads` 버킷 — 현재 public(anon 접근 가능). 계약서·직원자료 등 민감 파일은 **private bucket + signed URL** 전환이 후속 과제(로드맵). 경로 규칙: `files/{project_id}/...`, `costs/{project_id}/...`, `documents/...`, `finance/sales/...`

### 신규 테이블 생성 SQL (아직 안 만들었다면)
> ⚠️ **주의(2026-07-02):** 아래 초기 SQL의 `DISABLE ROW LEVEL SECURITY` 줄은 **더 이상 실행하지 마세요.** 현재는 RLS를 켜고 역할별 정책을 적용한 상태라, 이 줄을 실행하면 보안이 풀립니다. 그래서 아래에서는 주석 처리해 두었습니다. (실제 RLS는 `db/rls_sensitive.sql`·`db/rls_money.sql`·`db/rls_chat.sql`·`db/rls_notifications.sql` 참고)
```sql
-- 회사 서류
CREATE TABLE company_documents (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  category text DEFAULT '기타',
  file_url text DEFAULT '',
  file_name text DEFAULT '',
  visibility text NOT NULL DEFAULT '전체공개',
  memo text DEFAULT '',
  uploaded_by text DEFAULT '',
  created_at timestamptz DEFAULT now()
);
-- (구) ALTER TABLE company_documents DISABLE ROW LEVEL SECURITY;  ← 실행 금지: 현재 RLS 적용됨

-- 재정관리
CREATE TABLE finance_fixed_costs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  month date NOT NULL, title text NOT NULL, amount integer NOT NULL DEFAULT 0,
  memo text DEFAULT '', created_at timestamptz DEFAULT now()
);
CREATE TABLE finance_payroll (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  month date NOT NULL, employee_name text NOT NULL, amount integer NOT NULL DEFAULT 0,
  memo text DEFAULT '', created_at timestamptz DEFAULT now()
);
CREATE TABLE finance_project_profit (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  month date NOT NULL, revenue integer NOT NULL DEFAULT 0, cost integer NOT NULL DEFAULT 0,
  memo text DEFAULT '', created_at timestamptz DEFAULT now()
);
CREATE TABLE finance_sales (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  month date NOT NULL, type text NOT NULL DEFAULT '매출', amount integer NOT NULL DEFAULT 0,
  file_url text DEFAULT '', file_name text DEFAULT '', memo text DEFAULT '',
  created_at timestamptz DEFAULT now()
);
-- (구) finance_* DISABLE ROW LEVEL SECURITY ← 실행 금지: 현재 admin 전용 RLS 적용됨(db/rls_sensitive.sql)

-- 직원정보내역
CREATE TABLE employees (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL, resident_number text DEFAULT '', department text DEFAULT '',
  phone text DEFAULT '', hire_date date, resign_date date,
  bank_name text DEFAULT '', account_number text DEFAULT '', email text DEFAULT '',
  employment_type text NOT NULL DEFAULT '상용직', is_active boolean DEFAULT true,
  memo text DEFAULT '', created_at timestamptz DEFAULT now()
);
-- (구) ALTER TABLE employees DISABLE ROW LEVEL SECURITY;  ← 실행 금지: 현재 admin 전용 RLS 적용됨

-- 현장별 비용(월별 자료)
CREATE TABLE project_costs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  month date NOT NULL, amount integer NOT NULL DEFAULT 0,
  file_url text DEFAULT '', file_name text DEFAULT '', memo text DEFAULT '',
  created_at timestamptz DEFAULT now()
);
-- (구) ALTER TABLE project_costs DISABLE ROW LEVEL SECURITY;  ← 실행 금지: 현재 admin/designer RLS 적용됨(db/rls_money.sql)
```

---

## 5. Supabase 설정

- **프로젝트**: btpgmtuvtkhdifpaynes
- **Auth**: 이메일 로그인 활성화, Confirm email OFF
- **SMTP**: Gmail (veryardorer@gmail.com) 앱 비밀번호 설정됨
- **Rate Limits**: 기본값 유지
- ⚠️ Supabase 대시보드가 크롬 번역기능/확장프로그램과 충돌해서 하얗게 멈추는 경우 있음 → 시크릿 모드 또는 번역기능 끄고 사용

---

## 6. Vercel 환경변수

| 변수명 | 설명 |
|--------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | 관리자 계정 생성용 secret key |

---

## 7. 파일 구조 (주요)

```
src/
├── app/
│   ├── layout.tsx              # PWA 메타, AuthProvider
│   ├── page.tsx                # 대시보드
│   ├── login/page.tsx
│   ├── signup/page.tsx         # 현재 미사용 (관리자가 직접 생성)
│   ├── notices/page.tsx
│   ├── documents/page.tsx      # 회사 서류 (전체+관리자 권한분리)
│   ├── projects/
│   │   ├── page.tsx            # 현장 목록 (진행단계 인라인 수정)
│   │   └── [id]/page.tsx       # 현장 상세 (자료+공정+비용) ← 가장 복잡한 파일
│   ├── receipts/page.tsx
│   ├── withdrawals/page.tsx
│   ├── admin/
│   │   ├── users/page.tsx      # 직원 계정 관리
│   │   ├── employees/page.tsx  # 직원 개인정보 (admin 전용)
│   │   └── finance/page.tsx    # 재정관리 (admin 전용)
│   └── api/admin/create-user/route.ts
├── components/Sidebar.tsx      # 사이드바 + 모바일 탭바 (green-800 배경)
├── lib/
│   ├── supabase.ts             # 타입 + STATUS_LIST 등 상수
│   ├── supabase-browser.ts     # SSR 클라이언트
│   ├── auth-context.tsx        # useAuth hook
│   └── excel-parse.ts          # 엑셀 자동분석 (재정관리에서 사용)
└── middleware.ts
public/
├── logo.png
├── manifest.json
└── icons/
```

---

## 8. 다음 작업 예정

- [ ] 출금요청 승인 워크플로우 (관리자 승인/반려)
- [ ] 견적서 관리
- [ ] 고객 연락처 관리
- [ ] 알림 기능 (공정 마감 임박)
- [ ] SNS AI 초안 작성 (`/api/sns/draft`) — 코드는 구현 완료, Anthropic API 결제(크레딧) 등록 후 활성화 예정. 현재 무료 플랜 크레딧 부족으로 호출 실패 중. 결제 등록 후: ① `.env.local` / Vercel의 `ANTHROPIC_API_KEY` 그대로 사용 가능 ② `SnsTab.tsx`의 "✨ AI 초안 작성" 버튼 동작 테스트만 하면 됨
  - 카테고리 매핑: 디자인 포스팅 = 시공전사진(현장사진)·도면·3D / 시공 포스팅 = 시공사진 / 마감 포스팅 = 마감사진
  - 내용이 풍성해야 할 때(매핑된 카테고리 자료가 4장 미만)는 같은 현장의 다른 자료로 자동 보충

## 9. 알려진 이슈 / 주의사항

- `.env.local`은 절대 git에 커밋하지 말 것 (secret scanning 차단됨)
- Web Share API는 PC 브라우저에서 연속 호출 시 불안정 → PC에서는 자동으로 다운로드로 대체됨 (모바일에서만 공유시트 사용)
- 엑셀 자동분석은 헤더 키워드 매칭 방식이라 경리나라 양식이 특이하면 인식 실패할 수 있음 → 이 경우 직접 입력 사용
- Supabase 대시보드 자체 버그(브라우저 확장 충돌)는 우리 앱과 무관
