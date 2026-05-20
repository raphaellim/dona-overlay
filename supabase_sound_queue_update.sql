-- 수동 사운드 대기열 played_at 컬럼
create table if not exists sound_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  played_at timestamptz,
  station_id uuid references stations(id) on delete cascade,
  broadcast_id uuid references broadcasts(id) on delete cascade,
  sound_file text not null,
  title text default '',
  message text default ''
);

alter table sound_events add column if not exists played_at timestamptz;

create index if not exists sound_events_station_broadcast_pending_idx
on sound_events (station_id, broadcast_id, played_at, created_at);
