-- 채팅 기능 확장 (잔디 스타일): 답장 / 수정·삭제 / 공지고정 / 이모지 반응
-- Supabase SQL Editor에서 한 번 실행하세요.

-- 1) messages 컬럼 추가 (답장·수정·삭제·고정)
alter table messages add column if not exists reply_to_id  uuid;
alter table messages add column if not exists reply_preview text;      -- "보낸사람|요약" 형태
alter table messages add column if not exists is_deleted   boolean default false;
alter table messages add column if not exists edited_at    timestamptz;
alter table messages add column if not exists pinned       boolean default false;

-- 2) 이모지 반응 테이블
create table if not exists message_reactions (
  id         uuid primary key default gen_random_uuid(),
  message_id uuid not null,
  user_id    uuid not null,
  user_name  text,
  emoji      text not null,
  created_at timestamptz default now(),
  unique (message_id, user_id, emoji)
);

-- RLS: (구) 전체허용 폐기(2026-07-07) — 참여자 기준 정책은 db/rls_chat.sql 실행으로 적용.
--      정책 없이 RLS만 켜두면 전부 차단되므로, 새 DB 세팅 시 반드시 rls_chat.sql까지 실행할 것.
alter table message_reactions enable row level security;
drop policy if exists reactions_all on message_reactions;

-- 3) 실시간 반영 (이미 추가돼 있으면 에러가 나도 무시하세요)
alter publication supabase_realtime add table message_reactions;
