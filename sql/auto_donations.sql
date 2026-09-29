-- 기존 DB에 한 번 실행. 한 이벤트당 후원 한 건을 원자적으로 생성한다.
create table if not exists auto_donation_events (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references stations(id) on delete cascade,
  source text not null check (source in ('account', 'toonie')),
  event_id text not null,
  donation_id uuid references donations(id) on delete set null,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (station_id, source, event_id)
);
create index if not exists auto_donation_events_donation_id_idx on auto_donation_events(donation_id);
create table if not exists station_toonie_sources (
  station_id uuid primary key references stations(id) on delete cascade,
  widget_url text not null,
  updated_at timestamptz not null default now()
);
revoke all on station_toonie_sources from public, anon, authenticated;
grant all on station_toonie_sources to service_role;
-- 기존 설치에서도 삭제된 자동 후원이 재수신으로 되살아나지 않도록 이벤트를 보존한다.
alter table auto_donation_events alter column donation_id drop not null;
alter table auto_donation_events drop constraint if exists auto_donation_events_donation_id_fkey;
alter table auto_donation_events add constraint auto_donation_events_donation_id_fkey
  foreign key (donation_id) references donations(id) on delete set null;

create or replace function register_auto_donation(p_source text, p_event_id text, p_row jsonb, p_raw jsonb)
returns jsonb language plpgsql security invoker as $$
declare
  v_existing donations%rowtype;
  v_new donations%rowtype;
  v_station uuid := (p_row->>'station_id')::uuid;
  v_id uuid := gen_random_uuid();
begin
  if exists (select 1 from auto_donation_events e
    where e.station_id = v_station and e.source = p_source and e.event_id = p_event_id
      and e.donation_id is null) then
    return jsonb_build_object('duplicate', true, 'deleted', true);
  end if;
  select d.* into v_existing from auto_donation_events e
    join donations d on d.id = e.donation_id
    where e.station_id = v_station and e.source = p_source and e.event_id = p_event_id;
  if found then return jsonb_build_object('duplicate', true, 'donation', to_jsonb(v_existing)); end if;
  insert into donations(id, station_id, broadcast_id, donor, creator, process_type,
    account_amount, toonie_amount, total_amount, display_amount, smoke, nosmoke,
    eat, noeat, checks, result_label, memo)
  values(v_id, v_station, (p_row->>'broadcast_id')::uuid, p_row->>'donor', p_row->>'creator',
    p_row->>'process_type', (p_row->>'account_amount')::integer, (p_row->>'toonie_amount')::integer,
    (p_row->>'total_amount')::integer, p_row->>'display_amount', (p_row->>'smoke')::integer,
    (p_row->>'nosmoke')::integer, (p_row->>'eat')::integer, (p_row->>'noeat')::integer,
    p_row->'checks', p_row->>'result_label', p_row->>'memo') returning * into v_new;
  insert into auto_donation_events(station_id, source, event_id, donation_id, raw)
  values(v_station, p_source, p_event_id, v_id, coalesce(p_raw, '{}'::jsonb))
  on conflict (station_id, source, event_id) do nothing;
  if not found then
    delete from donations where id = v_id;
    select d.* into v_existing from auto_donation_events e
      join donations d on d.id = e.donation_id
      where e.station_id = v_station and e.source = p_source and e.event_id = p_event_id;
    return jsonb_build_object('duplicate', true, 'deleted', v_existing.id is null, 'donation', to_jsonb(v_existing));
  end if;
  return jsonb_build_object('duplicate', false, 'donation', to_jsonb(v_new));
end $$;
revoke all on function register_auto_donation(text,text,jsonb,jsonb) from public, anon, authenticated;
grant execute on function register_auto_donation(text,text,jsonb,jsonb) to service_role;
