-- Keep registration requests reliable across old rows that used phone numbers
-- with or without a leading plus sign, and replace trigger messages with
-- readable text.

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
    raise exception 'Cannot link more than 3 accounts to the same academy.';
  end if;

  return new;
end;
$$;

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
    raise exception 'Academy name is already used by another account.';
  end if;

  return new;
end;
$$;

update public.registration_requests
set phone = concat('+', phone)
where phone ~ '^967[0-9]+$';

update public.registration_requests
set contact = concat('+', contact)
where contact ~ '^967[0-9]+$';
