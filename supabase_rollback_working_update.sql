-- rollback working SQL: 반복 수동사운드 기본 컬럼
alter table sound_events add column if not exists released_at timestamptz;
alter table sound_events add column if not exists status text default 'pending';
alter table sound_events add column if not exists played_at timestamptz;
alter table sound_events add column if not exists repeat_total integer default 1;
alter table sound_events add column if not exists repeat_played integer default 0;

update sound_events
set status = coalesce(status, 'pending'),
    repeat_total = coalesce(repeat_total, 1),
    repeat_played = coalesce(repeat_played, 0);

create index if not exists sound_events_rollback_working_idx
on sound_events (station_id, broadcast_id, status, played_at, released_at, created_at);

notify pgrst, 'reload schema';
