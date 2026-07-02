-- 채팅 읽음 확인: 사용자별·대화별 마지막으로 읽은 시각
-- Supabase SQL Editor에서 한 번 실행하세요.

create table if not exists chat_reads (
  user_id      uuid not null,
  conv_key     text not null,           -- 'dm:<상대id>' | 'room:<방id>'
  last_read_at timestamptz not null default now(),
  primary key (user_id, conv_key)
);

alter table chat_reads enable row level security;
drop policy if exists chat_reads_all on chat_reads;
create policy chat_reads_all on chat_reads for all using (true) with check (true);

-- 실시간 반영 (이미 추가돼 있으면 에러가 나도 무시하세요)
alter publication supabase_realtime add table chat_reads;
