-- 서버 웨이크업/오버레이 재접속 시 과거 pending 알림 재생 방지
alter table sound_events add column if not exists released_at timestamptz;
alter table sound_events add column if not exists status text default 'pending';
alter table sound_events add column if not exists played_at timestamptz;
alter table sound_events add column if not exists repeat_total integer default 1;
alter table sound_events add column if not exists repeat_played integer default 0;

update sound_events
set released_at = coalesce(released_at, created_at)
where status = 'pending';

update sound_events
set status = coalesce(status, 'pending'),
    repeat_total = coalesce(repeat_total, 1),
    repeat_played = coalesce(repeat_played, 0);

create index if not exists sound_events_no_replay_idx
on sound_events (station_id, broadcast_id, status, played_at, released_at, created_at);

notify pgrst, 'reload schema';
