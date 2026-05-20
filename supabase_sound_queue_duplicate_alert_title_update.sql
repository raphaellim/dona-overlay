-- 수동 사운드 대기열 status/released_at/played_at 컬럼
alter table sound_events add column if not exists played_at timestamptz;
alter table sound_events add column if not exists released_at timestamptz;
alter table sound_events add column if not exists status text default 'pending';

update sound_events
set status = coalesce(status, 'pending');

update sound_events
set released_at = coalesce(released_at, created_at)
where status = 'pending';

create index if not exists sound_events_station_broadcast_status_idx
on sound_events (station_id, broadcast_id, status, played_at, released_at, created_at);

notify pgrst, 'reload schema';
