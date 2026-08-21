# 보안(RLS/권한) 적용 현황

> 마지막 정리: 2026-07-17 — **미적용분 일괄 SQL 실행 완료(대표, Success 확인)**: chat_images·notice_images·contacts(+18곳)·payroll_ledger·profit_file·project_access(현장별 partner)·payments admin전용·work_logs/push_subscriptions 조임·카테고리 공사전사진 변경
> ⚠️ Claude는 Supabase에 직접 접속할 수 없어 **원격으로 실제 적용 여부를 확인할 수 없습니다.**
> 아래 "적용" 표시는 **대화 기록(대표님이 SQL Editor에서 실행하고 알려준 것) 기준**입니다.
> 확실한 확인은 아래 §검증 쿼리를 Supabase에서 직접 실행해 주세요.

## SQL 파일별 상태 (repo: `jm-system/db/`)

| 파일 | 내용 | 상태 | 근거/날짜 |
|---|---|---|---|
| `security_and_realtime.sql` | 전체 테이블 RLS ON + authenticated 전체허용(auth_all) + 채팅/알림 테이블·realtime | ✅ 적용 | 2026-06-22 (파일 주석) — 이후 아래 파일들이 auth_all을 대체 |
| `rls_sensitive.sql` | employees/employee_salaries/employee_attendance/finance_* → **admin 전용** + `my_role()` | ✅ 적용 | 2026-07-02, 대표 실행 "Success" |
| `rls_notifications.sql` | notifications → 본인것만 select/update/delete, insert 허용 | ✅ 적용 | 2026-07-02, 대표 실행 "됐어" |
| `chat_features.sql` | messages 컬럼(reply/edit/delete/pin) + `message_reactions` + realtime | ✅ 적용 | 2026-07-02, 대표 "실행했어" |
| `chat_reads.sql` | `chat_reads`(읽음확인) 테이블 + realtime | ✅ 적용 | 2026-07-02, 대표 실행 (Success) |
| `rls_chat.sql` | **채팅 RLS 정비**(messages/chat_rooms/chat_room_members/message_reactions/chat_reads 참여자·본인 기준) | ✅ 적용 | 2026-07-02, 대표 실행 (Success). auth_all 대체 |
| `rls_money.sql` | **금전/내부자료 RLS**(receipts/withdrawal_requests/payments/project_costs/company_documents/project_files 역할 기준) | ✅ 적용 | 2026-07-02, 대표 실행 (Success). auth_all 대체 |

### 실행 순서 (완료됨 — 2026-07-02 이 순서로 적용)
1. `chat_reads.sql` (테이블이 있어야 `rls_chat.sql`이 chat_reads 정책을 걺)
2. `rls_chat.sql`
3. `rls_money.sql`

> 세 파일 모두 기존 `auth_all`(전체 허용) 정책을 **자동으로 제거 후** 새 정책을 겁니다. 운영 데이터 접근에 영향이 있으니 **실행 전 스냅샷/백업 권장**, 실행 직후 각 역할(admin/designer/field/partner) 계정으로 화면 동작을 확인하세요.

## 적용될 정책 요약

### 채팅 (`rls_chat.sql`)
- **messages**: 전체채팅=승인자 / DM=당사자만 / 방=멤버만 select. insert=본인 명의+파트너 제외. update(수정·고정·소프트삭제)=작성자 또는 admin. delete=작성자 또는 admin.
- **chat_rooms**: 멤버(또는 admin)만 select. 생성=본인 명의. 이름변경/삭제=생성자 또는 admin.
- **chat_room_members**: 멤버(또는 admin)만 목록 조회. 추가=생성자/admin. 삭제=생성자/admin/본인(나가기).
- **message_reactions**: 메시지 볼 수 있는 사람만 select. 본인 reaction만 추가/삭제.
- **chat_reads**: 내 행/나와의 DM 상대 행/내가 속한 방만 select. 본인 행만 upsert.

### 금전·내부자료 (`rls_money.sql`)
- **receipts / withdrawal_requests / payments**: admin·designer·field 접근, **partner·미승인 차단** (현재 화면 로직과 동일 — partner만 막힘).
- **project_costs**: admin·designer만 (field·partner 제외 = 현장상세 canSeeMoney와 동일).
- **company_documents**: admin=전체, designer·field=`전체공개`만, 쓰기=admin. partner·미승인 차단.
- **project_files**: 승인자 읽기, 쓰기=admin·designer·field(파트너 보기전용).

## 접근 요약 (한눈에)

**테이블 성격별**
- **admin 전용**: employees, employee_salaries, employee_attendance, finance_fixed_costs, finance_payroll, finance_project_profit, finance_sales, finance_quotes
- **본인 데이터만**: notifications(본인 알림만 조회/수정/삭제), chat_reads(본인 읽음행만 upsert)
- **역할별 제한**: receipts·withdrawal_requests(admin·designer·field), **payments(admin 전용 — 2026-07-10)**, project_costs(admin·designer), company_documents(admin 전체·designer/field는 전체공개만·쓰기 admin), project_files(승인자 읽기·비파트너 쓰기)
- **채팅 참여자 기준**: messages·chat_rooms·chat_room_members·message_reactions(참여자·본인, insert는 승인 실무역할만)

**역할별**
| 역할 | 접근 |
|---|---|
| **admin** | 전체 |
| **designer** | 현장·자료·채팅·영수증/출금/비용, 회사서류(전체공개)·현장자료. **수금(2026-07-10 관리자 전용화)·급여/직원정보/재정(finance_*) 차단** |
| **field** | 현장·자료·채팅·영수증/출금. **수금(payments)·비용(project_costs)·급여/직원정보/재정 차단**, 회사서류는 전체공개만 |
| **partner(외부협력업체)** | 현장 관련(금전 제외) **읽기 전용**. 채팅·금전·서류 insert/update 불가, 화면도 숨김 |
| **pending(미승인)** | **업무 데이터 접근 불가**(읽기·쓰기 모두). 승인(`isApproved`) 전엔 RLS가 차단 |

> ⚠️ rls_* SQL을 운영 DB에 (재)적용할 때는 **스냅샷/백업 후** 실행. drop+create 방식이라 재실행은 안전하지만 정책 교체 중 순간적 영향 가능.

## 구버전 SQL 정리 (2026-07-07)
`db/` 안의 옛 "authenticated 전체허용(auth_all)" 정책 잔재를 전부 최신 RLS 기준으로 수정 — **어떤 파일을 재실행해도 보안이 느슨해지지 않음.**
- `security_and_realtime.sql`: 공용 5테이블(profiles/projects/notices/schedules/project_assignments)만 auth_all 유지(의도된 설계), 채팅·알림은 테이블 생성만(정책은 rls_chat/rls_notifications)
- `finance_quotes.sql`·`employee_records.sql`: admin 전용 / `payments.sql`: admin·designer·field / `chat_features.sql`·`chat_reads.sql`: 정책 제거(rls_chat 참조)
- ~~운영 DB 잔여 전체허용 2건~~ → **적용 완료(2026-07-17 일괄 SQL)**:
  - `work_logs`(작업일지): partner·pending도 읽기 가능한 상태 → `db/worklogs.sql`의 RLS 블록 실행
  - `push_subscriptions`(푸시 구독): 타인 구독정보 조회 가능한 상태 → `db/push_subscriptions.sql`의 RLS 블록 실행

## 남은 보안 과제 (roadmap, 미구현)
- ~~partner "배정 현장만" DB 제한~~ → **적용 완료(2026-07-17 일괄 SQL, Success 확인)**: `project_access`(project_id+user_id) 테이블 + `has_project_access()` 헬퍼. projects/schedules/project_assignments/project_files select를 partner=공개 지정 현장만으로 교체, 쓰기는 직원만. 관리자 UI: 현장 상세 → 🔒 외부공개. **⚠️ 실행 직후 partner는 아무 현장도 안 보임(안전 기본값) — 현장마다 공개 체크 필요.** security_and_realtime.sql 공용 목록에서 해당 3테이블 제거됨.
- **Storage(uploads) 비공개화 + signed URL**: 현재 public 버킷 — 손익표·매출매입·견적서·급여 관련 첨부까지 public URL로 접근 가능(URL을 아는 사람은 로그인 없이 열람 가능). **민감 파일(재정·계약·직원자료)은 private bucket + signed URL(만료시간부) 전환이 필요.**
  - 전환 시 영향: 사진 표시·공유·오피스 뷰어 로직 전반 수정 필요 → 카테고리별(민감/일반) 버킷 분리 방식 권장.
  - **뷰어 유의점**: 엑셀·PDF "바로 열기"는 MS Office/Google 뷰어에 **파일 URL을 전달**하는 방식이라 외부 서비스가 해당 파일을 읽음. 민감 파일을 private+signed URL로 바꿔도 뷰어에 전달하면 그 순간은 외부에 노출됨 — 민감 재무 파일은 뷰어 대신 다운로드 열람으로 정책 결정 필요.
- **link-preview API SSRF 방어 적용(2026-07-07)**: 리다이렉트 매 단계 호스트 재검사(수동 follow, 최대 5회), IPv6·IPv4-mapped·localhost 변형·사설망으로 풀리는 도메인(DNS lookup) 차단, 본문은 최대 2MB까지만 스트리밍으로 읽음. 실패 시 조용히 `{url}` 반환(채팅은 링크만 표시).
- **감사 로그**: 상태변경·삭제·금액수정 이력.
- **방 관리 UI**: 현재 채팅방 설정(⚙️)은 non-partner에게 노출되나 RLS상 멤버 추가/삭제는 방 생성자·admin만 성공 → 필요 시 UI도 생성자/admin에게만 노출로 정리.

## §검증 쿼리 (Supabase SQL Editor에서 직접 확인)
```sql
-- 1) 테이블별 RLS 활성화 여부
select relname, relrowsecurity
from pg_class
where relnamespace = 'public'::regnamespace and relkind = 'r'
order by relname;

-- 2) 테이블별 정책 목록 (auth_all 이 남아있으면 아직 미교체)
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 3) 헬퍼 함수 존재 확인
select proname from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('my_role','is_approved','is_room_member','can_see_message');
```
- messages/chat_*/receipts/... 에 `auth_all` 정책이 **더 이상 없어야** 정상(새 정책명으로 바뀜).
