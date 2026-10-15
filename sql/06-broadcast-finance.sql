-- Supabase SQL Editor: one-time finance tables and private receipt bucket.
create table if not exists public.broadcast_expenses (
 id uuid primary key default gen_random_uuid(),
 station_id uuid not null references public.stations(id) on delete cascade,
 broadcast_id uuid not null references public.broadcasts(id) on delete restrict,
 client_ref uuid not null,
 expense_date date not null,
 category text not null default '기타',
 title text not null,
 payee text not null default '',
 amount bigint not null check(amount>0 and amount<=100000000000),
 payment_method text not null default '계좌이체',
 evidence_ref text not null default '',
 memo text not null default '',
 revision integer not null default 1,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 voided_at timestamptz,
 void_reason text not null default '',
 unique(station_id,client_ref)
);
create index if not exists broadcast_expenses_scope on public.broadcast_expenses(station_id,broadcast_id,expense_date);
alter table public.broadcast_expenses enable row level security;
revoke all on public.broadcast_expenses from anon,authenticated;
grant all on public.broadcast_expenses to service_role;
create table if not exists public.broadcast_expense_attachments (
 id uuid primary key default gen_random_uuid(),
 station_id uuid not null references public.stations(id) on delete cascade,
 expense_id uuid not null references public.broadcast_expenses(id) on delete restrict,
 object_path text not null unique,
 file_name text not null,
 mime_type text not null,
 size_bytes integer not null,
 sha256 text not null,
 created_at timestamptz not null default now(),
 unique(expense_id,sha256)
);
alter table public.broadcast_expense_attachments enable row level security;
revoke all on public.broadcast_expense_attachments from anon,authenticated;
grant all on public.broadcast_expense_attachments to service_role;
-- No public bucket and no public read policy. Authorized server downloads use short signed URLs.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('broadcast-expense-receipts','broadcast-expense-receipts',false,8388608,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create table if not exists public.broadcast_settlement_deductions (
 id uuid primary key default gen_random_uuid(),
 station_id uuid not null references public.stations(id) on delete cascade,
 broadcast_id uuid not null references public.broadcasts(id) on delete restrict,
 client_ref uuid not null,
 creator text not null,
 deduction_date date not null,
 label text not null,
 amount bigint not null check(amount>0 and amount<=100000000000),
 memo text not null default '',
 revision integer not null default 1,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 voided_at timestamptz,
 void_reason text not null default '',
 unique(station_id,client_ref)
);
create index if not exists broadcast_deductions_scope on public.broadcast_settlement_deductions(station_id,broadcast_id,creator);
alter table public.broadcast_settlement_deductions enable row level security;
revoke all on public.broadcast_settlement_deductions from anon,authenticated;
grant all on public.broadcast_settlement_deductions to service_role;

-- Atomic claims prevent duplicate scheduled phrases across restarts/replicas.
create table if not exists public.broadcast_chat_schedule_claims (
 station_id uuid not null references public.stations(id) on delete cascade,
 broadcast_id uuid not null references public.broadcasts(id) on delete cascade,
 schedule_key text not null,
 slot bigint not null,
 claimed_at timestamptz not null default now(),
 primary key(station_id,broadcast_id,schedule_key,slot)
);
alter table public.broadcast_chat_schedule_claims enable row level security;
revoke all on public.broadcast_chat_schedule_claims from anon,authenticated;
grant all on public.broadcast_chat_schedule_claims to service_role;
