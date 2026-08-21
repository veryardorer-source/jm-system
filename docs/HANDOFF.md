# 🔄 이어서 작업하기 (다른 PC 인수인계)

> 다른 PC에서 작업 이어갈 때, **Claude에게 이 문서를 먼저 읽으라고 하세요.**
> 예: "관리시스템/docs/HANDOFF.md 읽고 이어서 작업해줘"
> 최종 업데이트: 2026-06-18

---

## 한 줄 요약

JM 건축인테리어 사내 관리 웹앱(**JM OS**)을 만들고 있다. 앱은 이미 배포돼 동작 중이며,
다음 작업은 **"PC 화면은 그대로 두고 모바일에서 보기 편하게"** 만드는 반응형 작업이다.

## 지금 어디까지 됐나

- **앱 라이브 배포 중**: https://jm-interior.vercel.app
  - 기술스택: Next.js(App Router) + Tailwind + Supabase + Vercel
  - 레이아웃: 왼쪽 고정 세로 사이드바 + 오른쪽 본문
  - 라우트:
    - `/` 대시보드 — 통계카드 3개 + 공정 간트타임라인 + 직원별 업무카드
    - `/notices` 공지사항 (현재 빈 상태)
    - `/projects` 현장 관리 (6열 표) → `/projects/[id]` 현장 상세 (자료/공정 탭)
    - `/receipts` 영수증 (현재 빈 상태)
    - `/withdrawals` 출금 요청 (현재 빈 상태)
- **DB 설계 완료**: `관리시스템/supabase/migrations/`, `관리시스템/docs/ERD.md`
- **모바일 점검·계획 완료**: `관리시스템/docs/mobile_audit.md` ← 작업 시 이거 보고 진행

## ⚠️ 가장 중요 — 앱 소스 코드 위치

- 이 깃 저장소(`veryardorer-source/JM`)에는 **설계/계획 문서만** 있고 **앱 소스는 없다.**
- 앱 소스는 **2026-06-17에 작업한 PC의 로컬**에만 있다. Vercel CLI로 배포해서 GitHub 미연동.
- **그래서 모바일 작업을 하려면 앱 소스가 그 PC에 있어야 한다.**

### 경우 A — 지금 이 PC가 어제(6/17) 작업한 그 PC다
→ jm-interior 앱 폴더가 이 PC에 이미 있다. 그 폴더에서 바로 작업 시작.
   (폴더 위치 모르면: `npm`/`next` 프로젝트 + jm-interior 관련 폴더를 찾으면 됨)

### 경우 B — 다른 PC다 (앱 소스가 없다)
→ 어제 그 PC에서 앱을 GitHub에 한 번 올려야 한다. 그 PC 앱 폴더에서:
```bash
git status
git add -A && git commit -m "작업 저장"     # 이미 커밋돼 있으면 생략
# GitHub에 jm-interior 빈 저장소 하나 만든 뒤:
git remote add origin https://github.com/<계정명>/jm-interior.git
git branch -M main && git push -u origin main
```
올린 다음 그 저장소를 작업할 PC로 `git clone`.

## 결정된 사항 (대표 확인 완료)

- ✅ **모바일 메뉴 = ☰ 햄버거** (좌상단, 눌러서 슬라이드로 열림). PC는 사이드바 유지.
- ✅ **대시보드 공정표 = 모바일에선 카드형 전환** (현장별 카드). PC는 타임라인 유지.

## 작업 순서 (앱 소스 확보 후)

1. 앱 폴더에서 `npm install` → `npm run dev` (로컬 실행, 핸드폰 크기로 확인하며)
2. `관리시스템/docs/mobile_audit.md`의 수정 목록을 **1번(햄버거 메뉴)부터** 한 화면씩 적용
3. 매번 모바일/PC 둘 다 깨지지 않는지 확인
4. 완료 → commit → push → Vercel 배포

## 핵심 원칙

PC 화면은 **절대 안 건드린다.** Tailwind 반응형(`md:` 768px 경계)으로
"기본=모바일, `md:`부터=현재 PC 모습"만 얹는다. 안전하다.

## 대표님 메모

- 대표는 비개발자 → 쉬운 말로 설명할 것.
- 회계/급여는 외부(경리나라)에서 대표 혼자 처리. 직원은 영수증 사진만 업로드.
