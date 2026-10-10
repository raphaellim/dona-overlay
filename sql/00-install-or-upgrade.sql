-- capture_test.sql
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


-- station_collection_tokens.sql
create table if not exists public.station_collection_tokens (
 station_id uuid primary key references public.stations(id) on delete cascade,
 token_hash text not null check(length(token_hash)=64),updated_at timestamptz not null default now()
);
alter table public.station_collection_tokens enable row level security;
revoke all on public.station_collection_tokens from anon,authenticated;
grant all on public.station_collection_tokens to service_role;


-- bank_devices.sql
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


-- websocket_review.sql
-- Run after capture_test.sql, station_collection_tokens.sql and bank_devices.sql.
create table if not exists public.station_collection_rules (
 station_id uuid primary key references public.stations(id) on delete cascade,
 config jsonb not null default '{"mode":"collab","targets":[]}'::jsonb
);
alter table public.station_collection_rules enable row level security;
revoke all on public.station_collection_rules from anon,authenticated;
grant all on public.station_collection_rules to service_role;
alter table public.donation_capture_candidates add column if not exists vip text not null default '';
alter table public.donation_capture_candidates add column if not exists routing jsonb not null default '{}'::jsonb;
alter table public.donation_capture_candidates add column if not exists applied_at timestamptz;
alter table public.donation_capture_candidates add column if not exists broadcast_id uuid references public.broadcasts(id);
alter table public.donation_capture_candidates drop constraint if exists donation_capture_candidates_status_check;
alter table public.donation_capture_candidates add constraint donation_capture_candidates_status_check check(status in ('pending','hold','dismissed','applied'));
-- Row lock, split inserts and status update are one transaction. ACK retries cannot reapply.
create or replace function public.apply_collection_candidate(p_id uuid,p_station uuid,p_broadcast uuid,p_rows jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare c public.donation_capture_candidates; r jsonb; outrows jsonb := '[]'; saved jsonb; split bigint;
begin
 select * into c from public.donation_capture_candidates where id=p_id and station_id=p_station for update;
 if not found then raise exception '수집 내역 없음'; end if;
 if c.status='applied' then return jsonb_build_object('ok',true,'duplicate',true); end if;
 if c.status not in ('pending','hold') then raise exception '삭제된 내역'; end if;
 if c.broadcast_id is distinct from p_broadcast then raise exception '수집 당시 방송과 현재 방송이 다름'; end if;
 if not exists(select 1 from broadcasts where id=p_broadcast and station_id=p_station and is_active=true) then raise exception '현재 방송 확인 필요'; end if;
 if jsonb_array_length(p_rows)<1 or jsonb_array_length(p_rows)>50 then raise exception '분배 대상 확인 필요'; end if;
 select sum((v->>'total_amount')::bigint) into split from jsonb_array_elements(p_rows) v;
 if split<>c.amount then raise exception '총액과 분배 불일치'; end if;
 for r in select value from jsonb_array_elements(p_rows) loop
   if (r->>'station_id')::uuid<>p_station or (r->>'broadcast_id')::uuid<>p_broadcast or (r->>'total_amount')::bigint<=0 then raise exception '방송국 또는 금액 오류'; end if;
   insert into public.donations(station_id,broadcast_id,donor,creator,process_type,account_amount,toonie_amount,total_amount,display_amount,smoke,nosmoke,eat,noeat,checks,result_label,memo)
   values(p_station,p_broadcast,r->>'donor',r->>'creator',r->>'process_type',(r->>'account_amount')::bigint,(r->>'toonie_amount')::bigint,(r->>'total_amount')::bigint,r->>'display_amount',(r->>'smoke')::numeric,(r->>'nosmoke')::numeric,(r->>'eat')::numeric,(r->>'noeat')::numeric,r->'checks',r->>'result_label',r->>'memo') returning to_jsonb(donations.*) into saved;
   outrows:=outrows||jsonb_build_array(saved);
 end loop;
 update public.donation_capture_candidates set status='applied',applied_at=now() where id=c.id;
 return jsonb_build_object('ok',true,'donations',outrows);
end $$;
revoke all on function public.apply_collection_candidate(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.apply_collection_candidate(uuid,uuid,uuid,jsonb) to service_role;
notify pgrst,'reload schema';


-- integrated_control.sql
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
