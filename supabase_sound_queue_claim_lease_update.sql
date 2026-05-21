-- 수동 사운드 대기열 claim/lease 컬럼
alter table sound_events add column if not exists claim_token text;
alter table sound_events add column if not exists claimed_at timestamptz;
alter table sound_events add column if not exists released_at timestamptz;
alter table sound_events add column if not exists status text default 'pending';
alter table sound_events add column if not exists played_at timestamptz;
alter table sound_events add column if not exists repeat_total integer default 1;
alter table sound_events add column if not exists repeat_played integer default 0;

update sound_events
set status = coalesce(status, 'pending'),
    repeat_total = coalesce(repeat_total, 1),
    repeat_played = coalesce(repeat_played, 0);

create index if not exists sound_events_claim_lease_idx
on sound_events (station_id, broadcast_id, status, played_at, claimed_at, released_at, created_at);

notify pgrst, 'reload schema';
