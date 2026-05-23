-- donation_overlay_v1_plus_sections.sql
-- 1차 최종본 + 노래방창/펀딩창/방송시간 타이머 ON/OFF 추가 SQL
-- 기존 데이터 삭제 없이 필요한 컬럼/설정 기본값만 보강합니다.

alter table if exists sound_events add column if not exists released_at timestamptz;
alter table if exists sound_events add column if not exists status text default 'pending';
alter table if exists sound_events add column if not exists played_at timestamptz;
alter table if exists sound_events add column if not exists repeat_total integer default 1;
alter table if exists sound_events add column if not exists repeat_played integer default 0;

update sound_events
set status = coalesce(status, 'pending'),
    repeat_total = coalesce(repeat_total, 1),
    repeat_played = coalesce(repeat_played, 0)
where true;

create index if not exists sound_events_v1_plus_idx
on sound_events (station_id, broadcast_id, status, played_at, released_at, created_at);

update settings
set data = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(data, '{overlaySections,creatorDonations}', 'true'::jsonb, true),
      '{overlaySections,karaoke}', 'false'::jsonb, true
    ),
    '{overlaySections,funding}', 'false'::jsonb, true
  ),
  '{overlaySections,broadcastTimer}', 'false'::jsonb, true
)
where id = 1
  and data is not null;

update settings
set data = jsonb_set(
  data,
  '{stationSettings}',
  (
    select jsonb_object_agg(station_key, station_value_new)
    from (
      select
        station_key,
        jsonb_object_agg(
          broadcast_key,
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(broadcast_value, '{overlaySections,creatorDonations}', 'true'::jsonb, true),
                '{overlaySections,karaoke}', coalesce(broadcast_value #> '{overlaySections,karaoke}', 'false'::jsonb), true
              ),
              '{overlaySections,funding}', coalesce(broadcast_value #> '{overlaySections,funding}', 'false'::jsonb), true
            ),
            '{overlaySections,broadcastTimer}', coalesce(broadcast_value #> '{overlaySections,broadcastTimer}', 'false'::jsonb), true
          )
        ) as station_value_new
      from settings s,
           jsonb_each(s.data #> '{stationSettings}') as stations(station_key, station_value),
           jsonb_each(station_value) as broadcasts(broadcast_key, broadcast_value)
      where s.id = settings.id
      group by station_key
    ) patched
  ),
  true
)
where id = 1
  and data #> '{stationSettings}' is not null;

notify pgrst, 'reload schema';
