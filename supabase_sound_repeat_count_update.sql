-- 수동 사운드 반복 재생 카운트 컬럼
alter table sound_events add column if not exists repeat_total integer default 1;
alter table sound_events add column if not exists repeat_played integer default 0;

update sound_events
set repeat_total = coalesce(repeat_total, 1),
    repeat_played = coalesce(repeat_played, 0);

create index if not exists sound_events_repeat_idx
on sound_events (station_id, broadcast_id, status, played_at, repeat_played, created_at);

notify pgrst, 'reload schema';
