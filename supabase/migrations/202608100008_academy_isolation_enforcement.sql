-- Academy isolation hardening for QZ ACADEMY.
-- Every academy-related row must carry an academy identifier, and RLS must
-- validate access against the current QZ session.

create or replace function public.qz_can_access_row(row_academy_id text, row_school_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.qz_can_access_academy(coalesce(row_academy_id, row_school_id::text))
$$;

create or replace function public.qz_set_academy_from_school()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.academy_id is null and new.school_id is not null then
    new.academy_id := new.school_id::text;
  end if;
  return new;
end;
$$;

create or replace function public.qz_set_school_academy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.academy_id is null and new.id is not null then
    new.academy_id := new.id::text;
  end if;
  return new;
end;
$$;

create or replace function public.qz_set_player_badge_academy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.academy_id is null then
    select p.academy_id::text
      into new.academy_id
      from public.players p
      where p.id = new.player_id
      limit 1;
  end if;

  if new.academy_id is null then
    select b.academy_id::text
      into new.academy_id
      from public.badges b
      where b.id = new.badge_id
      limit 1;
  end if;

  return new;
end;
$$;

alter table if exists public.schools add column if not exists academy_id text;
update public.schools set academy_id = id::text where academy_id is null;
create index if not exists schools_academy_id_idx on public.schools (academy_id);

drop trigger if exists qz_set_school_academy_trigger on public.schools;
create trigger qz_set_school_academy_trigger
  before insert or update on public.schools
  for each row execute function public.qz_set_school_academy();

alter table if exists public.departments add column if not exists academy_id text;
alter table if exists public.tasks add column if not exists academy_id text;
alter table if exists public.activity_logs add column if not exists academy_id text;
alter table if exists public.attachments add column if not exists academy_id text;
alter table if exists public.audit_logs add column if not exists academy_id text;
alter table if exists public.backups add column if not exists academy_id text;
alter table if exists public.finance_discounts add column if not exists academy_id text;
alter table if exists public.notifications add column if not exists academy_id text;
alter table if exists public.profiles add column if not exists academy_id text;

update public.departments set academy_id = school_id::text where academy_id is null and school_id is not null;
update public.tasks set academy_id = school_id::text where academy_id is null and school_id is not null;
update public.activity_logs set academy_id = school_id::text where academy_id is null and school_id is not null;
update public.attachments set academy_id = school_id::text where academy_id is null and school_id is not null;
update public.audit_logs set academy_id = school_id::text where academy_id is null and school_id is not null;
update public.backups set academy_id = school_id::text where academy_id is null and school_id is not null;
alter table if exists public.finance_discounts disable trigger user;
update public.finance_discounts set academy_id = school_id::text where academy_id is null and school_id is not null;
alter table if exists public.finance_discounts enable trigger user;
update public.notifications set academy_id = school_id::text where academy_id is null and school_id is not null;
update public.profiles set academy_id = school_id::text where academy_id is null and school_id is not null;

create index if not exists departments_academy_id_idx on public.departments (academy_id);
create index if not exists tasks_academy_id_idx on public.tasks (academy_id);
create index if not exists activity_logs_academy_id_idx on public.activity_logs (academy_id);
create index if not exists attachments_academy_id_idx on public.attachments (academy_id);
create index if not exists audit_logs_academy_id_idx on public.audit_logs (academy_id);
create index if not exists backups_academy_id_idx on public.backups (academy_id);
create index if not exists finance_discounts_academy_id_idx on public.finance_discounts (academy_id);
create index if not exists notifications_academy_id_idx on public.notifications (academy_id);
create index if not exists profiles_academy_id_idx on public.profiles (academy_id);

drop trigger if exists qz_set_departments_academy_trigger on public.departments;
create trigger qz_set_departments_academy_trigger
  before insert or update on public.departments
  for each row execute function public.qz_set_academy_from_school();

drop trigger if exists qz_set_tasks_academy_trigger on public.tasks;
create trigger qz_set_tasks_academy_trigger
  before insert or update on public.tasks
  for each row execute function public.qz_set_academy_from_school();

drop trigger if exists qz_set_activity_logs_academy_trigger on public.activity_logs;
create trigger qz_set_activity_logs_academy_trigger
  before insert or update on public.activity_logs
  for each row execute function public.qz_set_academy_from_school();

drop trigger if exists qz_set_attachments_academy_trigger on public.attachments;
create trigger qz_set_attachments_academy_trigger
  before insert or update on public.attachments
  for each row execute function public.qz_set_academy_from_school();

drop trigger if exists qz_set_audit_logs_academy_trigger on public.audit_logs;
create trigger qz_set_audit_logs_academy_trigger
  before insert or update on public.audit_logs
  for each row execute function public.qz_set_academy_from_school();

drop trigger if exists qz_set_backups_academy_trigger on public.backups;
create trigger qz_set_backups_academy_trigger
  before insert or update on public.backups
  for each row execute function public.qz_set_academy_from_school();

drop trigger if exists qz_set_finance_discounts_academy_trigger on public.finance_discounts;
create trigger qz_set_finance_discounts_academy_trigger
  before insert or update on public.finance_discounts
  for each row execute function public.qz_set_academy_from_school();

drop trigger if exists qz_set_notifications_academy_trigger on public.notifications;
create trigger qz_set_notifications_academy_trigger
  before insert or update on public.notifications
  for each row execute function public.qz_set_academy_from_school();

drop trigger if exists qz_set_profiles_academy_trigger on public.profiles;
create trigger qz_set_profiles_academy_trigger
  before insert or update on public.profiles
  for each row execute function public.qz_set_academy_from_school();

alter table if exists public.player_badges add column if not exists academy_id text;
update public.player_badges pb
set academy_id = p.academy_id::text
from public.players p
where pb.academy_id is null
  and pb.player_id = p.id;
update public.player_badges pb
set academy_id = b.academy_id::text
from public.badges b
where pb.academy_id is null
  and pb.badge_id = b.id;
create index if not exists player_badges_academy_id_idx on public.player_badges (academy_id);

drop trigger if exists qz_set_player_badges_academy_trigger on public.player_badges;
create trigger qz_set_player_badges_academy_trigger
  before insert or update on public.player_badges
  for each row execute function public.qz_set_player_badge_academy();

alter table if exists public.password_reset_requests add column if not exists academy_id text;
alter table if exists public.password_reset_otps add column if not exists academy_id text;

update public.password_reset_requests pr
set academy_id = case when pa.role_key = 'super_admin' then 'platform' else pa.academy_id end
from public.platform_accounts pa
where pr.academy_id is null
  and pr.phone_e164 = pa.phone_e164;

update public.password_reset_otps po
set academy_id = case when pa.role_key = 'super_admin' then 'platform' else pa.academy_id end
from public.platform_accounts pa
where po.academy_id is null
  and po.phone_e164 = pa.phone_e164;

create index if not exists password_reset_requests_academy_id_idx on public.password_reset_requests (academy_id);
create index if not exists password_reset_otps_academy_id_idx on public.password_reset_otps (academy_id);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'departments',
    'tasks',
    'activity_logs',
    'attachments',
    'audit_logs',
    'backups',
    'finance_discounts',
    'profiles'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('grant select, insert, update, delete on table public.%I to anon, authenticated', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_qz_isolated_select', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_qz_isolated_insert', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_qz_isolated_update', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_qz_isolated_delete', table_name);

    execute format(
      'create policy %I on public.%I for select using (public.qz_can_access_row(academy_id, school_id))',
      table_name || '_qz_isolated_select',
      table_name
    );
    execute format(
      'create policy %I on public.%I for insert with check (public.qz_can_access_row(academy_id, school_id))',
      table_name || '_qz_isolated_insert',
      table_name
    );
    execute format(
      'create policy %I on public.%I for update using (public.qz_can_access_row(academy_id, school_id)) with check (public.qz_can_access_row(academy_id, school_id))',
      table_name || '_qz_isolated_update',
      table_name
    );
    execute format(
      'create policy %I on public.%I for delete using (public.qz_is_super_admin())',
      table_name || '_qz_isolated_delete',
      table_name
    );
  end loop;
end $$;

alter table if exists public.schools enable row level security;
grant select, insert, update, delete on table public.schools to anon, authenticated;
drop policy if exists "schools_qz_isolated_select" on public.schools;
drop policy if exists "schools_qz_isolated_insert" on public.schools;
drop policy if exists "schools_qz_isolated_update" on public.schools;
drop policy if exists "schools_qz_isolated_delete" on public.schools;
create policy "schools_qz_isolated_select"
  on public.schools for select
  using (public.qz_can_access_academy(academy_id));
create policy "schools_qz_isolated_insert"
  on public.schools for insert
  with check (public.qz_can_access_academy(academy_id));
create policy "schools_qz_isolated_update"
  on public.schools for update
  using (public.qz_can_access_academy(academy_id))
  with check (public.qz_can_access_academy(academy_id));
create policy "schools_qz_isolated_delete"
  on public.schools for delete
  using (public.qz_is_super_admin());

alter table if exists public.notifications enable row level security;
grant select, insert, update, delete on table public.notifications to anon, authenticated;
drop policy if exists "notifications_rbac_select" on public.notifications;
drop policy if exists "notifications_rbac_insert" on public.notifications;
drop policy if exists "notifications_rbac_update" on public.notifications;
drop policy if exists "notifications_rbac_delete" on public.notifications;
drop policy if exists "notifications_qz_isolated_select" on public.notifications;
drop policy if exists "notifications_qz_isolated_insert" on public.notifications;
drop policy if exists "notifications_qz_isolated_update" on public.notifications;
drop policy if exists "notifications_qz_isolated_delete" on public.notifications;
create policy "notifications_qz_isolated_select"
  on public.notifications for select
  using (public.qz_can_access_row(academy_id, school_id));
create policy "notifications_qz_isolated_insert"
  on public.notifications for insert
  with check (public.qz_can_access_row(academy_id, school_id));
create policy "notifications_qz_isolated_update"
  on public.notifications for update
  using (public.qz_can_access_row(academy_id, school_id))
  with check (public.qz_can_access_row(academy_id, school_id));
create policy "notifications_qz_isolated_delete"
  on public.notifications for delete
  using (public.qz_is_super_admin());

alter table if exists public.player_badges enable row level security;
grant select, insert, delete on table public.player_badges to anon, authenticated;
drop policy if exists "player_badges_rbac_select" on public.player_badges;
drop policy if exists "player_badges_rbac_insert" on public.player_badges;
drop policy if exists "player_badges_rbac_delete" on public.player_badges;
drop policy if exists "player_badges_qz_isolated_select" on public.player_badges;
drop policy if exists "player_badges_qz_isolated_insert" on public.player_badges;
drop policy if exists "player_badges_qz_isolated_delete" on public.player_badges;
create policy "player_badges_qz_isolated_select"
  on public.player_badges for select
  using (public.qz_can_access_academy(academy_id));
create policy "player_badges_qz_isolated_insert"
  on public.player_badges for insert
  with check (public.qz_can_access_academy(academy_id));
create policy "player_badges_qz_isolated_delete"
  on public.player_badges for delete
  using (public.qz_can_access_academy(academy_id));

drop policy if exists "password_reset_requests_rbac_select" on public.password_reset_requests;
drop policy if exists "password_reset_requests_rbac_insert" on public.password_reset_requests;
drop policy if exists "password_reset_requests_rbac_update" on public.password_reset_requests;
drop policy if exists "password_reset_requests_rbac_delete" on public.password_reset_requests;
create policy "password_reset_requests_rbac_select"
  on public.password_reset_requests for select
  using (
    public.qz_is_super_admin()
    or public.qz_can_access_academy(academy_id)
    or phone_e164 = (select phone_e164 from public.qz_session() limit 1)
  );
create policy "password_reset_requests_rbac_insert"
  on public.password_reset_requests for insert
  with check (true);
create policy "password_reset_requests_rbac_update"
  on public.password_reset_requests for update
  using (public.qz_is_super_admin())
  with check (public.qz_is_super_admin());
create policy "password_reset_requests_rbac_delete"
  on public.password_reset_requests for delete
  using (public.qz_is_super_admin());
