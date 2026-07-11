-- Initial relational model for the academy management platform.
-- Works as a reference for Supabase, PostgreSQL, or any future backend.

create table academies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  field_name text,
  location text,
  logo_url text,
  plan_name text,
  owner_phone text not null,
  created_at timestamptz not null default now()
);

create table users (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references academies(id) on delete cascade,
  name text not null,
  phone text not null,
  role text not null check (role in ('owner', 'coach', 'admin')),
  created_at timestamptz not null default now(),
  unique (academy_id, phone)
);

create table age_groups (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references academies(id) on delete cascade,
  name text not null,
  age_from int not null,
  age_to int not null,
  training_days text,
  created_at timestamptz not null default now()
);

create table teams (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references academies(id) on delete cascade,
  age_group_id uuid references age_groups(id) on delete set null,
  name text not null,
  coach_name text,
  wins int not null default 0,
  losses int not null default 0,
  draws int not null default 0,
  goals_for int not null default 0,
  goals_against int not null default 0,
  created_at timestamptz not null default now()
);

create table players (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references academies(id) on delete cascade,
  team_id uuid references teams(id) on delete set null,
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

create table attendance (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references academies(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  attendance_date date not null,
  status text not null check (status in ('present', 'late', 'absent')),
  note text,
  created_at timestamptz not null default now(),
  unique (player_id, attendance_date)
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references academies(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  amount numeric(12, 2) not null,
  payment_date date not null,
  method text not null,
  status text not null,
  note text,
  created_at timestamptz not null default now()
);

create table matches (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references academies(id) on delete cascade,
  team_a_id uuid references teams(id) on delete set null,
  team_b_id uuid references teams(id) on delete set null,
  match_date date not null,
  score_a int not null default 0,
  score_b int not null default 0,
  mvp_player_id uuid references players(id) on delete set null,
  evaluation text,
  created_at timestamptz not null default now()
);

create table community_posts (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references academies(id) on delete cascade,
  title text,
  content text not null,
  post_type text not null,
  pinned boolean not null default false,
  likes_count int not null default 0,
  created_at timestamptz not null default now()
);
