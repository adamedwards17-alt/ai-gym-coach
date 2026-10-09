-- Training & activity hub: weekly plan, daily steps, optional intensity/calories.
-- Additive only. Preserves existing training_sessions rows and RLS patterns.

-- ---------------------------------------------------------------------------
-- Profiles: persistent activity targets
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists daily_step_target integer
    check (daily_step_target is null or (daily_step_target >= 1000 and daily_step_target <= 100000)),
  add column if not exists weekly_session_target integer
    check (weekly_session_target is null or (weekly_session_target >= 1 and weekly_session_target <= 14));

-- ---------------------------------------------------------------------------
-- Logged sessions: optional intensity + manually entered calories
-- ---------------------------------------------------------------------------
alter table public.training_sessions
  add column if not exists intensity text
    check (
      intensity is null
      or intensity in ('easy', 'moderate', 'hard', 'very_hard')
    ),
  add column if not exists calories_burned integer
    check (
      calories_burned is null
      or (calories_burned >= 0 and calories_burned <= 5000)
    );

-- ---------------------------------------------------------------------------
-- Weekly / daily planned sessions (one plan slot per user per local date)
-- ---------------------------------------------------------------------------
create table if not exists public.training_plan_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_date date not null,
  training_type text not null
    check (training_type in (
      'strength', 'hiit', 'cardio', 'sport', 'recovery', 'rest', 'other'
    )),
  title text not null,
  focus text,
  planned_duration_minutes smallint
    check (
      planned_duration_minutes is null
      or (planned_duration_minutes > 0 and planned_duration_minutes <= 600)
    ),
  status text not null default 'planned'
    check (status in ('planned', 'completed')),
  training_session_id uuid
    references public.training_sessions (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, plan_date),
  unique (training_session_id)
);

create index if not exists training_plan_entries_user_date_idx
  on public.training_plan_entries (user_id, plan_date);

drop trigger if exists training_plan_entries_set_updated_at on public.training_plan_entries;
create trigger training_plan_entries_set_updated_at
before update on public.training_plan_entries
for each row
execute procedure public.set_updated_at();

alter table public.training_plan_entries enable row level security;

drop policy if exists "training_plan_entries_select_own" on public.training_plan_entries;
create policy "training_plan_entries_select_own"
  on public.training_plan_entries
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "training_plan_entries_insert_own" on public.training_plan_entries;
create policy "training_plan_entries_insert_own"
  on public.training_plan_entries
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "training_plan_entries_update_own" on public.training_plan_entries;
create policy "training_plan_entries_update_own"
  on public.training_plan_entries
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "training_plan_entries_delete_own" on public.training_plan_entries;
create policy "training_plan_entries_delete_own"
  on public.training_plan_entries
  for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on table public.training_plan_entries to authenticated;

-- ---------------------------------------------------------------------------
-- Daily step entries (manual). One row per user per local date.
-- ---------------------------------------------------------------------------
create table if not exists public.daily_steps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  step_date date not null,
  steps integer not null
    check (steps >= 0 and steps <= 200000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, step_date)
);

create index if not exists daily_steps_user_date_idx
  on public.daily_steps (user_id, step_date desc);

drop trigger if exists daily_steps_set_updated_at on public.daily_steps;
create trigger daily_steps_set_updated_at
before update on public.daily_steps
for each row
execute procedure public.set_updated_at();

alter table public.daily_steps enable row level security;

drop policy if exists "daily_steps_select_own" on public.daily_steps;
create policy "daily_steps_select_own"
  on public.daily_steps
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "daily_steps_insert_own" on public.daily_steps;
create policy "daily_steps_insert_own"
  on public.daily_steps
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "daily_steps_update_own" on public.daily_steps;
create policy "daily_steps_update_own"
  on public.daily_steps
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "daily_steps_delete_own" on public.daily_steps;
create policy "daily_steps_delete_own"
  on public.daily_steps
  for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on table public.daily_steps to authenticated;

notify pgrst, 'reload schema';
