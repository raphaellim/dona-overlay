-- full manager update
-- 기존 v1_plus SQL 이후 실행 권장
-- karaokeData/fundingData/broadcastTimerData는 settings.data JSON에 저장됩니다.

update settings
set data = jsonb_set(
  jsonb_set(
    jsonb_set(
      data,
      '{karaokeData}',
      coalesce(data #> '{karaokeData}', '{"title":"노래방 공지 알림판","ticker":"신청곡은 채팅으로 남겨주세요","users":[],"songs":[]}'::jsonb),
      true
    ),
    '{fundingData}',
    coalesce(data #> '{fundingData}', '{"items":[]}'::jsonb),
    true
  ),
  '{broadcastTimerData}',
  coalesce(data #> '{broadcastTimerData}', '{"running":false,"startedAt":"","endedAt":""}'::jsonb),
  true
)
where id = 1
  and data is not null;

notify pgrst, 'reload schema';
