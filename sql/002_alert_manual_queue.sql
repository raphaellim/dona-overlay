-- Apply after v6.16.6 SQL. No donations or financial tables are changed.
drop function if exists public.overlay_claim_job(text,text,text,text);
create or replace function public.overlay_claim_job(p_kind text,p_station text,p_owner text,p_broadcast text default '',p_manual_only boolean default false) returns jsonb
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
  and (not p_manual_only or payload->>'manualRelease'='true')
  and attempts<3 and created_at>now()-interval '24 hours'
  order by case when payload->>'manualRelease'='true' then 0 else 1 end,id for update skip locked limit 1;
 if not found then return '{}'::jsonb; end if;
 if p_kind='alert' and exists(select 1 from overlay_runtime_jobs where station=p_station and kind='alert' and status in ('claimed','started') and lease_until>now()) then return jsonb_build_object('busy',true); end if;
 update overlay_runtime_jobs set status='claimed',owner=p_owner,lease_until=now()+interval '45 seconds',attempts=attempts+1 where id=j.id returning * into j;
 return to_jsonb(j);
end $$;
revoke all on function public.overlay_claim_job(text,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.overlay_claim_job(text,text,text,text,boolean) to service_role;
