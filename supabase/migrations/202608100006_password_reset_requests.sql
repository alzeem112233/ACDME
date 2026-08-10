-- Manual password reset fallback when WhatsApp Business delivery is not configured.

create table if not exists public.password_reset_requests (
  id uuid primary key default gen_random_uuid(),
  phone_e164 text not null,
  status text not null default 'pending' check (status in ('pending', 'handled', 'dismissed')),
  delivery_channel text not null default 'manual',
  note text,
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.password_reset_requests enable row level security;

drop policy if exists "password_reset_requests_public_insert" on public.password_reset_requests;
drop policy if exists "password_reset_requests_public_select" on public.password_reset_requests;
drop policy if exists "password_reset_requests_public_update" on public.password_reset_requests;

create policy "password_reset_requests_public_insert"
  on public.password_reset_requests
  for insert
  with check (true);

create policy "password_reset_requests_public_select"
  on public.password_reset_requests
  for select
  using (true);

create policy "password_reset_requests_public_update"
  on public.password_reset_requests
  for update
  using (true)
  with check (true);

create index if not exists password_reset_requests_status_created_idx
  on public.password_reset_requests (status, created_at desc);

create index if not exists password_reset_requests_phone_status_idx
  on public.password_reset_requests (phone_e164, status);

do $$
begin
  if to_regclass('public.password_reset_requests_pending_phone_unique_idx') is null
    and not exists (
      select 1
      from public.password_reset_requests
      where status = 'pending'
      group by phone_e164
      having count(*) > 1
    ) then
    create unique index password_reset_requests_pending_phone_unique_idx
      on public.password_reset_requests (phone_e164)
      where status = 'pending';
  end if;
end;
$$;

comment on table public.password_reset_requests is
  'Password reset assistance requests shown in the platform dashboard when WhatsApp delivery is not configured.';
