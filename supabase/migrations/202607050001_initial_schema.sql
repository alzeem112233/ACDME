-- Online database schema for Al-Qaisar Master Dashboard.

create extension if not exists "pgcrypto";

create table if not exists public.academies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  field_name text,
  location text,
  logo_url text,
  plan_name text,
  owner_phone text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.academies(id) on delete cascade,
  name text not null,
  phone text not null,
  role text not null check (role in ('owner', 'coach', 'admin')),
  created_at timestamptz not null default now(),
  unique (academy_id, phone)
);

create table if not exists public.age_groups (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.academies(id) on delete cascade,
  name text not null,
  age_from int not null,
  age_to int not null,
  training_days text,
  created_at timestamptz not null default now()
);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.academies(id) on delete cascade,
  age_group_id uuid references public.age_groups(id) on delete set null,
  name text not null,
  coach_name text,
  wins int not null default 0,
  losses int not null default 0,
  draws int not null default 0,
  goals_for int not null default 0,
  goals_against int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.academies(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  name text not null,
  birth_date date,
  position text,
  jersey_number text,
  guardian_phone text,
  subscription_type text,
  monthly_fee numeric(12, 2) not null default 0,
  status text not null default 'active',
  xp int not null default 0,
  level int not null default 1,
  rating int not null default 70,
  skill int not null default 70,
  fitness int not null default 70,
  commitment int not null default 70,
  created_at timestamptz not null default now()
);

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.academies(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  attendance_date date not null,
  status text not null check (status in ('present', 'late', 'absent')),
  note text,
  created_at timestamptz not null default now(),
  unique (player_id, attendance_date)
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.academies(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  amount numeric(12, 2) not null,
  payment_date date not null,
  method text not null,
  status text not null,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.academies(id) on delete cascade,
  team_a_id uuid references public.teams(id) on delete set null,
  team_b_id uuid references public.teams(id) on delete set null,
  match_date date not null,
  score_a int not null default 0,
  score_b int not null default 0,
  mvp_player_id uuid references public.players(id) on delete set null,
  evaluation text,
  created_at timestamptz not null default now()
);

create table if not exists public.badges (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.academies(id) on delete cascade,
  name text not null,
  condition text,
  xp int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.player_badges (
  player_id uuid not null references public.players(id) on delete cascade,
  badge_id uuid not null references public.badges(id) on delete cascade,
  awarded_at timestamptz not null default now(),
  primary key (player_id, badge_id)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.academies(id) on delete cascade,
  type text not null,
  target text not null,
  status text not null default 'new',
  created_at timestamptz not null default now()
);

create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.academies(id) on delete cascade,
  title text,
  content text not null,
  post_type text not null,
  pinned boolean not null default false,
  likes_count int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.academies enable row level security;
alter table public.users enable row level security;
alter table public.age_groups enable row level security;
alter table public.teams enable row level security;
alter table public.players enable row level security;
alter table public.attendance enable row level security;
alter table public.payments enable row level security;
alter table public.matches enable row level security;
alter table public.badges enable row level security;
alter table public.player_badges enable row level security;
alter table public.notifications enable row level security;
alter table public.community_posts enable row level security;
