-- RBAC + RLS foundation for QZ ACADEMY.
-- Browser clients no longer get platform-wide data unless the backend issues
-- a short-lived QZ session token after a successful login.

create extension if not exists "pgcrypto";

create table if not exists public.qz_app_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  account_id text,
  phone_e164 text not null,
  role_key text not null check (role_key in ('super_admin', 'academy_owner', 'admin', 'coach')),
  academy_id text,
  permissions jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.qz_app_sessions enable row level security;
revoke all on table public.qz_app_sessions from anon, authenticated;

create index if not exists qz_app_sessions_token_hash_idx
  on public.qz_app_sessions (token_hash);

create index if not exists qz_app_sessions_expires_idx
  on public.qz_app_sessions (expires_at);

create or replace function public.qz_header(name text)
returns text
language sql
stable
as $$
  select nullif(coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb ->> lower(name), '')
$$;

create or replace function public.qz_session()
returns table (
  account_id text,
  phone_e164 text,
  role_key text,
  academy_id text,
  permissions jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    session.account_id,
    session.phone_e164,
    session.role_key,
    session.academy_id,
    session.permissions
  from public.qz_app_sessions session
  where session.token_hash = encode(extensions.digest(coalesce(public.qz_header('x-qz-session'), '')::bytea, 'sha256'), 'hex')
    and session.expires_at > now()
  limit 1
$$;

create or replace function public.qz_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role_key from public.qz_session() limit 1
$$;

create or replace function public.qz_academy_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select academy_id from public.qz_session() limit 1
$$;

create or replace function public.qz_is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.qz_role() = 'super_admin', false)
$$;

create or replace function public.qz_can_access_academy(target_academy_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.qz_is_super_admin()
    or (
      target_academy_id is not null
      and public.qz_academy_id() = target_academy_id
      and public.qz_role() in ('academy_owner', 'admin', 'coach')
    )
$$;

create or replace function public.qz_has_permission(permission_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.qz_is_super_admin()
    or public.qz_role() = 'academy_owner'
    or coalesce((select permissions ->> permission_key from public.qz_session() limit 1), 'false') in ('true', '1', 'yes')
$$;

alter table if exists public.platform_accounts
  add column if not exists permissions_json jsonb not null default '{}'::jsonb;

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
  permissions_json,
  password_status,
  password_updated_at,
  status,
  created_at,
  updated_at
) on table public.platform_accounts to anon, authenticated;

grant insert, update, delete on table public.platform_accounts to anon, authenticated;
grant select, insert, update, delete on table public.academy_cloud_data to anon, authenticated;
grant select, insert, update, delete on table public.password_reset_requests to anon, authenticated;
grant select, insert, update, delete on table public.academies to anon, authenticated;
grant select, insert, update, delete on table public.users to anon, authenticated;
grant select, insert, update, delete on table public.age_groups to anon, authenticated;
grant select, insert, update, delete on table public.teams to anon, authenticated;
grant select, insert, update, delete on table public.players to anon, authenticated;
grant select, insert, update, delete on table public.attendance to anon, authenticated;
grant select, insert, update, delete on table public.payments to anon, authenticated;
grant select, insert, update, delete on table public.matches to anon, authenticated;
grant select, insert, update, delete on table public.badges to anon, authenticated;
grant select, insert, delete on table public.player_badges to anon, authenticated;
grant select, insert, update, delete on table public.notifications to anon, authenticated;
grant select, insert, update, delete on table public.community_posts to anon, authenticated;

update public.platform_accounts
set role_key = case
    when role_key in ('super_admin', 'academy_owner', 'admin', 'coach') then role_key
    else public.qz_role_key(role)
  end,
  permissions_json = case
    when role_key = 'super_admin' or role = 'سوبر أدمين' then '{"all": true}'::jsonb
    when role_key = 'academy_owner' or role = 'مالك أكاديمية' then '{"academy": true, "accounts": true, "players": true, "finance": true, "reports": true}'::jsonb
    when role_key = 'admin' then '{"players": true, "attendance": true, "finance": true, "reports": true}'::jsonb
    else '{"players": true, "attendance": true}'::jsonb
  end
where role_key is null or permissions_json = '{}'::jsonb;

drop policy if exists "platform_accounts_public_select" on public.platform_accounts;
drop policy if exists "platform_accounts_public_insert" on public.platform_accounts;
drop policy if exists "platform_accounts_public_update" on public.platform_accounts;
drop policy if exists "platform_accounts_public_delete" on public.platform_accounts;
drop policy if exists "platform_accounts_rbac_select" on public.platform_accounts;
drop policy if exists "platform_accounts_rbac_insert" on public.platform_accounts;
drop policy if exists "platform_accounts_rbac_update" on public.platform_accounts;
drop policy if exists "platform_accounts_rbac_delete" on public.platform_accounts;

create policy "platform_accounts_rbac_select"
  on public.platform_accounts
  for select
  using (
    public.qz_is_super_admin()
    or public.qz_can_access_academy(academy_id)
    or phone_e164 = (select phone_e164 from public.qz_session() limit 1)
  );

create policy "platform_accounts_rbac_insert"
  on public.platform_accounts
  for insert
  with check (
    public.qz_is_super_admin()
    or (public.qz_can_access_academy(academy_id) and public.qz_has_permission('accounts'))
  );

create policy "platform_accounts_rbac_update"
  on public.platform_accounts
  for update
  using (
    public.qz_is_super_admin()
    or (public.qz_can_access_academy(academy_id) and public.qz_has_permission('accounts'))
  )
  with check (
    public.qz_is_super_admin()
    or (public.qz_can_access_academy(academy_id) and public.qz_has_permission('accounts'))
  );

create policy "platform_accounts_rbac_delete"
  on public.platform_accounts
  for delete
  using (
    public.qz_is_super_admin()
    or (public.qz_can_access_academy(academy_id) and public.qz_has_permission('accounts'))
  );

drop policy if exists "academy_cloud_data_public_select" on public.academy_cloud_data;
drop policy if exists "academy_cloud_data_public_insert" on public.academy_cloud_data;
drop policy if exists "academy_cloud_data_public_update" on public.academy_cloud_data;
drop policy if exists "academy_cloud_data_public_delete" on public.academy_cloud_data;
drop policy if exists "academy_cloud_data_rbac_select" on public.academy_cloud_data;
drop policy if exists "academy_cloud_data_rbac_insert" on public.academy_cloud_data;
drop policy if exists "academy_cloud_data_rbac_update" on public.academy_cloud_data;
drop policy if exists "academy_cloud_data_rbac_delete" on public.academy_cloud_data;

create policy "academy_cloud_data_rbac_select"
  on public.academy_cloud_data
  for select
  using (public.qz_can_access_academy(academy_id));

create policy "academy_cloud_data_rbac_insert"
  on public.academy_cloud_data
  for insert
  with check (public.qz_can_access_academy(academy_id));

create policy "academy_cloud_data_rbac_update"
  on public.academy_cloud_data
  for update
  using (public.qz_can_access_academy(academy_id))
  with check (public.qz_can_access_academy(academy_id));

create policy "academy_cloud_data_rbac_delete"
  on public.academy_cloud_data
  for delete
  using (public.qz_is_super_admin());

drop policy if exists "registration_requests_public_select" on public.registration_requests;
drop policy if exists "registration_requests_public_insert" on public.registration_requests;
drop policy if exists "registration_requests_public_update" on public.registration_requests;
drop policy if exists "registration_requests_public_delete" on public.registration_requests;
drop policy if exists "registration_requests_rbac_select" on public.registration_requests;
drop policy if exists "registration_requests_rbac_update" on public.registration_requests;
drop policy if exists "registration_requests_rbac_delete" on public.registration_requests;

create policy "registration_requests_public_insert"
  on public.registration_requests
  for insert
  with check (true);

create policy "registration_requests_rbac_select"
  on public.registration_requests
  for select
  using (
    public.qz_is_super_admin()
    or public.qz_can_access_academy(academy_id)
    or phone_e164 = (select phone_e164 from public.qz_session() limit 1)
  );

create policy "registration_requests_rbac_update"
  on public.registration_requests
  for update
  using (public.qz_is_super_admin())
  with check (public.qz_is_super_admin());

create policy "registration_requests_rbac_delete"
  on public.registration_requests
  for delete
  using (public.qz_is_super_admin());

drop policy if exists "password_reset_requests_public_select" on public.password_reset_requests;
drop policy if exists "password_reset_requests_public_update" on public.password_reset_requests;
drop policy if exists "password_reset_requests_rbac_select" on public.password_reset_requests;
drop policy if exists "password_reset_requests_rbac_update" on public.password_reset_requests;

create policy "password_reset_requests_rbac_select"
  on public.password_reset_requests
  for select
  using (
    public.qz_is_super_admin()
    or phone_e164 = (select phone_e164 from public.qz_session() limit 1)
  );

create policy "password_reset_requests_rbac_update"
  on public.password_reset_requests
  for update
  using (public.qz_is_super_admin())
  with check (public.qz_is_super_admin());

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'users',
    'age_groups',
    'teams',
    'players',
    'attendance',
    'payments',
    'matches',
    'badges',
    'community_posts'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_rbac_select', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_rbac_insert', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_rbac_update', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_rbac_delete', table_name);
    execute format('create policy %I on public.%I for select using (public.qz_can_access_academy(academy_id::text))', table_name || '_rbac_select', table_name);
    execute format('create policy %I on public.%I for insert with check (public.qz_can_access_academy(academy_id::text))', table_name || '_rbac_insert', table_name);
    execute format('create policy %I on public.%I for update using (public.qz_can_access_academy(academy_id::text)) with check (public.qz_can_access_academy(academy_id::text))', table_name || '_rbac_update', table_name);
    execute format('create policy %I on public.%I for delete using (public.qz_is_super_admin() or (public.qz_can_access_academy(academy_id::text) and public.qz_role() in (''academy_owner'', ''admin'')))', table_name || '_rbac_delete', table_name);
  end loop;
end;
$$;

drop policy if exists academies_rbac_select on public.academies;
drop policy if exists academies_rbac_insert on public.academies;
drop policy if exists academies_rbac_update on public.academies;
drop policy if exists academies_rbac_delete on public.academies;

create policy academies_rbac_select
  on public.academies
  for select
  using (public.qz_can_access_academy(id::text));

create policy academies_rbac_insert
  on public.academies
  for insert
  with check (public.qz_is_super_admin());

create policy academies_rbac_update
  on public.academies
  for update
  using (public.qz_can_access_academy(id::text))
  with check (public.qz_can_access_academy(id::text));

create policy academies_rbac_delete
  on public.academies
  for delete
  using (public.qz_is_super_admin());

drop policy if exists notifications_rbac_select on public.notifications;
drop policy if exists notifications_rbac_insert on public.notifications;
drop policy if exists notifications_rbac_update on public.notifications;
drop policy if exists notifications_rbac_delete on public.notifications;

create policy notifications_rbac_select
  on public.notifications
  for select
  using (
    public.qz_is_super_admin()
    or public.qz_can_access_academy(coalesce(school_id::text, null))
    or user_id::text = (select account_id from public.qz_session() limit 1)
  );

create policy notifications_rbac_insert
  on public.notifications
  for insert
  with check (public.qz_is_super_admin() or public.qz_can_access_academy(school_id::text));

create policy notifications_rbac_update
  on public.notifications
  for update
  using (
    public.qz_is_super_admin()
    or public.qz_can_access_academy(coalesce(school_id::text, null))
    or user_id::text = (select account_id from public.qz_session() limit 1)
  )
  with check (
    public.qz_is_super_admin()
    or public.qz_can_access_academy(coalesce(school_id::text, null))
    or user_id::text = (select account_id from public.qz_session() limit 1)
  );

create policy notifications_rbac_delete
  on public.notifications
  for delete
  using (public.qz_is_super_admin());

drop policy if exists player_badges_rbac_select on public.player_badges;
drop policy if exists player_badges_rbac_insert on public.player_badges;
drop policy if exists player_badges_rbac_update on public.player_badges;
drop policy if exists player_badges_rbac_delete on public.player_badges;

create policy player_badges_rbac_select
  on public.player_badges
  for select
  using (exists (
    select 1 from public.players player
    where player.id = player_badges.player_id
      and public.qz_can_access_academy(player.academy_id::text)
  ));

create policy player_badges_rbac_insert
  on public.player_badges
  for insert
  with check (exists (
    select 1 from public.players player
    where player.id = player_badges.player_id
      and public.qz_can_access_academy(player.academy_id::text)
  ));

create policy player_badges_rbac_delete
  on public.player_badges
  for delete
  using (exists (
    select 1 from public.players player
    where player.id = player_badges.player_id
      and public.qz_can_access_academy(player.academy_id::text)
  ));

comment on table public.qz_app_sessions is
  'Short-lived backend-issued sessions used by RLS/RBAC. Tokens are hashed at rest.';
