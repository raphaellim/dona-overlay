-- Supabase SQL Editor에서 실행
create table if not exists public.donation_capture_candidates (
 id uuid primary key default gen_random_uuid(), station_id uuid not null references public.stations(id) on delete cascade,
 source text not null check(source in ('account','toonie')),event_id text not null,
 donor text not null,amount bigint not null check(amount>0),title text not null default '',message text not null default '',
 bank text not null default '',creator text not null default '',replay boolean not null default false,
 received_at timestamptz not null,created_at timestamptz not null default now(),status text not null default 'pending' check(status in ('pending','dismissed')),
 unique(station_id,source,event_id)
);
create index if not exists capture_pending_idx on public.donation_capture_candidates(station_id,source,status,received_at desc);
alter table public.donation_capture_candidates enable row level security;
grant all on public.donation_capture_candidates to service_role;
create table if not exists public.station_toonie_sources (
 station_id uuid primary key references public.stations(id) on delete cascade,widget_url text not null,updated_at timestamptz not null default now()
);
alter table public.station_toonie_sources enable row level security;
grant all on public.station_toonie_sources to service_role;
