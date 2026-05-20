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
