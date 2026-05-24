-- v2_station_security_style_update.sql
-- 방송국별 공지/펀딩/노래방/스타일 분리 + 펀딩 초기화 방지 기본값 보강

-- stations / broadcasts 보강
alter table if exists public.stations
  add column if not exists station_admin_password text default '',
  add column if not exists overlay_token text;

alter table if exists public.broadcasts
  add column if not exists broadcast_password text default '',
  add column if not exists ended_at timestamptz,
  add column if not exists memo text default '';

-- settings row 기본값
insert into public.settings (id, data, updated_at)
values (1, '{}'::jsonb, now())
on conflict (id) do nothing;

update public.settings
set data = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        coalesce(data, '{}'::jsonb),
        '{stationSettings}',
        coalesce(data #> '{stationSettings}', '{}'::jsonb),
        true
      ),
      '{fundingData}',
      coalesce(data #> '{fundingData}', '{"items":[]}'::jsonb),
      true
    ),
    '{karaokeData}',
    coalesce(data #> '{karaokeData}', '{"title":"노래방 공지 알림판","notice":"노래문의필수","users":[],"songs":[]}'::jsonb),
    true
  ),
  '{stationStyle}',
  coalesce(data #> '{stationStyle}', '{
    "boxBorderColor":"rgba(255,138,185,.95)",
    "boxBgTop":"rgba(18,22,32,.88)",
    "boxBgBottom":"rgba(10,12,20,.82)",
    "accountTitleColor":"#ffe680",
    "noticeTitleColor":"#8ee7ff",
    "fundingTitleColor":"#b8ff9d",
    "karaokeTitleColor":"#ff9bd6",
    "contentColor":"#ffffff",
    "noticeContentColor":"#ffffff",
    "fundingContentColor":"#f8fafc",
    "karaokeContentColor":"#ffffff",
    "accountTitleSize":20,
    "noticeTitleSize":20,
    "fundingTitleSize":20,
    "karaokeTitleSize":20,
    "contentFontSize":20,
    "fundingBarColor":"linear-gradient(90deg, rgba(0,234,255,.58), rgba(255,79,216,.48))"
  }'::jsonb),
  true
)
where id = 1;

-- 각 방송국별 _shared 생성/보강
do $$
begin
  if to_regclass('public.stations') is not null then
    update public.settings
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
              'fundingData', coalesce(data #> '{fundingData}', '{"items":[]}'::jsonb),
              'stationStyle', coalesce(data #> '{stationStyle}', '{
                "boxBorderColor":"rgba(255,138,185,.95)",
                "boxBgTop":"rgba(18,22,32,.88)",
                "boxBgBottom":"rgba(10,12,20,.82)",
                "accountTitleColor":"#ffe680",
                "noticeTitleColor":"#8ee7ff",
                "fundingTitleColor":"#b8ff9d",
                "karaokeTitleColor":"#ff9bd6",
                "contentColor":"#ffffff",
                "noticeContentColor":"#ffffff",
                "fundingContentColor":"#f8fafc",
                "karaokeContentColor":"#ffffff",
                "accountTitleSize":20,
                "noticeTitleSize":20,
                "fundingTitleSize":20,
                "karaokeTitleSize":20,
                "contentFontSize":20,
                "fundingBarColor":"linear-gradient(90deg, rgba(0,234,255,.58), rgba(255,79,216,.48))"
              }'::jsonb)
            )),
            true
          )
        )
        from public.stations s
      ),
      true
    )
    where id = 1;
  end if;
end $$;

notify pgrst, 'reload schema';
