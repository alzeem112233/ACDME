-- Expose safe role migration metadata to browser clients.
-- Password hashes remain excluded; role metadata is not secret and helps the UI
-- preserve legacy roles during the transition.

grant select (
  id,
  name,
  phone,
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
  academy_id,
  city,
  status,
  role_key,
  auth_provider,
  created_at,
  reviewed_at
) on table public.registration_requests to anon, authenticated;
