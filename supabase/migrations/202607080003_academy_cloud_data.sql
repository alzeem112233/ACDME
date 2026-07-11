create table if not exists public.academy_cloud_data (
  academy_id text primary key,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists academy_cloud_data_updated_at_idx
  on public.academy_cloud_data (updated_at desc);

alter table public.academy_cloud_data enable row level security;

drop policy if exists "academy_cloud_data_public_select" on public.academy_cloud_data;
drop policy if exists "academy_cloud_data_public_insert" on public.academy_cloud_data;
drop policy if exists "academy_cloud_data_public_update" on public.academy_cloud_data;

create policy "academy_cloud_data_public_select"
  on public.academy_cloud_data
  for select
  using (true);

create policy "academy_cloud_data_public_insert"
  on public.academy_cloud_data
  for insert
  with check (true);

create policy "academy_cloud_data_public_update"
  on public.academy_cloud_data
  for update
  using (true)
  with check (true);
