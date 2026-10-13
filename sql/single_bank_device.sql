-- 방송국별 계좌 수집 기기는 최대 한 대. 기존 bank_devices.sql 설치 후 실행.
-- 동일 모델명이 아니라 방송국의 유일한 수집 연결을 기준으로 처리합니다.
-- 기존 후원 내역과 기기 등록 이력은 삭제하지 않습니다.
begin;
lock table public.station_bank_devices in share row exclusive mode;

-- 이미 중복된 연결은 마지막으로 실제 동기화한 기기를 유지합니다.
with ranked as (
 select id,row_number() over (
  partition by station_id
  order by coalesce(last_seen_at,created_at) desc,created_at desc,id desc
 ) as position
 from public.station_bank_devices where state='linked'
)
update public.station_bank_devices d
set state='revoked',enabled=false,pair_code=null,pair_expires_at=null
from ranked r where d.id=r.id and r.position>1;

-- 승인 코드 API 외에 관리자 앱 로그인 등의 연결 경로에도 동일하게 적용.
create or replace function public.enforce_single_bank_device()
returns trigger language plpgsql security definer
set search_path=public,pg_temp as $$
begin
 if new.state <> 'linked' then return new; end if;
 if new.station_id is null then
  raise exception '연결할 방송국이 필요합니다.' using errcode='23514';
 end if;
 -- 동일 방송국에 대한 동시 승인·연결 교체를 직렬화합니다.
 perform 1 from public.stations where id=new.station_id for update;
 if not found then raise exception '방송국이 없습니다.' using errcode='23503'; end if;
 update public.station_bank_devices
 set state='revoked',enabled=false,pair_code=null,pair_expires_at=null
 where station_id=new.station_id and state='linked' and id<>new.id;
 return new;
end;
$$;
revoke all on function public.enforce_single_bank_device() from public,anon,authenticated;
grant execute on function public.enforce_single_bank_device() to service_role;
drop trigger if exists station_bank_device_single_connection on public.station_bank_devices;
create trigger station_bank_device_single_connection
before insert or update of state,station_id on public.station_bank_devices
for each row execute function public.enforce_single_bank_device();

create unique index if not exists station_bank_devices_one_linked_station
on public.station_bank_devices(station_id) where state='linked';
commit;
notify pgrst,'reload schema';
-- 확인: 결과가 비어 있으면 정상입니다.
select station_id,count(*) from public.station_bank_devices
where state='linked' group by station_id having count(*)>1;
