-- dona-overlay 통합 Supabase SQL
-- 0606 최신본 + 슬롯형 룰렛 버전
-- 룰렛 데이터는 settings.data JSON 안에 저장되므로 별도 테이블이 필요 없습니다.
-- 새 Supabase 프로젝트는 이 파일 하나만 SQL Editor에서 실행하세요.




-- ============================================================
-- merged from: supabase_multistation.sql
-- ============================================================
-- dona-overlay 멀티 방송국 SQL 업그레이드
-- Supabase SQL Editor에서 실행하세요.

create extension if not exists pgcrypto;

create table if not exists settings (
  id integer primary key default 1,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

insert into settings (id, data)
values (1, '{}'::jsonb)
on conflict (id) do nothing;

create table if not exists stations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  station_admin_password text default '',
  overlay_token text default encode(gen_random_bytes(16), 'hex'),
  created_at timestamptz default now()
);

create table if not exists broadcasts (
  id uuid primary key default gen_random_uuid(),
  station_id uuid references stations(id) on delete cascade,
  title text not null,
  broadcast_password text default '',
  is_active boolean default false,
  created_at timestamptz default now(),
  ended_at timestamptz,
  memo text default ''
);

create table if not exists donations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  station_id uuid references stations(id) on delete cascade,
  broadcast_id uuid references broadcasts(id) on delete set null,
  donor text not null,
  creator text not null,
  process_type text default '후원',
  account_amount integer default 0,
  toonie_amount integer default 0,
  total_amount integer default 0,
  display_amount text default '0',
  smoke integer default 0,
  nosmoke integer default 0,
  eat integer default 0,
  noeat integer default 0,
  checks jsonb not null default '[]'::jsonb,
  result_label text default '후원',
  memo text default ''
);

alter table broadcasts add column if not exists station_id uuid references stations(id) on delete cascade;
alter table broadcasts add column if not exists broadcast_password text default '';
alter table broadcasts add column if not exists ended_at timestamptz;
alter table broadcasts add column if not exists memo text default '';

alter table donations add column if not exists station_id uuid references stations(id) on delete cascade;
alter table donations add column if not exists broadcast_id uuid references broadcasts(id) on delete set null;

insert into stations (name, slug, station_admin_password)
select '기본방송국', 'default', ''
where not exists (select 1 from stations where slug = 'default');

-- 기존 broadcasts에 station_id가 없으면 기본 방송국으로 연결
update broadcasts
set station_id = (select id from stations where slug='default' limit 1)
where station_id is null;

-- 기존 donations에 station_id가 없으면 기본 방송국으로 연결
update donations
set station_id = (select id from stations where slug='default' limit 1)
where station_id is null;

-- 기본 방송 생성
insert into broadcasts (station_id, title, is_active)
select (select id from stations where slug='default' limit 1), '기본방송', true
where not exists (select 1 from broadcasts where station_id = (select id from stations where slug='default' limit 1));

create index if not exists stations_slug_idx on stations (slug);
create index if not exists broadcasts_station_id_idx on broadcasts (station_id);
create index if not exists broadcasts_station_active_idx on broadcasts (station_id, is_active);
create index if not exists donations_station_id_idx on donations (station_id);
create index if not exists donations_broadcast_id_idx on donations (broadcast_id);
create index if not exists donations_created_at_idx on donations (created_at desc);
create index if not exists donations_creator_idx on donations (creator);
create index if not exists donations_donor_idx on donations (donor);

-- 수동 사운드 선택 필드 추가
alter table donations add column if not exists manual_sound_file text default '';
alter table donations add column if not exists manual_sound_title text default '';

-- 수동 사운드 이벤트 테이블
create table if not exists sound_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  station_id uuid references stations(id) on delete cascade,
  broadcast_id uuid references broadcasts(id) on delete cascade,
  sound_file text not null,
  title text default '',
  message text default ''
);

create index if not exists sound_events_station_broadcast_created_idx
on sound_events (station_id, broadcast_id, created_at desc);

-- 수동 사운드 대기열 played_at 컬럼
create table if not exists sound_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  played_at timestamptz,
  station_id uuid references stations(id) on delete cascade,
  broadcast_id uuid references broadcasts(id) on delete cascade,
  sound_file text not null,
  title text default '',
  message text default ''
);

alter table sound_events add column if not exists played_at timestamptz;

create index if not exists sound_events_station_broadcast_pending_idx
on sound_events (station_id, broadcast_id, played_at, created_at);

-- 수동 사운드 대기/전송 상태 컬럼
create table if not exists sound_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  played_at timestamptz,
  status text default 'pending',
  station_id uuid references stations(id) on delete cascade,
  broadcast_id uuid references broadcasts(id) on delete cascade,
  sound_file text not null,
  title text default '',
  message text default ''
);

alter table sound_events add column if not exists played_at timestamptz;
alter table sound_events add column if not exists status text default 'pending';

create index if not exists sound_events_station_broadcast_status_idx
on sound_events (station_id, broadcast_id, status, played_at, created_at);

-- 수동 사운드 대기열 싱크용 released_at 컬럼
alter table sound_events add column if not exists released_at timestamptz;
alter table sound_events add column if not exists status text default 'pending';
alter table sound_events add column if not exists played_at timestamptz;

-- 기존 pending 항목은 과거 전송으로 간주하여 overlay 새로고침 시 재생되지 않게 기준 시간을 채웁니다.
update sound_events
set released_at = coalesce(released_at, created_at)
where status = 'pending';

create index if not exists sound_events_station_broadcast_release_idx
on sound_events (station_id, broadcast_id, status, played_at, released_at, created_at);

-- 수동 사운드 반복 재생 카운트 컬럼
alter table sound_events add column if not exists repeat_total integer default 1;
alter table sound_events add column if not exists repeat_played integer default 0;

update sound_events
set repeat_total = coalesce(repeat_total, 1),
    repeat_played = coalesce(repeat_played, 0);

create index if not exists sound_events_repeat_idx
on sound_events (station_id, broadcast_id, status, played_at, repeat_played, created_at);

notify pgrst, 'reload schema';



-- ============================================================
-- merged from: v2_full_checked_final.sql
-- ============================================================
-- v2_full_checked_final.sql
alter table if exists public.stations add column if not exists station_admin_password text default '', add column if not exists overlay_token text;
alter table if exists public.broadcasts add column if not exists broadcast_password text default '', add column if not exists ended_at timestamptz, add column if not exists memo text default '';
insert into public.settings (id, data, updated_at) values (1, '{}'::jsonb, now()) on conflict (id) do nothing;
update public.settings set data = jsonb_set(jsonb_set(jsonb_set(jsonb_set(coalesce(data, '{}'::jsonb),'{stationSettings}',coalesce(data #> '{stationSettings}', '{}'::jsonb),true),'{fundingData}',coalesce(data #> '{fundingData}', '{"items":[]}'::jsonb),true),'{karaokeData}',coalesce(data #> '{karaokeData}', '{"title":"노래방 공지 알림판","notice":"노래문의필수","users":[],"songs":[]}'::jsonb),true),'{stationStyle}',coalesce(data #> '{stationStyle}', '{"boxBorderColor":"rgba(255,138,185,.95)","boxBgTop":"rgba(18,22,32,.88)","boxBgBottom":"rgba(10,12,20,.82)","accountTitleColor":"#ffe680","noticeTitleColor":"#8ee7ff","fundingTitleColor":"#b8ff9d","karaokeTitleColor":"#ff9bd6","contentColor":"#ffffff","noticeContentColor":"#ffffff","fundingContentColor":"#f8fafc","karaokeContentColor":"#ffffff","accountTitleSize":20,"noticeTitleSize":20,"fundingTitleSize":20,"karaokeTitleSize":20,"contentFontSize":20,"fundingBarColor":"linear-gradient(90deg, rgba(0,234,255,.58), rgba(255,79,216,.48))","vipAccountThreshold":500000,"vipAccountBg1":"rgba(255,216,77,.30)","vipAccountBg2":"rgba(255,79,216,.28)"}'::jsonb),true) where id = 1;
do $$ begin if to_regclass('public.stations') is not null then update public.settings set data = jsonb_set(data,'{stationSettings}',(select jsonb_object_agg(s.slug,jsonb_set(coalesce(data #> array['stationSettings', s.slug], '{}'::jsonb),'{_shared}',coalesce(data #> array['stationSettings', s.slug, '_shared'], jsonb_build_object('title',coalesce(data #> '{title}', '"도네이터 현황"'::jsonb),'titleImage',coalesce(data #> '{titleImage}', '""'::jsonb),'noticeTitle',coalesce(data #> '{noticeTitle}', '"공지"'::jsonb),'notice',coalesce(data #> '{notice}', '""'::jsonb),'noticeColors',coalesce(data #> '{noticeColors}', '["#ffffff","#ffe066","#5ecbff","#ffb4ca","#ff4d5e"]'::jsonb),'karaokeData',coalesce(data #> '{karaokeData}', '{"title":"노래방 공지 알림판","notice":"노래문의필수","users":[],"songs":[]}'::jsonb),'fundingData',coalesce(data #> '{fundingData}', '{"items":[]}'::jsonb),'stationStyle',coalesce(data #> '{stationStyle}', '{"boxBorderColor":"rgba(255,138,185,.95)","boxBgTop":"rgba(18,22,32,.88)","boxBgBottom":"rgba(10,12,20,.82)","accountTitleColor":"#ffe680","noticeTitleColor":"#8ee7ff","fundingTitleColor":"#b8ff9d","karaokeTitleColor":"#ff9bd6","contentColor":"#ffffff","noticeContentColor":"#ffffff","fundingContentColor":"#f8fafc","karaokeContentColor":"#ffffff","accountTitleSize":20,"noticeTitleSize":20,"fundingTitleSize":20,"karaokeTitleSize":20,"contentFontSize":20,"fundingBarColor":"linear-gradient(90deg, rgba(0,234,255,.58), rgba(255,79,216,.48))","vipAccountThreshold":500000,"vipAccountBg1":"rgba(255,216,77,.30)","vipAccountBg2":"rgba(255,79,216,.28)"}'::jsonb)),true)) from public.stations s),true) where id = 1; end if; end $$;
notify pgrst, 'reload schema';



-- ============================================================
-- merged from: v2_station_security_style_update.sql
-- ============================================================
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
    "fundingBarColor":"linear-gradient(90deg, rgba(0,234,255,.58), rgba(255,79,216,.48))","vipAccountThreshold":500000,"vipAccountBg1":"rgba(255,216,77,.30)","vipAccountBg2":"rgba(255,79,216,.28)"
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
                "fundingBarColor":"linear-gradient(90deg, rgba(0,234,255,.58), rgba(255,79,216,.48))","vipAccountThreshold":500000,"vipAccountBg1":"rgba(255,216,77,.30)","vipAccountBg2":"rgba(255,79,216,.28)"
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



-- ============================================================
-- merged from: alert_refresh_creator_summary_fix.sql
-- ============================================================
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



-- ============================================================
-- merged from: broadcast_timer_per_list_update.sql
-- ============================================================
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



-- ============================================================
-- merged from: donation_overlay_v1_plus_sections.sql
-- ============================================================
-- donation_overlay_v1_plus_sections.sql
-- 1차 최종본 + 노래방창/펀딩창/방송시간 타이머 ON/OFF 추가 SQL
-- 기존 데이터 삭제 없이 필요한 컬럼/설정 기본값만 보강합니다.

alter table if exists sound_events add column if not exists released_at timestamptz;
alter table if exists sound_events add column if not exists status text default 'pending';
alter table if exists sound_events add column if not exists played_at timestamptz;
alter table if exists sound_events add column if not exists repeat_total integer default 1;
alter table if exists sound_events add column if not exists repeat_played integer default 0;

update sound_events
set status = coalesce(status, 'pending'),
    repeat_total = coalesce(repeat_total, 1),
    repeat_played = coalesce(repeat_played, 0)
where true;

create index if not exists sound_events_v1_plus_idx
on sound_events (station_id, broadcast_id, status, played_at, released_at, created_at);

update settings
set data = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(data, '{overlaySections,creatorDonations}', 'true'::jsonb, true),
      '{overlaySections,karaoke}', 'false'::jsonb, true
    ),
    '{overlaySections,funding}', 'false'::jsonb, true
  ),
  '{overlaySections,broadcastTimer}', 'false'::jsonb, true
)
where id = 1
  and data is not null;

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
            jsonb_set(
              jsonb_set(
                jsonb_set(broadcast_value, '{overlaySections,creatorDonations}', 'true'::jsonb, true),
                '{overlaySections,karaoke}', coalesce(broadcast_value #> '{overlaySections,karaoke}', 'false'::jsonb), true
              ),
              '{overlaySections,funding}', coalesce(broadcast_value #> '{overlaySections,funding}', 'false'::jsonb), true
            ),
            '{overlaySections,broadcastTimer}', coalesce(broadcast_value #> '{overlaySections,broadcastTimer}', 'false'::jsonb), true
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



-- ============================================================
-- merged from: final_polish_update.sql
-- ============================================================
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



-- ============================================================
-- merged from: fix_null_karaoke_sync_update.sql
-- ============================================================
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



-- ============================================================
-- merged from: full_manager_update.sql
-- ============================================================
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



-- ============================================================
-- merged from: global_notice_funding_karaoke_update.sql
-- ============================================================
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



-- ============================================================
-- merged from: karaoke_manager_update.sql
-- ============================================================
-- karaoke manager update
-- settings.data JSON에 karaokeData를 저장하는 구조라 추가 테이블은 필요 없습니다.
-- 기존 v1_plus SQL을 실행했다면 별도 DB 컬럼 추가는 필요 없습니다.
-- 아래는 안전한 기본값 보강용입니다.

update settings
set data = jsonb_set(
  data,
  '{karaokeData}',
  coalesce(data #> '{karaokeData}', '{"title":"노래방 공지 알림판","ticker":"신청곡은 채팅으로 남겨주세요","users":[],"songs":[]}'::jsonb),
  true
)
where id = 1
  and data is not null;

notify pgrst, 'reload schema';



-- ============================================================
-- merged from: live_apply_alert_funding_fix.sql
-- ============================================================
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



-- ============================================================
-- merged from: refine_karaoke_funding_update.sql
-- ============================================================
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



-- ============================================================
-- merged from: station_shared_notice_funding_karaoke_fix.sql
-- ============================================================
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



-- ============================================================
-- merged from: summary_502_ui_hotfix.sql
-- ============================================================
-- summary_502_ui_hotfix.sql
-- /api/summary 502 방지 + settings 기본값 보강

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



-- ============================================================
-- merged from: supabase_no_replay_after_wakeup_update.sql
-- ============================================================
-- 서버 웨이크업/오버레이 재접속 시 과거 pending 알림 재생 방지
alter table sound_events add column if not exists released_at timestamptz;
alter table sound_events add column if not exists status text default 'pending';
alter table sound_events add column if not exists played_at timestamptz;
alter table sound_events add column if not exists repeat_total integer default 1;
alter table sound_events add column if not exists repeat_played integer default 0;

update sound_events
set released_at = coalesce(released_at, created_at)
where status = 'pending';

update sound_events
set status = coalesce(status, 'pending'),
    repeat_total = coalesce(repeat_total, 1),
    repeat_played = coalesce(repeat_played, 0);

create index if not exists sound_events_no_replay_idx
on sound_events (station_id, broadcast_id, status, played_at, released_at, created_at);

notify pgrst, 'reload schema';



-- ============================================================
-- merged from: supabase_restore_stable_update.sql
-- ============================================================
-- 최종 안정화 SQL: 공지/ALERT와 직접 관련 없는 sound_events 대기열 컬럼 보강
alter table sound_events add column if not exists claim_token text;
alter table sound_events add column if not exists claimed_at timestamptz;
alter table sound_events add column if not exists pause_after_current boolean default false;
alter table sound_events add column if not exists released_at timestamptz;
alter table sound_events add column if not exists status text default 'pending';
alter table sound_events add column if not exists played_at timestamptz;
alter table sound_events add column if not exists repeat_total integer default 1;
alter table sound_events add column if not exists repeat_played integer default 0;

update sound_events
set status = coalesce(status, 'pending'),
    repeat_total = coalesce(repeat_total, 1),
    repeat_played = coalesce(repeat_played, 0),
    pause_after_current = coalesce(pause_after_current, false);

create index if not exists sound_events_restore_stable_idx
on sound_events (station_id, broadcast_id, status, played_at, claimed_at, released_at, created_at);

notify pgrst, 'reload schema';



-- ============================================================
-- merged from: supabase_rollback_working_update.sql
-- ============================================================
-- rollback working SQL: 반복 수동사운드 기본 컬럼
alter table sound_events add column if not exists released_at timestamptz;
alter table sound_events add column if not exists status text default 'pending';
alter table sound_events add column if not exists played_at timestamptz;
alter table sound_events add column if not exists repeat_total integer default 1;
alter table sound_events add column if not exists repeat_played integer default 0;

update sound_events
set status = coalesce(status, 'pending'),
    repeat_total = coalesce(repeat_total, 1),
    repeat_played = coalesce(repeat_played, 0);

create index if not exists sound_events_rollback_working_idx
on sound_events (station_id, broadcast_id, status, played_at, released_at, created_at);

notify pgrst, 'reload schema';



-- ============================================================
-- merged from: supabase_sound_events_update.sql
-- ============================================================
-- 수동 사운드 이벤트 테이블
create table if not exists sound_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  station_id uuid references stations(id) on delete cascade,
  broadcast_id uuid references broadcasts(id) on delete cascade,
  sound_file text not null,
  title text default '',
  message text default ''
);

create index if not exists sound_events_station_broadcast_created_idx
on sound_events (station_id, broadcast_id, created_at desc);



-- ============================================================
-- merged from: supabase_sound_manual_update.sql
-- ============================================================
-- 사운드 수동 선택 필드 추가
alter table donations add column if not exists manual_sound_key text default '';
alter table donations add column if not exists manual_sound_title text default '';



-- ============================================================
-- merged from: supabase_sound_queue_claim_lease_update.sql
-- ============================================================
-- 수동 사운드 대기열 claim/lease 컬럼
alter table sound_events add column if not exists claim_token text;
alter table sound_events add column if not exists claimed_at timestamptz;
alter table sound_events add column if not exists released_at timestamptz;
alter table sound_events add column if not exists status text default 'pending';
alter table sound_events add column if not exists played_at timestamptz;
alter table sound_events add column if not exists repeat_total integer default 1;
alter table sound_events add column if not exists repeat_played integer default 0;

update sound_events
set status = coalesce(status, 'pending'),
    repeat_total = coalesce(repeat_total, 1),
    repeat_played = coalesce(repeat_played, 0);

create index if not exists sound_events_claim_lease_idx
on sound_events (station_id, broadcast_id, status, played_at, claimed_at, released_at, created_at);

notify pgrst, 'reload schema';



-- ============================================================
-- merged from: supabase_sound_queue_duplicate_alert_title_update.sql
-- ============================================================
-- 수동 사운드 대기열 status/released_at/played_at 컬럼
alter table sound_events add column if not exists played_at timestamptz;
alter table sound_events add column if not exists released_at timestamptz;
alter table sound_events add column if not exists status text default 'pending';

update sound_events
set status = coalesce(status, 'pending');

update sound_events
set released_at = coalesce(released_at, created_at)
where status = 'pending';

create index if not exists sound_events_station_broadcast_status_idx
on sound_events (station_id, broadcast_id, status, played_at, released_at, created_at);

notify pgrst, 'reload schema';



-- ============================================================
-- merged from: supabase_sound_queue_mode_update.sql
-- ============================================================
-- 수동 사운드 대기/전송 상태 컬럼
create table if not exists sound_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  played_at timestamptz,
  status text default 'pending',
  station_id uuid references stations(id) on delete cascade,
  broadcast_id uuid references broadcasts(id) on delete cascade,
  sound_file text not null,
  title text default '',
  message text default ''
);

alter table sound_events add column if not exists played_at timestamptz;
alter table sound_events add column if not exists status text default 'pending';

create index if not exists sound_events_station_broadcast_status_idx
on sound_events (station_id, broadcast_id, status, played_at, created_at);



-- ============================================================
-- merged from: supabase_sound_queue_pause_resend_update.sql
-- ============================================================
-- 수동 사운드 대기열 claim/lease + 멈춤/재전송 컬럼
alter table sound_events add column if not exists claim_token text;
alter table sound_events add column if not exists claimed_at timestamptz;
alter table sound_events add column if not exists pause_after_current boolean default false;
alter table sound_events add column if not exists released_at timestamptz;
alter table sound_events add column if not exists status text default 'pending';
alter table sound_events add column if not exists played_at timestamptz;
alter table sound_events add column if not exists repeat_total integer default 1;
alter table sound_events add column if not exists repeat_played integer default 0;

update sound_events
set status = coalesce(status, 'pending'),
    repeat_total = coalesce(repeat_total, 1),
    repeat_played = coalesce(repeat_played, 0),
    pause_after_current = coalesce(pause_after_current, false);

create index if not exists sound_events_pause_claim_idx
on sound_events (station_id, broadcast_id, status, played_at, claimed_at, released_at, created_at);

notify pgrst, 'reload schema';



-- ============================================================
-- merged from: supabase_sound_queue_sync_update.sql
-- ============================================================
-- 수동 사운드 대기열 싱크용 released_at 컬럼
alter table sound_events add column if not exists released_at timestamptz;
alter table sound_events add column if not exists status text default 'pending';
alter table sound_events add column if not exists played_at timestamptz;

-- 기존 pending 항목은 과거 전송으로 간주하여 overlay 새로고침 시 재생되지 않게 기준 시간을 채웁니다.
update sound_events
set released_at = coalesce(released_at, created_at)
where status = 'pending';

create index if not exists sound_events_station_broadcast_release_idx
on sound_events (station_id, broadcast_id, status, played_at, released_at, created_at);



-- ============================================================
-- merged from: supabase_sound_queue_update.sql
-- ============================================================
-- 수동 사운드 대기열 played_at 컬럼
create table if not exists sound_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  played_at timestamptz,
  station_id uuid references stations(id) on delete cascade,
  broadcast_id uuid references broadcasts(id) on delete cascade,
  sound_file text not null,
  title text default '',
  message text default ''
);

alter table sound_events add column if not exists played_at timestamptz;

create index if not exists sound_events_station_broadcast_pending_idx
on sound_events (station_id, broadcast_id, played_at, created_at);



-- ============================================================
-- merged from: supabase_sound_repeat_count_update.sql
-- ============================================================
-- 수동 사운드 반복 재생 카운트 컬럼
alter table sound_events add column if not exists repeat_total integer default 1;
alter table sound_events add column if not exists repeat_played integer default 0;

update sound_events
set repeat_total = coalesce(repeat_total, 1),
    repeat_played = coalesce(repeat_played, 0);

create index if not exists sound_events_repeat_idx
on sound_events (station_id, broadcast_id, status, played_at, repeat_played, created_at);

notify pgrst, 'reload schema';



-- ============================================================
-- merged from: supabase_sound_simple_update.sql
-- ============================================================
-- 수동 사운드 선택 필드 추가
alter table donations add column if not exists manual_sound_file text default '';
alter table donations add column if not exists manual_sound_title text default '';
