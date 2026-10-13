-- 기존 설치 SQL 이후 실행. 모든 신규 테이블은 서비스 역할만 접근합니다.
create table if not exists public.station_operator_accounts (
 id uuid primary key default gen_random_uuid(), station_id uuid not null references public.stations(id) on delete cascade,
 username text not null, display_name text not null, password_hash text not null,
 permissions jsonb not null default '{}', enabled boolean not null default true,
 session_version integer not null default 1, created_at timestamptz not null default now(), unique(station_id,username)
);
create table if not exists public.station_operator_sessions (
 token_hash text primary key, station_id uuid not null references public.stations(id) on delete cascade,
 account_id uuid not null references public.station_operator_accounts(id) on delete cascade,
 session_version integer not null, expires_at timestamptz not null
);
create table if not exists public.station_operator_audit (
 id uuid primary key default gen_random_uuid(), station_id uuid not null references public.stations(id) on delete cascade,
 broadcast_id uuid, actor_id uuid, actor_name text not null, action text not null,
 status text not null default 'attempted', before_data jsonb, after_data jsonb,
 created_at timestamptz not null default now()
);
create table if not exists public.station_alert_preferences (
 station_id uuid primary key references public.stations(id) on delete cascade,
 toonie_mode text not null default 'native' check(toonie_mode in ('native','internal')),
 account_enabled boolean not null default true, duration_seconds integer not null default 8 check(duration_seconds between 3 and 30)
);
alter table public.station_operator_accounts enable row level security;
alter table public.station_operator_sessions enable row level security;
alter table public.station_operator_audit enable row level security;
alter table public.station_alert_preferences enable row level security;
revoke all on public.station_operator_accounts, public.station_operator_sessions, public.station_operator_audit, public.station_alert_preferences from anon, authenticated;
notify pgrst, 'reload schema';
alter table public.station_alert_preferences add column if not exists display_mode text not null default 'selected';
alter table public.station_alert_preferences add column if not exists selected_sections jsonb not null default '["account","creators"]';
notify pgrst, 'reload schema';
