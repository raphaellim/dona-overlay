-- live_apply_alert_funding_fix.sql
-- 펀딩/노래방/오버레이 즉시반영 보강용
-- 별도 컬럼 추가 없이 settings.data 기본값만 확인합니다.

update settings
set data = jsonb_set(
  jsonb_set(
    data,
    '{karaokeData}',
    coalesce(data #> '{karaokeData}', '{"title":"노래방 공지 알림판","notice":"노래문의필수","users":[],"songs":[]}'::jsonb),
    true
  ),
  '{fundingData}',
  coalesce(data #> '{fundingData}', '{"items":[]}'::jsonb),
  true
)
where id = 1
  and data is not null;

notify pgrst, 'reload schema';
