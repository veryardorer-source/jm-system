# JM건축인테리어 사내 관리 시스템 PRD

> 최초 작성: 2026-06-18 / 최종 수정: 2026-06-20
> 목적: Jandi(협업툴) + NAS 파일서버 + 경리나라(회계) 대체

---

## 1. 서비스 개요

JM건축인테리어의 현장 관리, 파일 공유, 일정/공정 관리, 공지사항, 영수증 및 출금 요청을 통합 관리하는 사내 전용 웹 시스템.

- **Tech Stack**: Next.js 16 (App Router, TypeScript) + Supabase (PostgreSQL + Storage) + Tailwind CSS
- **배포 URL**: https://jm-interior.vercel.app
- **DB**: Supabase (btpgmtuvtkhdifpaynes)
- **Storage**: Supabase Storage `uploads` 버킷 (PUBLIC)
- **Git**: https://github.com/veryardorer-source/jm-system

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

### 배포
```bash
npx vercel --prod
```

---

## 3. 현재 구현된 기능 (v2.0 — 2026-06-20)

### 3-1. 인증 / 권한
- **로그인**: 이메일 + 비밀번호 (Supabase Auth)
- **미들웨어**: 비로그인 시 `/login`으로 리다이렉트
- **역할(role)**:
  | 역할 | 설명 |
  |------|------|
  | `admin` | 관리자 — 모든 기능 + 직원 관리 |
  | `designer` | 디자인팀 |
  | `field` | 현장팀 |

- **세션**: `@supabase/ssr` createBrowserClient 사용 (쿠키 기반, 미들웨어와 호환)
- **직원 가입**: 관리자가 `/admin/users`에서 직접 계정 생성 (이메일, 임시비밀번호, 권한 설정)
- **관리자 계정**: veryardorer@naver.com

### 3-2. 대시보드 (`/`)
- 전체현장 / 진행중 / 완료 요약 카드
- 직원별 업무 현황
- 진행중인 현장 타임라인 (Gantt형)

### 3-3. 공지사항 (`/notices`)
- 카테고리: 전체 / 디자인팀 / 현장팀
- 제목, 내용, 작성자 입력 / 목록 / 상세 / 삭제

### 3-4. 현장 관리 (`/projects`)
- 현장 목록 (상태별 그룹)
- **현장 상세** (`/projects/[id]`)
  - **자료 탭**
    - 카테고리: 시공전사진 / 시공사진 / 마감사진 / 도면 / 3D / 미팅내용 / 고객요청 / 구매링크 / 사용법 / 기타
    - **구매링크**: URL 직접 입력 (파일 업로드 없음)
    - 사진 카테고리: 썸네일 그리드, 클릭 시 라이트박스
    - **구글 드라이브 스타일 선택**: hover 시 체크박스 표시, 클릭으로 선택
    - 선택 시 하단 플로팅 액션바 (다운로드 / 링크복사 / 삭제)
    - 카테고리별 전체선택 버튼
    - 파일 열기: 이미지→라이트박스, PDF→구글뷰어, 링크→새탭
    - 멀티 파일 업로드 (드래그앤드롭)
  - **공정 탭**: 공정명, 시작일, 종료일, 담당자 / 상태(예정/진행중/완료)

### 3-5. 영수증 (`/receipts`)
- 영수증 사진 갤러리, 메모, 올린 사람 기록

### 3-6. 출금 요청 (`/withdrawals`)
- 출금 요청 사진 갤러리, 사유, 요청자 기록

### 3-7. 직원 관리 (`/admin/users`) — admin 전용
- 직원 계정 생성 (이름, 이메일, 임시비밀번호, 권한)
- 기존 직원 권한 변경 (관리자/디자인팀/현장팀)
- 이름 수정

### 3-8. PWA (모바일 앱 설치)
- 안드로이드: Chrome → ⋮ 메뉴 → 앱 설치
- 아이폰: Safari → 공유(↑) → 홈 화면에 추가
- 아이콘: 회사 로고 (`/public/logo.png` 기반 생성)
- 테마색: 초록 (#16a34a)

---

## 4. DB 테이블 구조

| 테이블 | 주요 컬럼 |
|--------|----------|
| `profiles` | id(uuid, auth.users FK), name, role(admin/designer/field), team |
| `projects` | id, name, client_name, address, status, manager, contract_date, start_date, end_date, memo |
| `project_files` | id, project_id, file_name, file_url, file_type, category, memo, uploaded_by |
| `schedules` | id, project_id, task_name, scheduled_date, end_date, manager, is_done, phase_status |
| `notices` | id, title, content, category, author |
| `receipts` | id, image_url, memo, uploaded_by |
| `withdrawal_requests` | id, image_url, reason, requested_by, status, amount, recipient |

**RLS**: profiles 테이블 비활성화, 나머지 모두 비활성화  
**Storage**: uploads 버킷 — 정책으로 anon 허용

---

## 5. Supabase 설정

- **프로젝트**: btpgmtuvtkhdifpaynes
- **Auth**: 이메일 로그인 활성화, Confirm email OFF
- **SMTP**: Gmail (veryardorer@gmail.com) 앱 비밀번호 설정됨
- **Rate Limits**: 기본값 유지 (sign-ups 30/5min)

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
│   ├── layout.tsx          # PWA 메타, AuthProvider
│   ├── page.tsx            # 대시보드
│   ├── login/page.tsx      # 로그인
│   ├── signup/page.tsx     # 회원가입 (현재 미사용, 관리자가 직접 생성)
│   ├── notices/page.tsx    # 공지사항
│   ├── projects/
│   │   ├── page.tsx        # 현장 목록
│   │   └── [id]/page.tsx   # 현장 상세 (자료+공정)
│   ├── receipts/page.tsx   # 영수증
│   ├── withdrawals/page.tsx # 출금 요청
│   ├── admin/users/page.tsx # 직원 관리 (admin 전용)
│   └── api/admin/create-user/route.ts  # 직원 계정 생성 API
├── components/
│   └── Sidebar.tsx         # 사이드바 + 모바일 탭바
├── lib/
│   ├── supabase.ts         # 기본 supabase client
│   ├── supabase-browser.ts # SSR 브라우저 client (쿠키 기반)
│   └── auth-context.tsx    # AuthProvider, useAuth hook
└── middleware.ts           # 인증 미들웨어
public/
├── logo.png               # 회사 로고
├── manifest.json          # PWA 매니페스트
└── icons/
    ├── icon-192.png       # PWA 아이콘
    ├── icon-512.png       # PWA 아이콘
    └── apple-touch-icon.png # iOS 아이콘
```

---

## 8. 다음 작업 예정

- [ ] 현장별 비용 집계 (자재비/인건비/기타)
- [ ] 출금요청 승인 워크플로우 (관리자 승인/반려)
- [ ] 견적서 관리
- [ ] 고객 연락처 관리
- [ ] 알림 기능 (공정 마감 임박)
