-- Parent portal for QZ ACADEMY.
-- Parent accounts use the existing backend-issued QZ sessions, but can only
-- read compact snapshots for players explicitly linked to their account.

do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select conname
    from pg_constraint
    where conrelid = 'public.qz_app_sessions'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role_key%'
  loop
    execute format('alter table public.qz_app_sessions drop constraint %I', constraint_row.conname);
  end loop;
end;
$$;

alter table public.qz_app_sessions
  add constraint qz_app_sessions_role_key_check
  check (role_key in ('super_admin', 'academy_owner', 'admin', 'coach', 'parent'));

create or replace function public.qz_role_key(role_text text)
returns text
language sql
immutable
as $$
  select case
    when role_text is null or btrim(role_text) = '' then 'coach'
    when lower(btrim(role_text)) in ('super_admin', 'super admin') or btrim(role_text) = 'سوبر أدمين' then 'super_admin'
    when lower(btrim(role_text)) in ('academy_owner', 'owner') or btrim(role_text) = 'مالك أكاديمية' then 'academy_owner'
    when lower(btrim(role_text)) in ('admin', 'administrator')
      or btrim(role_text) in ('مدير', 'إداري', 'إداري فريق') then 'admin'
    when lower(coalesce(role_text, '')) like '%parent%'
      or btrim(role_text) in ('ولي أمر', 'ولي الامر', 'ولي الأمر') then 'parent'
    else 'coach'
  end
$$;

create or replace function public.enforce_platform_accounts_limit()
returns trigger
language plpgsql
as $$
begin
  if coalesce(new.role_key, public.qz_role_key(new.role)) = 'parent' then
    return new;
  end if;

  if (
    select count(*)
    from public.platform_accounts
    where academy_id = new.academy_id
      and id <> coalesce(new.id, '')
      and coalesce(role_key, public.qz_role_key(role)) <> 'parent'
      and status not in ('disabled', 'معطل')
  ) >= 3 then
    raise exception 'Cannot link more than 3 staff accounts to the same academy.';
  end if;

  return new;
end;
$$;

create or replace function public.qz_revoke_disabled_account_sessions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('disabled', 'معطل') and old.status is distinct from new.status then
    delete from public.qz_app_sessions where account_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists qz_revoke_disabled_account_sessions_trigger on public.platform_accounts;
create trigger qz_revoke_disabled_account_sessions_trigger
  after update of status on public.platform_accounts
  for each row execute function public.qz_revoke_disabled_account_sessions();

revoke all on function public.qz_revoke_disabled_account_sessions() from public;

create table if not exists public.parent_player_links (
  id uuid primary key default gen_random_uuid(),
  academy_id text not null,
  parent_account_id text not null references public.platform_accounts(id) on delete cascade,
  parent_phone_e164 text not null,
  player_id text not null,
  relation text not null default 'ولي أمر',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (parent_account_id, player_id)
);

create table if not exists public.parent_player_snapshots (
  id uuid primary key default gen_random_uuid(),
  academy_id text not null,
  player_id text not null,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (academy_id, player_id)
);

create index if not exists parent_player_links_academy_idx
  on public.parent_player_links (academy_id);
create index if not exists parent_player_links_parent_idx
  on public.parent_player_links (parent_account_id);
create index if not exists parent_player_links_player_idx
  on public.parent_player_links (player_id);
create index if not exists parent_player_snapshots_academy_idx
  on public.parent_player_snapshots (academy_id);
create index if not exists parent_player_snapshots_player_idx
  on public.parent_player_snapshots (player_id);

create or replace function public.qz_parent_can_access_player(target_academy_id text, target_player_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.qz_role() = 'parent'
    and exists (
      select 1
      from public.parent_player_links link
      where link.academy_id = target_academy_id
        and link.player_id = target_player_id
        and link.parent_account_id = (select account_id from public.qz_session() limit 1)
    ),
    false
  )
$$;

revoke all on function public.qz_parent_can_access_player(text, text) from public;
grant execute on function public.qz_parent_can_access_player(text, text) to anon, authenticated;

alter table public.parent_player_links enable row level security;
alter table public.parent_player_snapshots enable row level security;

revoke all on table public.parent_player_links from anon, authenticated;
revoke all on table public.parent_player_snapshots from anon, authenticated;
grant select, insert, update, delete on table public.parent_player_links to anon, authenticated;
grant select, insert, update, delete on table public.parent_player_snapshots to anon, authenticated;

drop policy if exists parent_player_links_select on public.parent_player_links;
drop policy if exists parent_player_links_insert on public.parent_player_links;
drop policy if exists parent_player_links_update on public.parent_player_links;
drop policy if exists parent_player_links_delete on public.parent_player_links;

create policy parent_player_links_select
  on public.parent_player_links for select
  to anon, authenticated
  using (
    public.qz_can_access_academy(academy_id)
    or (
      public.qz_role() = 'parent'
      and parent_account_id = (select account_id from public.qz_session() limit 1)
    )
  );

create policy parent_player_links_insert
  on public.parent_player_links for insert
  to anon, authenticated
  with check (
    public.qz_can_access_academy(academy_id)
    and public.qz_has_permission('accounts')
  );

create policy parent_player_links_update
  on public.parent_player_links for update
  to anon, authenticated
  using (
    public.qz_can_access_academy(academy_id)
    and public.qz_has_permission('accounts')
  )
  with check (
    public.qz_can_access_academy(academy_id)
    and public.qz_has_permission('accounts')
  );

create policy parent_player_links_delete
  on public.parent_player_links for delete
  to anon, authenticated
  using (
    public.qz_can_access_academy(academy_id)
    and public.qz_has_permission('accounts')
  );

drop policy if exists parent_player_snapshots_select on public.parent_player_snapshots;
drop policy if exists parent_player_snapshots_insert on public.parent_player_snapshots;
drop policy if exists parent_player_snapshots_update on public.parent_player_snapshots;
drop policy if exists parent_player_snapshots_delete on public.parent_player_snapshots;

create policy parent_player_snapshots_select
  on public.parent_player_snapshots for select
  to anon, authenticated
  using (
    public.qz_can_access_academy(academy_id)
    or public.qz_parent_can_access_player(academy_id, player_id)
  );

create policy parent_player_snapshots_insert
  on public.parent_player_snapshots for insert
  to anon, authenticated
  with check (public.qz_can_access_academy(academy_id));

create policy parent_player_snapshots_update
  on public.parent_player_snapshots for update
  to anon, authenticated
  using (public.qz_can_access_academy(academy_id))
  with check (public.qz_can_access_academy(academy_id));

create policy parent_player_snapshots_delete
  on public.parent_player_snapshots for delete
  to anon, authenticated
  using (public.qz_can_access_academy(academy_id));

comment on table public.parent_player_links is
  'Explicit parent-to-player links used to authorize the parent portal.';
comment on table public.parent_player_snapshots is
  'Compact child-facing snapshots. Large local photos and unrelated academy data are intentionally excluded.';
