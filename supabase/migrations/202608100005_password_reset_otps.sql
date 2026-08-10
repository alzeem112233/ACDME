-- Password reset OTPs are created only by the qz-auth Edge Function.
-- Browser clients cannot read or write this table.

create table if not exists public.password_reset_otps (
  id uuid primary key default gen_random_uuid(),
  phone_e164 text not null,
  otp_hash text not null,
  channel text not null default 'whatsapp',
  purpose text not null default 'password_reset',
  expires_at timestamptz not null,
  consumed_at timestamptz,
  attempts integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.password_reset_otps enable row level security;

revoke all on table public.password_reset_otps from anon, authenticated;

create index if not exists password_reset_otps_phone_created_idx
  on public.password_reset_otps (phone_e164, created_at desc);

create index if not exists password_reset_otps_active_idx
  on public.password_reset_otps (phone_e164, expires_at desc)
  where consumed_at is null;

comment on table public.password_reset_otps is
  'Short-lived password reset OTP hashes. Managed by qz-auth using service-role access only.';
