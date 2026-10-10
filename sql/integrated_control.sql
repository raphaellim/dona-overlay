-- Run after websocket_review.sql. Mode and participation belong to the current broadcast.
create table if not exists public.broadcast_collection_rules (
 station_id uuid not null references public.stations(id) on delete cascade,
 broadcast_id uuid not null references public.broadcasts(id) on delete cascade,
 config jsonb not null,
 primary key(station_id,broadcast_id)
);
alter table public.broadcast_collection_rules enable row level security;
revoke all on public.broadcast_collection_rules from anon,authenticated;
grant all on public.broadcast_collection_rules to service_role;
notify pgrst,'reload schema';
