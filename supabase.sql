-- dona-overlay Supabase SQL schema with broadcast sessions

create table if not exists settings (
  id integer primary key default 1,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

insert into settings (id, data)
values (
  1,
  '{
    "title": "도네이터 현황",
    "titleImage": "",
    "notice": "",
    "columns": 4,
    "maxCreators": 12,
    "creators": ["빵떠기", "또영", "수박", "몰라", "익명"],
    "presets": [
      {
        "id": "smoke",
        "enabled": true,
        "title": "펴피지마",
        "plusName": "흡연",
        "plusPrice": 11900,
        "minusName": "금연",
        "minusPrice": 12000
      },
      {
        "id": "food",
        "enabled": true,
        "title": "먹먹마",
        "plusName": "먹어",
        "plusPrice": 14000,
        "minusName": "먹지마",
        "minusPrice": 15000
      }
    ]
  }'::jsonb
)
on conflict (id) do nothing;

create table if not exists broadcasts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  is_active boolean default false,
  created_at timestamptz default now(),
  ended_at timestamptz,
  memo text default ''
);

create table if not exists donations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),

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

-- 기존 테이블에서 업그레이드할 때 필요한 컬럼 보강
alter table donations add column if not exists broadcast_id uuid references broadcasts(id) on delete set null;
alter table broadcasts add column if not exists ended_at timestamptz;
alter table broadcasts add column if not exists memo text default '';

create index if not exists donations_created_at_idx on donations (created_at desc);
create index if not exists donations_creator_idx on donations (creator);
create index if not exists donations_donor_idx on donations (donor);
create index if not exists donations_broadcast_id_idx on donations (broadcast_id);
create index if not exists broadcasts_active_idx on broadcasts (is_active);

-- 기본 방송이 하나도 없으면 생성
insert into broadcasts (title, is_active)
select '기본방송', true
where not exists (select 1 from broadcasts);

-- broadcasts can be deleted from control.html; related donations are deleted by server first.
