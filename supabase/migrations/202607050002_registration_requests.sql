create table if not exists public.registration_requests (
  id uuid primary key default gen_random_uuid(),
  academy_name text not null,
  owner_name text not null,
  contact text not null,
  city text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.registration_requests enable row level security;
