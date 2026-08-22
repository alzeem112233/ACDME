create table if not exists public.public_match_requests (
  id text primary key,
  academy_id text not null,
  academy_name text not null,
  captain_name text not null,
  venue text not null,
  location_url text,
  category_ids jsonb not null default '[]'::jsonb,
  category_names jsonb not null default '[]'::jsonb,
  match_date date not null,
  start_time time without time zone not null,
  end_time time without time zone not null,
  status text not null default 'open',
  accepted_by_academy_id text,
  accepted_by_academy_name text,
  accepted_by_captain_name text,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists public_match_requests_status_date_idx
  on public.public_match_requests (status, match_date desc, created_at desc);

create index if not exists public_match_requests_academy_idx
  on public.public_match_requests (academy_id);

alter table public.public_match_requests enable row level security;

drop policy if exists "public_match_requests_select_all" on public.public_match_requests;
drop policy if exists "public_match_requests_insert_own" on public.public_match_requests;
drop policy if exists "public_match_requests_update_accept_or_own" on public.public_match_requests;
drop policy if exists "public_match_requests_delete_own" on public.public_match_requests;

create policy "public_match_requests_select_all"
  on public.public_match_requests
  for select
  using (true);

create policy "public_match_requests_insert_own"
  on public.public_match_requests
  for insert
  with check (public.qz_can_access_academy(academy_id));

create policy "public_match_requests_update_accept_or_own"
  on public.public_match_requests
  for update
  using (
    public.qz_can_access_academy(academy_id)
    or (status = 'open' and public.qz_academy_id() is not null)
  )
  with check (
    public.qz_can_access_academy(academy_id)
    or public.qz_can_access_academy(accepted_by_academy_id)
  );

create policy "public_match_requests_delete_own"
  on public.public_match_requests
  for delete
  using (public.qz_can_access_academy(academy_id) or public.qz_is_super_admin());

grant select, insert, update, delete on table public.public_match_requests to anon, authenticated;

comment on table public.public_match_requests is
  'Public academy match challenges shown to all online academy users.';
