-- station_shared_notice_funding_karaoke_fix.sql
-- 공지/펀딩/노래방이 전체 방송국에 공통 적용되는 문제 수정
-- 구조:
-- settings.data.stationSettings.<stationSlug>._shared 에 방송국별 공통 설정 저장
-- 같은 방송국의 새 방송에는 이어지고, 다른 방송국에는 적용되지 않음.

update settings
set data = jsonb_set(
  coalesce(data, '{}'::jsonb),
  '{stationSettings}',
  coalesce(data #> '{stationSettings}', '{}'::jsonb),
  true
)
where id = 1;

-- 현재 등록된 방송국별로 _shared 기본값을 생성합니다.
-- 기존 global 공지/펀딩/노래방 값을 각 방송국의 초기값으로 복사합니다.
update settings
set data = jsonb_set(
  data,
  '{stationSettings}',
  (
    select jsonb_object_agg(
      s.slug,
      jsonb_set(
        coalesce(data #> array['stationSettings', s.slug], '{}'::jsonb),
        '{_shared}',
        coalesce(data #> array['stationSettings', s.slug, '_shared'], jsonb_build_object(
          'title', coalesce(data #> '{title}', '"도네이터 현황"'::jsonb),
          'titleImage', coalesce(data #> '{titleImage}', '""'::jsonb),
          'noticeTitle', coalesce(data #> '{noticeTitle}', '"공지"'::jsonb),
          'notice', coalesce(data #> '{notice}', '""'::jsonb),
          'noticeColors', coalesce(data #> '{noticeColors}', '["#ffffff","#ffe066","#5ecbff","#ffb4ca","#ff4d5e"]'::jsonb),
          'karaokeData', coalesce(data #> '{karaokeData}', '{"title":"노래방 공지 알림판","notice":"노래문의필수","users":[],"songs":[]}'::jsonb),
          'fundingData', coalesce(data #> '{fundingData}', '{"items":[]}'::jsonb)
        )),
        true
      )
    )
    from stations s
  ),
  true
)
where id = 1
  and to_regclass('public.stations') is not null;

notify pgrst, 'reload schema';
