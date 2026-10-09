create table if not exists public.station_bank_devices (
 id uuid primary key default gen_random_uuid(),station_id uuid references public.stations(id) on delete cascade,
 token_hash text not null unique check(length(token_hash)=64),pair_code text unique,pair_expires_at timestamptz,
 state text not null default 'pending' check(state in ('pending','linked','revoked')),
 device_name text not null default 'Android',enabled boolean not null default false,creator text not null default '',
 banks jsonb not null default '{}'::jsonb,listener_status text not null default '',last_result text not null default '',
 last_seen_at timestamptz,created_at timestamptz not null default now(),
 check(state <> 'linked' or station_id is not null)
);
alter table public.station_bank_devices enable row level security;
revoke all on public.station_bank_devices from anon,authenticated;
grant all on public.station_bank_devices to service_role;
create index if not exists station_bank_devices_station_idx on public.station_bank_devices(station_id);
notify pgrst, 'reload schema';
