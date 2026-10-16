-- Supabase SQL Editor에서 한 번 실행. 기존 후원/방송 테이블 변경 없음.
create table if not exists public.song_contests (
 station_id uuid primary key references public.stations(id) on delete cascade,
 state jsonb not null default '{}'::jsonb,
 revision integer not null default 1,
 updated_at timestamptz not null default now()
);
alter table public.song_contests enable row level security;
revoke all on public.song_contests from anon, authenticated;
grant all on public.song_contests to service_role;
