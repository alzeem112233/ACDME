alter table public.registration_requests
  add column if not exists phone text,
  add column if not exists password_hash text;

create index if not exists registration_requests_phone_idx
  on public.registration_requests (phone);

drop policy if exists "registration_requests_public_insert" on public.registration_requests;
drop policy if exists "registration_requests_public_select" on public.registration_requests;
drop policy if exists "registration_requests_public_update" on public.registration_requests;

create policy "registration_requests_public_insert"
  on public.registration_requests
  for insert
  with check (true);

create policy "registration_requests_public_select"
  on public.registration_requests
  for select
  using (true);

create policy "registration_requests_public_update"
  on public.registration_requests
  for update
  using (true)
  with check (true);
