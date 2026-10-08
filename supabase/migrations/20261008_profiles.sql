-- AI Gym Coach: user profile from onboarding.
-- One row per signed-in user. Later tables (training, nutrition,
-- check-ins, coach chats) should reference profiles.id.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  primary_goal text,
  goal_in_own_words text,
  age smallint,
  sex text,
  height_cm numeric,
  weight_kg numeric,
  training_frequency text,
  training_types text[] not null default '{}',
  training_location text,
  equipment text[] not null default '{}',
  likes_dislikes text,
  activity_level text,
  typical_sleep text,
  lifestyle_constraints text,
  dietary_preferences text[] not null default '{}',
  foods_avoided text,
  allergies text,
  meals_per_day smallint,
  nutrition_support text,
  coaching_style text,
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute procedure public.set_updated_at();

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);
