-- 수동 사운드 대기열 싱크용 released_at 컬럼
alter table sound_events add column if not exists released_at timestamptz;
alter table sound_events add column if not exists status text default 'pending';
alter table sound_events add column if not exists played_at timestamptz;

-- 기존 pending 항목은 과거 전송으로 간주하여 overlay 새로고침 시 재생되지 않게 기준 시간을 채웁니다.
update sound_events
set released_at = coalesce(released_at, created_at)
where status = 'pending';

create index if not exists sound_events_station_broadcast_release_idx
on sound_events (station_id, broadcast_id, status, played_at, released_at, created_at);
