-- Run once in Supabase SQL Editor before deploying this patch.
create table if not exists public.overlay_runtime_jobs (
 id bigint generated always as identity primary key,
 station text not null, broadcast text not null default '', kind text not null check(kind in ('chat','alert')),
 event_key text not null, payload jsonb not null,
 status text not null default 'pending' check(status in ('pending','claimed','started','done','failed')),
 owner text, lease_until timestamptz, attempts integer not null default 0,
 available_at timestamptz not null default now(), created_at timestamptz not null default now(), finished_at timestamptz,
 error text, unique(station,kind,event_key)
);
create index if not exists overlay_runtime_pending_idx on public.overlay_runtime_jobs(kind,status,available_at,id);
create table if not exists public.overlay_player_leases(station text primary key,owner text not null,expires_at timestamptz not null);
alter table public.overlay_runtime_jobs enable row level security;
alter table public.overlay_player_leases enable row level security;
revoke all on public.overlay_runtime_jobs,public.overlay_player_leases from anon,authenticated;
grant all on public.overlay_runtime_jobs,public.overlay_player_leases to service_role;
grant usage,select on sequence public.overlay_runtime_jobs_id_seq to service_role;
create or replace function public.overlay_claim_job(p_kind text,p_station text,p_owner text,p_broadcast text default '') returns jsonb
language plpgsql security definer set search_path=public as $$
declare j overlay_runtime_jobs; taken integer;
begin
 if p_kind='alert' then
  perform pg_advisory_xact_lock(hashtext('overlay-player:'||p_station));
  insert into overlay_player_leases values(p_station,p_owner,now()+interval '45 seconds')
  on conflict(station) do update set owner=excluded.owner,expires_at=excluded.expires_at
  where overlay_player_leases.owner=p_owner or overlay_player_leases.expires_at<now();
  get diagnostics taken=row_count;
  if taken=0 then return jsonb_build_object('busy',true); end if;
  -- Do not replay an alert after its playback was acknowledged as started.
  update overlay_runtime_jobs set status='failed',finished_at=now(),error='player disconnected after start'
   where station=p_station and kind='alert' and status='started' and lease_until<now();
 end if;
 select * into j from overlay_runtime_jobs where kind=p_kind
  and (p_station='' or station=p_station) and (p_broadcast='' or broadcast=p_broadcast)
  and ((status='pending' and available_at<=now()) or (status='claimed' and lease_until<now()))
  and attempts<3 and created_at>now()-interval '24 hours'
  order by id for update skip locked limit 1;
 if not found then return '{}'::jsonb; end if;
 if p_kind='alert' and exists(select 1 from overlay_runtime_jobs where station=p_station and kind='alert' and status in ('claimed','started') and lease_until>now()) then return jsonb_build_object('busy',true); end if;
 update overlay_runtime_jobs set status='claimed',owner=p_owner,lease_until=now()+interval '45 seconds',attempts=attempts+1 where id=j.id returning * into j;
 return to_jsonb(j);
end $$;
create or replace function public.overlay_touch_job(p_id bigint,p_station text,p_owner text,p_action text) returns boolean
language plpgsql security definer set search_path=public as $$
declare n integer;
begin
 if p_action not in ('heartbeat','start','done','failed') then raise exception 'invalid action'; end if;
 update overlay_runtime_jobs set lease_until=now()+interval '45 seconds',
 status=case when p_action='start' then 'started' when p_action in ('done','failed') then p_action else status end,
 finished_at=case when p_action in ('done','failed') then now() else finished_at end
 where id=p_id and station=p_station and owner=p_owner and status in ('claimed','started') and lease_until>now();
 get diagnostics n=row_count;
 if n>0 then update overlay_player_leases set expires_at=now()+interval '45 seconds' where station=p_station and owner=p_owner; end if;
 return n>0;
end $$;
create or replace function public.overlay_prune_jobs() returns void language plpgsql security definer set search_path=public as $$
begin
 update overlay_runtime_jobs set status='failed',finished_at=now(),error='worker disconnected after start' where kind='chat' and status='started' and lease_until<now();
 delete from overlay_runtime_jobs where id in(select id from overlay_runtime_jobs where (finished_at<now()-interval '7 days') or created_at<now()-interval '2 days' order by id limit 1000);
 delete from overlay_player_leases where expires_at<now()-interval '1 day';
end $$;
revoke all on function public.overlay_claim_job(text,text,text,text),public.overlay_touch_job(bigint,text,text,text),public.overlay_prune_jobs() from public,anon,authenticated;
grant execute on function public.overlay_claim_job(text,text,text,text),public.overlay_touch_job(bigint,text,text,text),public.overlay_prune_jobs() to service_role;
-- Manual entry idempotency: same request key cannot insert donations twice.
create table if not exists public.overlay_request_receipts(station text not null,request_key text not null,broadcast text not null,rows jsonb not null,created_at timestamptz not null default now(),primary key(station,request_key));
alter table public.overlay_request_receipts enable row level security;
revoke all on public.overlay_request_receipts from anon,authenticated;
grant all on public.overlay_request_receipts to service_role;
create or replace function public.overlay_insert_donations(p_station text,p_broadcast text,p_key text,p_rows jsonb,p_funding_id text default '',p_units numeric default 0) returns jsonb
language plpgsql security definer set search_path=public as $$
declare cached overlay_request_receipts; cols text; selected text; result jsonb; g jsonb; bucket jsonb; shared jsonb; fund jsonb; items jsonb; found_fund boolean;
begin
 if length(p_key)<8 or length(p_key)>100 or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)<1 or jsonb_array_length(p_rows)>50 then raise exception 'invalid donation request'; end if;
 perform pg_advisory_xact_lock(hashtext('donation-request:'||p_station||':'||p_key));
 select * into cached from overlay_request_receipts where station=p_station and request_key=p_key;
 if found then
  if cached.broadcast<>p_broadcast then raise exception 'request belongs to another broadcast'; end if;
  return jsonb_build_object('duplicate',true,'rows',cached.rows);
 end if;
 select string_agg(format('%I',k.key),',' order by k.key),string_agg(format('r.%I',k.key),',' order by k.key) into cols,selected
 from jsonb_object_keys(p_rows->0) k(key) join information_schema.columns c on c.table_schema='public' and c.table_name='donations' and c.column_name=k.key where k.key not in ('id','created_at');
 if cols is null then raise exception 'empty donation rows'; end if;
 execute format('with inserted as (insert into public.donations(%s) select %s from jsonb_populate_recordset(null::public.donations,$1) r returning *) select coalesce(jsonb_agg(to_jsonb(inserted)),''[]''::jsonb) from inserted',cols,selected) into result using p_rows;
 if p_funding_id<>'' then
  if p_units<0 then raise exception 'invalid funding units'; end if;
  select data::jsonb into g from settings where id=1 for update;
  if g is null then raise exception 'settings not initialized'; end if;
  bucket=coalesce(g->'stationSettings'->p_station,'{}'::jsonb);shared=coalesce(bucket->'_shared','{}'::jsonb);
  fund=coalesce(shared->'fundingData',g->'fundingData','{}'::jsonb);
  select coalesce(jsonb_agg(case when x->>'id'=p_funding_id then jsonb_set(x,'{current}',to_jsonb(coalesce((x->>'current')::numeric,0)+p_units)) else x end),'[]'::jsonb),coalesce(bool_or(x->>'id'=p_funding_id),false) into items,found_fund from jsonb_array_elements(coalesce(fund->'items','[]'::jsonb)) x;
  if not found_fund then raise exception 'funding target not found'; end if;
  fund=jsonb_set(fund,'{items}',items,true);
  g=jsonb_set(g,'{stationSettings}',coalesce(g->'stationSettings','{}'::jsonb)||jsonb_build_object(p_station,bucket||jsonb_build_object('_shared',shared||jsonb_build_object('fundingData',fund))),true);
  update settings set data=g,updated_at=now() where id=1;
 end if;
 insert into overlay_request_receipts(station,request_key,broadcast,rows) values(p_station,p_key,p_broadcast,result);
 return jsonb_build_object('duplicate',false,'rows',result);
end $$;
revoke all on function public.overlay_insert_donations(text,text,text,jsonb,text,numeric) from public,anon,authenticated;
grant execute on function public.overlay_insert_donations(text,text,text,jsonb,text,numeric) to service_role;
create or replace function public.overlay_preset_current(p_station text,p_broadcast text,p_creator text,p_preset text) returns numeric
language sql stable security definer set search_path=public as $$
 select coalesce(sum((case when c->>'side'='minus' then -1 else 1 end)*coalesce((c->>'count')::numeric,0)),0)
 from donations d cross join lateral jsonb_array_elements(coalesce(d.checks::jsonb,'[]'::jsonb)) c
 where d.station_id::text=p_station and d.broadcast_id::text=p_broadcast and d.creator=p_creator and c->>'presetId'=p_preset
$$;
revoke all on function public.overlay_preset_current(text,text,text,text) from public,anon,authenticated;
grant execute on function public.overlay_preset_current(text,text,text,text) to service_role;

create or replace function public.overlay_prune_receipts() returns void language sql security definer set search_path=public as $$
 delete from overlay_request_receipts where (station,request_key) in(select station,request_key from overlay_request_receipts where created_at<now()-interval '7 days' order by created_at limit 1000)
$$;
revoke all on function public.overlay_prune_receipts() from public,anon,authenticated;
grant execute on function public.overlay_prune_receipts() to service_role;
