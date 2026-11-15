-- Keep password recovery requests scoped to the related academy.
-- The qz-auth function writes this value when it creates OTP/manual requests.

alter table if exists public.password_reset_requests
  add column if not exists academy_id text;

alter table if exists public.password_reset_otps
  add column if not exists academy_id text;

create index if not exists password_reset_requests_academy_id_idx
  on public.password_reset_requests (academy_id);

create index if not exists password_reset_otps_academy_id_idx
  on public.password_reset_otps (academy_id);
