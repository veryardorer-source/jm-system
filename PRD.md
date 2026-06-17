# JM건축인테리어 사내 관리 시스템 PRD

> 최초 작성: 2026-06-18 / 최종 수정: 2026-06-18  
> 목적: Jandi(협업툴) + NAS 파일서버 + 경리나라(회계) 대체

---

## 1. 서비스 개요

JM건축인테리어의 현장 관리, 파일 공유, 일정/공정 관리, 공지사항, 영수증 및 출금 요청을 통합 관리하는 사내 전용 웹 시스템.

- **Tech Stack**: Next.js 16 (App Router) + Supabase (PostgreSQL + Storage) + Tailwind CSS
- **배포 URL**: https://jm-interior.vercel.app
- **DB**: Supabase (btpgmtuvtkhdifpaynes)
- **Storage**: Supabase Storage `uploads` 버킷 (PUBLIC)
- **Git**: https://github.com/veryardorer-source/JM

---

## 2. 현재 구현된 기능 (v1.1 — 2026-06-18)

### 2-1. 대시보드 (`/`)
- 전체현장 / 진행중 / 완료 요약 카드
- 직원별 업무 현황 (담당 현장 + 공정 담당, 완료 제외)
- 진행중인 현장 타임라인 (Gantt형)
  - 오늘 기준 -14일 ~ +42일 범위 (18px/일)
  - 공정 상태별 색상: 예정(하늘), 진행중(파랑), 완료(초록)
  - 바 클릭 → 상태 변경 팝업
  - 범례 표시

### 2-2. 공지사항 (`/notices`)
- 카테고리: 전체 / 디자인팀 / 현장팀
- 제목, 내용, 작성자 입력
- 목록 보기 / 상세 보기 / 삭제
- 카테고리별 색상 구분

### 2-3. 현장 관리 (`/projects`)
- 현장 목록 (상태별 그룹: 디자인/견적·계약/시공/완료)
- 현장 상세 (`/projects/[id]`)
  - **자료 탭**
    - 카테고리: 시공전사진 / 시공사진 / 마감사진 / 도면 / 3D / 미팅내용 / 고객요청 / 구매링크 / 기타
    - 카테고리별 토글 (기본 접힘 → 클릭해서 펼치기)
    - 사진 카테고리: 6열 썸네일 그리드, 클릭 시 라이트박스(전체화면)
    - 기타 파일: 리스트형, 열기/링크복사/삭제
    - 멀티 파일 업로드 (드래그앤드롭)
    - **사진 선택 모드**: 카테고리 전체선택/해제, 개별 선택
      - N장 다운로드 (기기에 직접 저장)
      - N장 링크복사 (파일명+URL, 카카오톡 공유용)
      - N장 삭제
  - **공정 탭**
    - 공정명, 시작일, 종료일, 담당자 입력
    - 상태 변경: 예정 / 진행중 / 완료

### 2-4. 영수증 (`/receipts`)
- 회사 전체 영수증 사진 갤러리
- 메모, 올린 사람 기록
- 멀티 사진 업로드

### 2-5. 출금 요청 (`/withdrawals`)
- 회사 전체 출금 요청 사진 갤러리
- 사유, 요청자 기록
- 멀티 사진 업로드

---

## 3. DB 테이블 구조

| 테이블 | 주요 컬럼 |
|--------|----------|
| `projects` | id, name, client_name, address, status, manager, contract_date, start_date, end_date, memo |
| `project_assignments` | id, project_id, employee_name, role, task |
| `project_files` | id, project_id, file_name, file_url, file_type, category, memo, uploaded_by |
| `schedules` | id, project_id, task_name, scheduled_date, end_date, manager, is_done, phase_status |
| `notices` | id, title, content, category, author |
| `receipts` | id, image_url, memo, uploaded_by |
| `withdrawal_requests` | id, image_url, reason, requested_by, status, amount, recipient |

> **RLS**: 모든 테이블 비활성화 상태 (현재 인증 없음)  
> **Storage**: uploads 버킷 — anon INSERT/SELECT/DELETE 정책 허용

---

## 4. 알려진 이슈 / 해결된 이슈

| 이슈 | 원인 | 해결 |
|------|------|------|
| 사진 업로드 후 자료에 안 보임 | category 컬럼이 `사진`으로 저장됨 (구 코드 버그) | DB UPDATE로 `시공전사진`으로 일괄 변경 |
| Storage 업로드 400 에러 | Storage RLS 정책 없음 | Supabase Storage Policy 추가 |
| 사진 다중삭제 안 됨 | uploadData null 체크로 DB insert 건너뜀 | uploadError 기준으로 로직 변경 |

---

## 5. 배포

- **플랫폼**: Vercel (무료 플랜)
- **URL**: https://jm-interior.vercel.app
- **재배포**: 터미널에서 `npx vercel --prod`
- **환경변수** (Vercel 대시보드에 등록됨):
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

## 6. 다음 작업 예정 (v2.0)

### 6-1. 로그인 / 인증
- **방식**: Supabase Auth (이메일 + 비밀번호)
- **구현 난이도**: 중간 (1-2일)

```sql
CREATE TABLE profiles (
  id uuid REFERENCES auth.users PRIMARY KEY,
  name text NOT NULL,
  role text DEFAULT 'staff',  -- admin / designer / field / staff
  team text                   -- 디자인팀 / 현장팀
);
```

구현 순서:
1. Supabase → Authentication → Enable Email/Password
2. profiles 테이블 생성
3. `/login` 페이지 생성
4. `middleware.ts` 세션 확인
5. 페이지별 role 체크

### 6-2. 권한 체계

| 역할 | 설명 |
|------|------|
| `admin` | 원장/관리자 — 모든 기능 + 현장 생성/삭제 |
| `designer` | 디자인팀 |
| `field` | 현장팀 |
| `staff` | 일반 (열람 위주) |

### 6-3. 추가 예정 기능
- [ ] 직원 관리 페이지 (admin 전용)
- [ ] 견적서 관리
- [ ] 고객 연락처 관리
- [ ] 현장별 비용 집계
- [ ] 출금요청 승인 워크플로우
- [ ] 알림 기능 (공정 마감 임박)
- [ ] 모바일 최적화
