create table if not exists public.platform_accounts (
  id text primary key,
  name text not null,
  phone text not null unique,
  role text not null,
  academy_id text not null,
  academy_name text not null,
  permissions text,
  password_hash text,
  password_status text,
  password_updated_at date,
  status text not null default 'نشط',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists platform_accounts_phone_idx
  on public.platform_accounts (phone);

create index if not exists platform_accounts_academy_id_idx
  on public.platform_accounts (academy_id);

alter table public.platform_accounts enable row level security;

drop policy if exists "platform_accounts_public_select" on public.platform_accounts;
drop policy if exists "platform_accounts_public_insert" on public.platform_accounts;
drop policy if exists "platform_accounts_public_update" on public.platform_accounts;

create policy "platform_accounts_public_select"
  on public.platform_accounts
  for select
  using (true);

create policy "platform_accounts_public_insert"
  on public.platform_accounts
  for insert
  with check (true);

create policy "platform_accounts_public_update"
  on public.platform_accounts
  for update
  using (true)
  with check (true);
