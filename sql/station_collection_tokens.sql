create table if not exists public.station_collection_tokens (
 station_id uuid primary key references public.stations(id) on delete cascade,
 token_hash text not null check(length(token_hash)=64),updated_at timestamptz not null default now()
);
alter table public.station_collection_tokens enable row level security;
revoke all on public.station_collection_tokens from anon,authenticated;
grant all on public.station_collection_tokens to service_role;
