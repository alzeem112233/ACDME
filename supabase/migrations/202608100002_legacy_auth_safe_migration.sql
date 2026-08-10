-- Safe legacy-auth transition for QZ ACADEMY.
-- This migration is intentionally non-destructive:
-- - It does not delete users, requests, accounts, or academy data.
-- - It keeps every existing role text exactly as stored.
-- - It adds metadata so the backend-auth flow can coexist with legacy rows.

alter table if exists public.platform_accounts
  add column if not exists role_key text,
  add column if not exists auth_provider text not null default 'legacy_sha256',
  add column if not exists legacy_auth_migrated_at timestamptz,
  add column if not exists auth_migration_note text;

alter table if exists public.registration_requests
  add column if not exists role_key text,
  add column if not exists auth_provider text not null default 'legacy_sha256',
  add column if not exists legacy_auth_migrated_at timestamptz,
  add column if not exists auth_migration_note text;

create table if not exists public.qz_auth_migration_audit (
  id uuid primary key default gen_random_uuid(),
  source_table text not null,
  source_id text not null,
  phone text,
  academy_id text,
  old_role text,
  role_key text,
  auth_provider text not null default 'legacy_sha256',
  action text not null,
  created_at timestamptz not null default now()
);

alter table public.qz_auth_migration_audit enable row level security;

drop policy if exists "qz_auth_migration_audit_service_only" on public.qz_auth_migration_audit;
create policy "qz_auth_migration_audit_service_only"
  on public.qz_auth_migration_audit
  for all
  using (false)
  with check (false);

create or replace function public.qz_role_key(role_text text)
returns text
language sql
immutable
as $$
  select case
    when role_text is null or btrim(role_text) = '' then 'coach'
    when lower(btrim(role_text)) in ('super_admin', 'super admin') then 'super_admin'
    when btrim(role_text) in (U&'\0633\0648\0628\0631 \0623\062F\0645\064A\0646') then 'super_admin'
    when lower(btrim(role_text)) in ('academy_owner', 'owner') then 'academy_owner'
    when btrim(role_text) in (U&'\0645\0627\0644\0643 \0623\0643\0627\062F\064A\0645\064A\0629') then 'academy_owner'
    when lower(btrim(role_text)) in ('admin', 'administrator') then 'admin'
    when btrim(role_text) in (U&'\0645\062F\064A\0631', U&'\0625\062F\0627\0631\064A', U&'\0625\062F\0627\0631\064A \0641\0631\064A\0642') then 'admin'
    when lower(btrim(role_text)) in ('coach', 'assistant_coach') then 'coach'
    when btrim(role_text) in (U&'\0645\062F\0631\0628', U&'\0645\0633\0627\0639\062F \0645\062F\0631\0628', U&'\0645\062F\0631\0628 \0631\0626\064A\0633\064A') then 'coach'
    else lower(regexp_replace(btrim(role_text), '\s+', '_', 'g'))
  end
$$;

update public.platform_accounts
set
  role_key = coalesce(role_key, public.qz_role_key(role)),
  auth_provider = coalesce(nullif(auth_provider, ''), 'legacy_sha256'),
  legacy_auth_migrated_at = coalesce(legacy_auth_migrated_at, now()),
  auth_migration_note = coalesce(auth_migration_note, 'Legacy account preserved for backend authentication.')
where legacy_auth_migrated_at is null
   or role_key is null
   or auth_provider is null
   or auth_provider = '';

update public.registration_requests
set
  role_key = coalesce(role_key, 'academy_owner'),
  auth_provider = coalesce(nullif(auth_provider, ''), 'legacy_sha256'),
  legacy_auth_migrated_at = coalesce(legacy_auth_migrated_at, now()),
  auth_migration_note = coalesce(auth_migration_note, 'Legacy registration request preserved for backend authentication.')
where legacy_auth_migrated_at is null
   or role_key is null
   or auth_provider is null
   or auth_provider = '';

insert into public.qz_auth_migration_audit (
  source_table,
  source_id,
  phone,
  academy_id,
  old_role,
  role_key,
  auth_provider,
  action
)
select
  'platform_accounts',
  id,
  phone,
  academy_id,
  role,
  role_key,
  auth_provider,
  'legacy_auth_preserved'
from public.platform_accounts
where not exists (
  select 1
  from public.qz_auth_migration_audit audit
  where audit.source_table = 'platform_accounts'
    and audit.source_id = public.platform_accounts.id
    and audit.action = 'legacy_auth_preserved'
);

insert into public.qz_auth_migration_audit (
  source_table,
  source_id,
  phone,
  academy_id,
  old_role,
  role_key,
  auth_provider,
  action
)
select
  'registration_requests',
  id::text,
  coalesce(phone, contact),
  academy_id,
  'مالك أكاديمية',
  role_key,
  auth_provider,
  'legacy_auth_preserved'
from public.registration_requests
where not exists (
  select 1
  from public.qz_auth_migration_audit audit
  where audit.source_table = 'registration_requests'
    and audit.source_id = public.registration_requests.id::text
    and audit.action = 'legacy_auth_preserved'
);

create index if not exists platform_accounts_role_key_idx
  on public.platform_accounts (role_key);

create index if not exists registration_requests_role_key_idx
  on public.registration_requests (role_key);

create index if not exists qz_auth_migration_audit_source_idx
  on public.qz_auth_migration_audit (source_table, source_id);
