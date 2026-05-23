-- final_polish_update.sql
-- 최종 UI/UX 보정용. 별도 컬럼 추가 없이 기본 JSON만 확인합니다.

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
