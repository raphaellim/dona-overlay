-- global_notice_funding_karaoke_update.sql
-- 공지/펀딩/노래방 데이터를 방송별이 아니라 방송국 공통 데이터로 유지하기 위한 정리 SQL
-- 기존 데이터 삭제 없이 root data에 기본값을 보강합니다.

update settings
set data = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          data,
          '{noticeTitle}',
          coalesce(data #> '{noticeTitle}', '"공지"'::jsonb),
          true
        ),
        '{notice}',
        coalesce(data #> '{notice}', '""'::jsonb),
        true
      ),
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
