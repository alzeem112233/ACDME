-- Normalize account phone numbers to an international E.164-like value.
-- Existing accounts are preserved; new inserts/updates are cleaned before save.

create or replace function public.qz_normalize_phone(raw_phone text)
returns text
language plpgsql
immutable
as $$
declare
  raw text;
  digits text;
begin
  raw := translate(
    coalesce(raw_phone, ''),
    '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹',
    '01234567890123456789'
  );
  raw := btrim(raw);

  if raw = '' then
    return null;
  end if;

  raw := regexp_replace(raw, '[[:space:]\-()._/\\]+', '', 'g');

  if raw like '+%' then
    digits := regexp_replace(substr(raw, 2), '[^0-9]', '', 'g');
    if digits = '' then
      return null;
    end if;
    return '+' || digits;
  end if;

  digits := regexp_replace(raw, '[^0-9]', '', 'g');
  if digits = '' then
    return null;
  end if;

  if digits like '00%' then
    return '+' || substr(digits, 3);
  end if;

  if digits like '967%' then
    return '+' || digits;
  end if;

  if digits like '0%' then
    return '+967' || substr(digits, 2);
  end if;

  if digits like '7%' then
    return '+967' || digits;
  end if;

  return '+' || digits;
end;
$$;

alter table if exists public.platform_accounts
  add column if not exists phone_e164 text;

alter table if exists public.registration_requests
  add column if not exists phone_e164 text;

update public.platform_accounts
set
  phone_e164 = public.qz_normalize_phone(phone),
  phone = coalesce(public.qz_normalize_phone(phone), phone)
where phone is not null;

update public.registration_requests
set
  phone_e164 = public.qz_normalize_phone(coalesce(phone, contact)),
  phone = coalesce(public.qz_normalize_phone(coalesce(phone, contact)), phone),
  contact = coalesce(public.qz_normalize_phone(coalesce(phone, contact)), contact)
where coalesce(phone, contact) is not null;

create or replace function public.qz_prepare_platform_account_phone()
returns trigger
language plpgsql
as $$
begin
  new.phone_e164 := public.qz_normalize_phone(new.phone);

  if new.phone_e164 is not null then
    new.phone := new.phone_e164;

    if exists (
      select 1
      from public.platform_accounts existing
      where existing.phone_e164 = new.phone_e164
        and existing.id <> new.id
    ) then
      raise unique_violation using message = 'Phone number is already used by another account.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists qz_prepare_platform_account_phone_trigger on public.platform_accounts;
create trigger qz_prepare_platform_account_phone_trigger
  before insert or update of phone, phone_e164 on public.platform_accounts
  for each row
  execute function public.qz_prepare_platform_account_phone();

create or replace function public.qz_prepare_registration_request_phone()
returns trigger
language plpgsql
as $$
begin
  new.phone_e164 := public.qz_normalize_phone(coalesce(new.phone, new.contact));

  if new.phone_e164 is not null then
    new.phone := new.phone_e164;
    new.contact := new.phone_e164;

    if coalesce(new.status, 'pending') <> 'rejected'
      and exists (
        select 1
        from public.registration_requests existing
        where existing.phone_e164 = new.phone_e164
          and existing.id <> new.id
          and coalesce(existing.status, 'pending') <> 'rejected'
      ) then
      raise unique_violation using message = 'Phone number already has an active registration request.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists qz_prepare_registration_request_phone_trigger on public.registration_requests;
create trigger qz_prepare_registration_request_phone_trigger
  before insert or update of phone, contact, phone_e164, status on public.registration_requests
  for each row
  execute function public.qz_prepare_registration_request_phone();

create index if not exists platform_accounts_phone_e164_idx
  on public.platform_accounts (phone_e164)
  where phone_e164 is not null and phone_e164 <> '';

create index if not exists registration_requests_phone_e164_idx
  on public.registration_requests (phone_e164)
  where phone_e164 is not null and phone_e164 <> '';

do $$
begin
  if to_regclass('public.platform_accounts_phone_e164_unique_idx') is null
    and not exists (
      select 1
      from public.platform_accounts
      where phone_e164 is not null and phone_e164 <> ''
      group by phone_e164
      having count(*) > 1
    ) then
    create unique index platform_accounts_phone_e164_unique_idx
      on public.platform_accounts (phone_e164)
      where phone_e164 is not null and phone_e164 <> '';
  end if;

  if to_regclass('public.registration_requests_phone_e164_active_unique_idx') is null
    and not exists (
      select 1
      from public.registration_requests
      where phone_e164 is not null and phone_e164 <> ''
        and coalesce(status, 'pending') <> 'rejected'
      group by phone_e164
      having count(*) > 1
    ) then
    create unique index registration_requests_phone_e164_active_unique_idx
      on public.registration_requests (phone_e164)
      where phone_e164 is not null and phone_e164 <> ''
        and coalesce(status, 'pending') <> 'rejected';
  end if;
end;
$$;

grant select (
  id,
  name,
  phone,
  phone_e164,
  role,
  role_key,
  auth_provider,
  academy_id,
  academy_name,
  permissions,
  password_status,
  password_updated_at,
  status,
  created_at,
  updated_at
) on table public.platform_accounts to anon, authenticated;

grant select (
  id,
  academy_name,
  owner_name,
  contact,
  phone,
  phone_e164,
  academy_id,
  city,
  status,
  role_key,
  auth_provider,
  created_at,
  reviewed_at
) on table public.registration_requests to anon, authenticated;

comment on column public.platform_accounts.phone_e164 is
  'Normalized verified phone number used for account recovery and duplicate prevention.';

comment on column public.registration_requests.phone_e164 is
  'Normalized phone number for registration request lookup and duplicate prevention.';
