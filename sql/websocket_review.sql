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
