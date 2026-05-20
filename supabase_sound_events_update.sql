-- 수동 사운드 이벤트 테이블
create table if not exists sound_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  station_id uuid references stations(id) on delete cascade,
  broadcast_id uuid references broadcasts(id) on delete cascade,
  sound_file text not null,
  title text default '',
  message text default ''
);

create index if not exists sound_events_station_broadcast_created_idx
on sound_events (station_id, broadcast_id, created_at desc);
