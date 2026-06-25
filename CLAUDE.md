# JM건축인테리어 사내 관리 시스템 — Claude 작업 컨텍스트

## 프로젝트 개요
- **서비스명**: JM 관리 시스템
- **배포 URL**: https://jm-interior.vercel.app
- **GitHub**: https://github.com/veryardorer-source/jm-system
- **Supabase 프로젝트**: btpgmtuvtkhdifpaynes
- **Tech Stack**: Next.js 16 (App Router, TypeScript) + Supabase + Tailwind CSS

## 로컬 개발 환경 세팅
```bash
git clone https://github.com/veryardorer-source/jm-system.git
cd jm-system
npm install
```

`.env.local` 파일 생성 (Supabase → Settings → API에서 확인):
```
NEXT_PUBLIC_SUPABASE_URL=https://btpgmtuvtkhdifpaynes.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=(anon key)
SUPABASE_SERVICE_ROLE_KEY=(service role key)
```

```bash
npm run dev    # 개발 서버
npx vercel --prod  # 배포 (jm-system 폴더에서 실행)
```

## 관리자 계정
- 이메일: veryardorer@naver.com
- Supabase Auth에서 직접 관리

## 주요 설계 결정사항

### 인증
- `@supabase/ssr` createBrowserClient 사용 (쿠키 기반)
- 미들웨어에서 인증 처리, public paths: `/login`, `/signup`
- 직원 가입은 관리자가 `/admin/users`에서 직접 생성
- 역할: `admin`, `designer`, `field`
- **RLS 활성화됨(2026-06-22)**: 전체 public 테이블 RLS ON + `authenticated`만 허용(anon 차단). 데이터 클라이언트는 `lib/supabase.ts`의 `createBrowserClient`(쿠키 세션 공유)라 로그인 사용자로 요청됨. 적용 SQL: `db/security_and_realtime.sql`

### 색상 테마
- **전체 테마: 초록(green)**
- 사이드바 배경: `bg-green-800`
- 활성 메뉴: `bg-green-600`
- 버튼: `bg-green-600`
- 파란색(blue)은 사용 안 함

### 파일/자료 관리 (`/projects/[id]`)
- 카테고리: 시공전사진 / 시공사진 / 마감사진 / 도면 / 3D / 미팅내용 / 고객요청 / 구매링크 / 기타
- 사진 카테고리: 그리드 뷰, 탭하면 선택(체크박스), ⛶ 버튼으로 라이트박스
- 파일 목록: 체크박스 + 파일명 클릭=열기 + 내보내기 + 저장 + 삭제
- 구매링크: URL 직접 입력 (파일 업로드 없음)
- **내보내기**: 모바일=Web Share API(카카오톡 등), PC=다운로드
- **저장**: 직접 다운로드
- 다중 선택 후 하단 플로팅 바: 내보내기 / 저장 / 삭제

### 현장 목록 (`/projects`)
- 진행단계 배지 클릭 → 드롭다운으로 즉시 변경 (위로 열림)
- STATUS_LIST: 상담중 → 현장실측 → 디자인중 → ... → 완료 (16단계)

### PWA
- manifest.json, icons/icon-192.png, icons/icon-512.png, icons/apple-touch-icon.png
- 테마색: #16a34a (초록)
- 아이콘: 회사 로고 기반 (scripts/gen-icons.mjs로 재생성 가능)

### 직원 관리 API
- `/api/admin/create-user`: service_role key로 Supabase auth.admin.createUser 호출
- 일반 클라이언트로 생성 불가 (RLS 우회 필요)

## 파일 구조 (핵심)
```
src/
├── app/
│   ├── layout.tsx              # PWA 메타데이터
│   ├── page.tsx                # 대시보드
│   ├── login/page.tsx
│   ├── projects/
│   │   ├── page.tsx            # 현장 목록 (진행단계 인라인 수정)
│   │   └── [id]/page.tsx       # 현장 상세 (자료+공정) ← 가장 복잡한 파일
│   ├── admin/users/page.tsx    # 직원 관리 (admin 전용)
│   └── api/admin/create-user/route.ts
├── components/Sidebar.tsx      # 사이드바 + 모바일 탭바 (green-800 배경)
├── lib/
│   ├── supabase.ts             # STATUS_LIST, STATUS_COLOR 등 상수 포함
│   ├── supabase-browser.ts     # SSR 클라이언트
│   └── auth-context.tsx        # useAuth hook
└── middleware.ts
public/
├── logo.png                    # 회사 로고 (JM Architecture Interior)
├── manifest.json
└── icons/
```

## DB 테이블
| 테이블 | 주요 컬럼 |
|--------|----------|
| `profiles` | id, name, role(admin/designer/field) |
| `projects` | id, name, client_name, address, status, manager, start_date, end_date |
| `project_files` | id, project_id, file_name, file_url, file_type, category, memo |
| `schedules` | id, project_id, task_name, scheduled_date, end_date, manager, phase_status |
| `notices` | id, title, content, category, author |
| `receipts` | id, image_url, memo, uploaded_by |
| `withdrawal_requests` | id, image_url, reason, requested_by, status, amount |

## 다음 작업 예정
- [ ] 현장별 비용 집계 (자재비/인건비/기타) — project_costs 테이블 필요
- [ ] 출금요청 승인 워크플로우 (관리자 승인/반려)
- [ ] 견적서 관리
- [ ] 고객 연락처 관리

## 주의사항
- `.env.local`은 절대 git에 커밋하지 말 것 (secret scanning 차단됨)
- Vercel 배포는 반드시 `jm-system` 폴더 안에서 실행
- Next.js 16 (Turbopack) — 일부 API가 이전 버전과 다를 수 있음
- Supabase Storage 버킷명: `uploads` (PUBLIC)
