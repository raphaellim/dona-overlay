-- fix_null_karaoke_sync_update.sql
-- 펀딩/노래방 공통 데이터 기본값 보강

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
