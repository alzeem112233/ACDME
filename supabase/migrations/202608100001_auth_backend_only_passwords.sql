-- Keep password hashes away from browser clients.
-- Authentication is handled by the qz-auth Edge Function using service-role access.

revoke select on table public.platform_accounts from anon, authenticated;
grant select (
  id,
  name,
  phone,
  role,
  academy_id,
  academy_name,
  permissions,
  password_status,
  password_updated_at,
  status,
  created_at,
  updated_at
) on table public.platform_accounts to anon, authenticated;

revoke select on table public.registration_requests from anon, authenticated;
grant select (
  id,
  academy_name,
  owner_name,
  contact,
  phone,
  academy_id,
  city,
  status,
  created_at,
  reviewed_at
) on table public.registration_requests to anon, authenticated;
