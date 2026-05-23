-- broadcast_timer_per_list_update.sql
-- 방송별 타이머 누적시간(elapsedMs) 기본값 보강
-- settings.data JSON 구조를 사용하므로 별도 테이블 추가는 없습니다.

update settings
set data = jsonb_set(
  data,
  '{broadcastTimerData,elapsedMs}',
  coalesce(data #> '{broadcastTimerData,elapsedMs}', '0'::jsonb),
  true
)
where id = 1
  and data is not null;

-- 방송별 설정(stationSettings.*.*)에도 elapsedMs 기본값 보강
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
            broadcast_value,
            '{broadcastTimerData,elapsedMs}',
            coalesce(broadcast_value #> '{broadcastTimerData,elapsedMs}', '0'::jsonb),
            true
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
