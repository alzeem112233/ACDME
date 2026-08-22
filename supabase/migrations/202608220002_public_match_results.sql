alter table if exists public.public_match_requests
  add column if not exists score_a integer,
  add column if not exists score_b integer,
  add column if not exists result_note text,
  add column if not exists result_recorded_by_academy_id text,
  add column if not exists result_recorded_by_academy_name text,
  add column if not exists result_recorded_at timestamptz;

create index if not exists public_match_requests_result_recorded_idx
  on public.public_match_requests (result_recorded_at desc)
  where result_recorded_at is not null;

drop policy if exists "public_match_requests_update_accept_or_own" on public.public_match_requests;

create policy "public_match_requests_update_accept_or_own"
  on public.public_match_requests
  for update
  using (
    public.qz_can_access_academy(academy_id)
    or public.qz_can_access_academy(accepted_by_academy_id)
    or (status = 'open' and public.qz_academy_id() is not null)
  )
  with check (
    public.qz_can_access_academy(academy_id)
    or public.qz_can_access_academy(accepted_by_academy_id)
  );
