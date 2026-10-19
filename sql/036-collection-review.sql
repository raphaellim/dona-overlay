-- v6.16.8.36: additive migration only. Does not reset media, alert rules or groups.
alter table public.donation_capture_candidates add column if not exists revision integer not null default 0;
create table if not exists public.collection_correction_audit(
 id uuid primary key default gen_random_uuid(),station_id uuid not null,broadcast_id uuid not null,candidate_id uuid not null,
 request_key text not null,actor text not null,before_data jsonb not null,after_data jsonb not null,created_at timestamptz not null default now(),
 unique(station_id,request_key)
);
alter table public.collection_correction_audit enable row level security;
revoke all on public.collection_correction_audit from anon,authenticated;
grant all on public.collection_correction_audit to service_role;
create or replace function public.review_collection_candidate_v36(p_id uuid,p_station uuid,p_broadcast uuid,p_rows jsonb,p_routing jsonb,p_revision integer,p_request text,p_actor text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare c donation_capture_candidates; oldrows jsonb; saved jsonb; outrows jsonb='[]'; r jsonb; total numeric; slug text; g jsonb; bucket jsonb; shared jsonb; fund jsonb; items jsonb; oldfund text=''; newfund text=''; oldunits numeric=0; newunits numeric=0; fid text; delta numeric; foundfund boolean; wasapplied boolean;
begin
 select * into c from donation_capture_candidates where id=p_id and station_id=p_station for update;
 if not found then raise exception '수집 내역 없음'; end if;
 if c.broadcast_id is distinct from p_broadcast then raise exception '수집 당시 방송과 현재 방송이 다름'; end if;
 wasapplied=c.status='applied';
 if wasapplied and p_revision is null then return jsonb_build_object('ok',true,'duplicate',true); end if;
 if p_revision is not null and exists(select 1 from collection_correction_audit where station_id=p_station and request_key=p_request and candidate_id=p_id) then return jsonb_build_object('ok',true,'duplicate',true);end if;
 if c.status not in ('pending','hold','applied') then raise exception '제외된 내역';end if;
 if wasapplied and (c.revision<>p_revision or length(p_request)<8 or length(p_request)>100) then raise exception '다른 창에서 변경되었습니다. 내역을 다시 여세요';end if;
 if not exists(select 1 from broadcasts where id=p_broadcast and station_id=p_station and is_active=true) then raise exception '현재 방송 확인 필요';end if;
 if c.source='account' and c.amount<1000 then raise exception '계좌 1,000원 미만 제외';end if;
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)<1 or jsonb_array_length(p_rows)>50 then raise exception '분배 대상 확인 필요';end if;
 select sum((v->>'total_amount')::numeric) into total from jsonb_array_elements(p_rows) v;
 if total is distinct from c.amount::numeric then raise exception '총액과 분배 불일치';end if;
 select coalesce(jsonb_agg(to_jsonb(d)),'[]') into oldrows from donations d where d.station_id=p_station and d.broadcast_id=p_broadcast and exists(select 1 from jsonb_array_elements(d.checks) m where m->>'captureId'=p_id::text and m->>'meta'='true');
 if wasapplied and jsonb_array_length(oldrows)=0 then raise exception '기존 반영 내역을 찾을 수 없습니다. 안전한 자동 수정 불가';end if;
 if wasapplied then
  select m->>'fundingId' into oldfund from jsonb_array_elements(oldrows) d cross join lateral jsonb_array_elements(d->'checks') m where coalesce(m->>'fundingId','')<>'' limit 1;
  if coalesce(oldfund,'')<>'' then
   if (select count(distinct m->>'fundingId') from jsonb_array_elements(oldrows) d cross join lateral jsonb_array_elements(d->'checks') m where coalesce(m->>'fundingId','')<>'')>1 then raise exception '기존 펀딩 연결이 여러 개여서 안전한 자동 수정 불가';end if;
   select (m->>'fundingUnits')::numeric into oldunits from jsonb_array_elements(oldrows) d cross join lateral jsonb_array_elements(d->'checks') m where m->>'fundingId'=oldfund and m ? 'fundingUnits' limit 1;
   if oldunits is null then
    if not (c.routing ? 'fundingExactWon') then raise exception '기존 펀딩의 반영 단위 정보가 없어 자동 수정 불가. 기존 반영 금액 확인 필요';end if;
    oldunits=case when coalesce((c.routing->>'fundingExactWon')::boolean,false) then c.amount::numeric/10000 else floor(c.amount::numeric/10000) end;
   end if;
   if oldunits<0 then raise exception '기존 펀딩 반영 금액 오류';end if;
  end if;
 end if;
 newfund=coalesce(p_routing->>'fundingId','');
 if newfund<>'' then newunits=case when coalesce((p_routing->>'fundingExactWon')::boolean,false) then c.amount::numeric/10000 else floor(c.amount::numeric/10000) end;end if;
 if coalesce(oldfund,'')<>'' or newfund<>'' then
  select s.slug into slug from stations s where s.id=p_station;
  select data::jsonb into g from settings where id=1 for update;
  if g is null then raise exception '설정 데이터 없음';end if;
  bucket=coalesce(g->'stationSettings'->slug,'{}');shared=coalesce(bucket->'_shared','{}');fund=coalesce(shared->'fundingData',g->'fundingData','{}');items=coalesce(fund->'items','[]');
  for fid in select distinct x from unnest(array[coalesce(oldfund,''),newfund]) x where x<>'' loop
   delta=(case when fid=newfund then newunits else 0 end)-(case when fid=oldfund then oldunits else 0 end);
   select coalesce(bool_or(x->>'id'=fid),false) into foundfund from jsonb_array_elements(items) x;
   if not foundfund then raise exception '기존 또는 신규 펀딩 대상이 없습니다. 펀딩을 복구한 뒤 수정하세요';end if;
   if exists(select 1 from jsonb_array_elements(items) x where x->>'id'=fid and coalesce((x->>'current')::numeric,0)+delta<0) then raise exception '펀딩 잔액이 수정 취소 금액보다 작습니다';end if;
   select jsonb_agg(case when x->>'id'=fid then jsonb_set(x,'{current}',to_jsonb(coalesce((x->>'current')::numeric,0)+delta)) else x end) into items from jsonb_array_elements(items) x;
  end loop;
  fund=jsonb_set(fund,'{items}',items,true);
  g=jsonb_set(g,'{stationSettings}',coalesce(g->'stationSettings','{}')||jsonb_build_object(slug,bucket||jsonb_build_object('_shared',shared||jsonb_build_object('fundingData',fund))),true);
  update settings set data=g,updated_at=now() where id=1;
 end if;
 if wasapplied then delete from donations d where d.station_id=p_station and d.broadcast_id=p_broadcast and exists(select 1 from jsonb_array_elements(d.checks) m where m->>'captureId'=p_id::text and m->>'meta'='true');end if;
 for r in select value from jsonb_array_elements(p_rows) loop
  if (r->>'station_id')::uuid is distinct from p_station or (r->>'broadcast_id')::uuid is distinct from p_broadcast or (r->>'total_amount')::numeric<=0 or coalesce(r->>'donor','')='' or coalesce(r->>'creator','')='' then raise exception '방송국·후원자·대상 오류';end if;
  if (c.source='account' and ((r->>'account_amount')::numeric<>(r->>'total_amount')::numeric or (r->>'toonie_amount')::numeric<>0)) or (c.source='toonie' and ((r->>'toonie_amount')::numeric<>(r->>'total_amount')::numeric or (r->>'account_amount')::numeric<>0)) then raise exception '출처별 금액 오류';end if;
  if not exists(select 1 from jsonb_array_elements(r->'checks') m where m->>'captureId'=p_id::text and m->>'meta'='true') then raise exception '수집 연결 정보 없음';end if;
  insert into donations(station_id,broadcast_id,created_at,donor,creator,process_type,account_amount,toonie_amount,total_amount,display_amount,smoke,nosmoke,eat,noeat,checks,result_label,memo)
  values(p_station,p_broadcast,coalesce((oldrows->0->>'created_at')::timestamptz,now()),r->>'donor',r->>'creator',r->>'process_type',(r->>'account_amount')::bigint,(r->>'toonie_amount')::bigint,(r->>'total_amount')::bigint,r->>'display_amount',(r->>'smoke')::numeric,(r->>'nosmoke')::numeric,(r->>'eat')::numeric,(r->>'noeat')::numeric,r->'checks',r->>'result_label',r->>'memo') returning to_jsonb(donations.*) into saved;
  outrows=outrows||jsonb_build_array(saved);
 end loop;
 update donation_capture_candidates set status='applied',routing=p_routing||jsonb_build_object('state','applied'),applied_at=coalesce(applied_at,now()),revision=revision+1 where id=p_id;
 if wasapplied then insert into collection_correction_audit(station_id,broadcast_id,candidate_id,request_key,actor,before_data,after_data) values(p_station,p_broadcast,p_id,p_request,p_actor,jsonb_build_object('candidate',to_jsonb(c),'donations',oldrows),jsonb_build_object('routing',p_routing,'donations',outrows));end if;
 return jsonb_build_object('ok',true,'duplicate',false,'donations',outrows,'revision',c.revision+1);
end $$;
revoke all on function public.review_collection_candidate_v36(uuid,uuid,uuid,jsonb,jsonb,integer,text,text) from public,anon,authenticated;
grant execute on function public.review_collection_candidate_v36(uuid,uuid,uuid,jsonb,jsonb,integer,text,text) to service_role;
notify pgrst,'reload schema';
