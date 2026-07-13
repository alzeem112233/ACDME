-- QZ Academy security hardening.
-- This keeps the current public API flow working while adding database-level
-- guarantees against duplicate accounts and duplicate academy cloud rows.

alter table if exists public.registration_requests enable row level security;
alter table if exists public.platform_accounts enable row level security;
alter table if exists public.academy_cloud_data enable row level security;

do $$
begin
  if to_regclass('public.registration_requests_phone_unique_idx') is null
    and not exists (
      select 1
      from public.registration_requests
      where phone is not null and phone <> ''
      group by phone
      having count(*) > 1
    )
  then
    create unique index registration_requests_phone_unique_idx
      on public.registration_requests (phone)
      where phone is not null and phone <> '';
  end if;
end $$;

do $$
begin
  if to_regclass('public.platform_accounts_phone_unique_idx') is null
    and not exists (
      select 1
      from public.platform_accounts
      where phone is not null and phone <> ''
      group by phone
      having count(*) > 1
    )
  then
    create unique index platform_accounts_phone_unique_idx
      on public.platform_accounts (phone)
      where phone is not null and phone <> '';
  end if;
end $$;

create index if not exists platform_accounts_academy_status_idx
  on public.platform_accounts (academy_id, status);

create index if not exists registration_requests_status_created_idx
  on public.registration_requests (status, created_at desc);

do $$
begin
  if to_regclass('public.registration_requests_active_academy_name_unique_idx') is null
    and not exists (
      select 1
      from public.registration_requests
      where academy_name is not null and btrim(academy_name) <> '' and status <> 'rejected'
      group by lower(btrim(academy_name))
      having count(*) > 1
    )
  then
    create unique index registration_requests_active_academy_name_unique_idx
      on public.registration_requests (lower(btrim(academy_name)))
      where academy_name is not null and btrim(academy_name) <> '' and status <> 'rejected';
  end if;
end $$;

create or replace function public.enforce_platform_accounts_limit()
returns trigger
language plpgsql
as $$
begin
  if (
    select count(*)
    from public.platform_accounts
    where academy_id = new.academy_id
      and id <> coalesce(new.id, '')
  ) >= 3 then
    raise exception 'لا يمكن ربط أكثر من 3 حسابات بنفس الأكاديمية.';
  end if;

  return new;
end;
$$;

drop trigger if exists platform_accounts_limit_trigger on public.platform_accounts;
create trigger platform_accounts_limit_trigger
  before insert or update of academy_id on public.platform_accounts
  for each row
  execute function public.enforce_platform_accounts_limit();

create or replace function public.enforce_platform_academy_name_unique()
returns trigger
language plpgsql
as $$
begin
  if new.academy_name is not null
    and btrim(new.academy_name) <> ''
    and exists (
      select 1
      from public.platform_accounts
      where lower(btrim(academy_name)) = lower(btrim(new.academy_name))
        and academy_id <> new.academy_id
      limit 1
    )
  then
    raise exception 'اسم الأكاديمية مستخدم من حساب آخر.';
  end if;

  return new;
end;
$$;

drop trigger if exists platform_academy_name_unique_trigger on public.platform_accounts;
create trigger platform_academy_name_unique_trigger
  before insert or update of academy_name, academy_id on public.platform_accounts
  for each row
  execute function public.enforce_platform_academy_name_unique();

comment on table public.academy_cloud_data is
  'Stores one cloud snapshot per academy. Client backups include a SHA-256 checksum before restore.';

comment on table public.platform_accounts is
  'Platform login accounts. Phone uniqueness is enforced at database level.';

comment on table public.registration_requests is
  'New academy registration requests. Phone uniqueness is enforced at database level.';
