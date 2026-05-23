-- alert_refresh_creator_summary_fix.sql
-- /api/summary 502 방지와 settings 기본값 보강

insert into settings (id, data, updated_at)
values (
  1,
  '{
    "title":"도네이터 현황",
    "titleImage":"",
    "noticeTitle":"공지",
    "notice":"",
    "noticeColors":["#ffffff","#ffe066","#5ecbff","#ffb4ca","#ff4d5e"],
    "overlaySections":{"account":true,"notice":false,"creators":true,"creatorDonations":true,"karaoke":false,"funding":false,"broadcastTimer":false},
    "karaokeData":{"title":"노래방 공지 알림판","notice":"노래문의필수","users":[],"songs":[]},
    "fundingData":{"items":[]},
    "broadcastTimerData":{"running":false,"startedAt":"","endedAt":"","elapsedMs":0},
    "stationSettings":{}
  }'::jsonb,
  now()
)
on conflict (id) do nothing;

update settings
set data = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          coalesce(data, '{}'::jsonb),
          '{overlaySections}',
          coalesce(data #> '{overlaySections}', '{"account":true,"notice":false,"creators":true,"creatorDonations":true,"karaoke":false,"funding":false,"broadcastTimer":false}'::jsonb),
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
  ),
  '{stationSettings}',
  coalesce(data #> '{stationSettings}', '{}'::jsonb),
  true
)
where id = 1;

notify pgrst, 'reload schema';
