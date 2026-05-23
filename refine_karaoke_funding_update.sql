-- refine_karaoke_funding_update.sql
-- karaokeData/fundingData/broadcastTimerData 기본값 보강
-- 기존 v1/full SQL 이후 실행 권장

update settings
set data = jsonb_set(
  jsonb_set(
    jsonb_set(
      data,
      '{karaokeData}',
      coalesce(data #> '{karaokeData}', '{"title":"노래방 공지 알림판","notice":"노래문의필수","users":[],"songs":[]}'::jsonb),
      true
    ),
    '{fundingData}',
    coalesce(data #> '{fundingData}', '{"items":[]}'::jsonb),
    true
  ),
  '{broadcastTimerData}',
  coalesce(data #> '{broadcastTimerData}', '{"running":false,"startedAt":"","endedAt":"","elapsedMs":0}'::jsonb),
  true
)
where id = 1
  and data is not null;

notify pgrst, 'reload schema';
