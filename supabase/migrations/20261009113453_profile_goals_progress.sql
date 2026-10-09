-- Profile & Goals, weight history, weekly check-ins, nutrition target audit.
-- Additive only. Preserves existing profiles, nutrition_targets, and check-ins.

-- ---------------------------------------------------------------------------
-- Profiles: goal framing + target mode flags
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists goal_started_at date,
  add column if not exists target_weight_kg numeric
    check (
      target_weight_kg is null
      or (target_weight_kg > 0 and target_weight_kg < 500)
    ),
  add column if not exists target_date date,
  add column if not exists preferred_weight_unit text
    check (
      preferred_weight_unit is null
      or preferred_weight_unit in ('kg', 'st')
    );

-- Backfill goal start from onboarding completion where missing.
update public.profiles
set goal_started_at = (onboarding_completed_at at time zone 'Europe/London')::date
where goal_started_at is null
  and onboarding_completed_at is not null;

-- ---------------------------------------------------------------------------
-- Nutrition targets: manual lock
-- ---------------------------------------------------------------------------
alter table public.nutrition_targets
  add column if not exists is_manual boolean not null default false;

-- ---------------------------------------------------------------------------
-- Canonical weight history
-- ---------------------------------------------------------------------------
create table if not exists public.weight_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  measured_on date not null,
  weight_kg numeric not null
    check (weight_kg > 0 and weight_kg < 500),
  source text not null default 'manual'
    check (source in (
      'onboarding',
      'profile',
      'progress',
      'weekly_checkin',
      'manual',
      'import'
    )),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists weight_measurements_user_date_idx
  on public.weight_measurements (user_id, measured_on desc, created_at desc);

drop trigger if exists weight_measurements_set_updated_at on public.weight_measurements;
create trigger weight_measurements_set_updated_at
before update on public.weight_measurements
for each row
execute procedure public.set_updated_at();

alter table public.weight_measurements enable row level security;

drop policy if exists "weight_measurements_select_own" on public.weight_measurements;
create policy "weight_measurements_select_own"
  on public.weight_measurements for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "weight_measurements_insert_own" on public.weight_measurements;
create policy "weight_measurements_insert_own"
  on public.weight_measurements for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "weight_measurements_update_own" on public.weight_measurements;
create policy "weight_measurements_update_own"
  on public.weight_measurements for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "weight_measurements_delete_own" on public.weight_measurements;
create policy "weight_measurements_delete_own"
  on public.weight_measurements for delete to authenticated
  using (auth.uid() = user_id);

-- Backfill one historical row from current profile weight when missing.
insert into public.weight_measurements (user_id, measured_on, weight_kg, source)
select
  p.id,
  coalesce(
    (p.onboarding_completed_at at time zone 'Europe/London')::date,
    (p.created_at at time zone 'Europe/London')::date,
    current_date
  ),
  p.weight_kg,
  'onboarding'
from public.profiles p
where p.weight_kg is not null
  and not exists (
    select 1
    from public.weight_measurements w
    where w.user_id = p.id
  );

-- ---------------------------------------------------------------------------
-- Goal history
-- ---------------------------------------------------------------------------
create table if not exists public.goal_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  primary_goal text,
  goal_in_own_words text,
  target_weight_kg numeric
    check (
      target_weight_kg is null
      or (target_weight_kg > 0 and target_weight_kg < 500)
    ),
  target_date date,
  effective_from date not null,
  effective_to date,
  change_reason text,
  source text not null default 'profile'
    check (source in (
      'onboarding',
      'profile',
      'coach',
      'weekly_checkin'
    )),
  created_at timestamptz not null default now()
);

create index if not exists goal_history_user_from_idx
  on public.goal_history (user_id, effective_from desc);

alter table public.goal_history enable row level security;

drop policy if exists "goal_history_select_own" on public.goal_history;
create policy "goal_history_select_own"
  on public.goal_history for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "goal_history_insert_own" on public.goal_history;
create policy "goal_history_insert_own"
  on public.goal_history for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "goal_history_update_own" on public.goal_history;
create policy "goal_history_update_own"
  on public.goal_history for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Seed current goal as history where none exists.
insert into public.goal_history (
  user_id,
  primary_goal,
  goal_in_own_words,
  target_weight_kg,
  target_date,
  effective_from,
  source
)
select
  p.id,
  p.primary_goal,
  p.goal_in_own_words,
  p.target_weight_kg,
  p.target_date,
  coalesce(p.goal_started_at, (p.onboarding_completed_at at time zone 'Europe/London')::date, current_date),
  'onboarding'
from public.profiles p
where p.primary_goal is not null
  and not exists (
    select 1 from public.goal_history g where g.user_id = p.id
  );

-- ---------------------------------------------------------------------------
-- Nutrition target change history
-- ---------------------------------------------------------------------------
create table if not exists public.nutrition_target_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  daily_calories integer not null,
  protein_g integer not null,
  carbs_g integer not null,
  fat_g integer not null,
  methodology_version text,
  is_manual boolean not null default false,
  source text not null default 'auto'
    check (source in (
      'auto',
      'manual',
      'weekly_checkin',
      'coach_proposal',
      'profile_recalc'
    )),
  reason text,
  previous_daily_calories integer,
  previous_protein_g integer,
  previous_carbs_g integer,
  previous_fat_g integer,
  effective_from date not null default (timezone('Europe/London', now()))::date,
  created_at timestamptz not null default now()
);

create index if not exists nutrition_target_history_user_idx
  on public.nutrition_target_history (user_id, created_at desc);

alter table public.nutrition_target_history enable row level security;

drop policy if exists "nutrition_target_history_select_own" on public.nutrition_target_history;
create policy "nutrition_target_history_select_own"
  on public.nutrition_target_history for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "nutrition_target_history_insert_own" on public.nutrition_target_history;
create policy "nutrition_target_history_insert_own"
  on public.nutrition_target_history for insert to authenticated
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Weekly check-ins
-- ---------------------------------------------------------------------------
create table if not exists public.weekly_check_ins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  week_start_date date not null,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'completed')),
  weight_kg numeric
    check (weight_kg is null or (weight_kg > 0 and weight_kg < 500)),
  weight_confirmed boolean not null default false,
  hunger_rating smallint
    check (hunger_rating is null or (hunger_rating >= 1 and hunger_rating <= 5)),
  energy_rating smallint
    check (energy_rating is null or (energy_rating >= 1 and energy_rating <= 5)),
  mood_rating smallint
    check (mood_rating is null or (mood_rating >= 1 and mood_rating <= 5)),
  nutrition_adherence text
    check (
      nutrition_adherence is null
      or nutrition_adherence in (
        'almost_entirely',
        'most_of_the_time',
        'some_of_the_time',
        'not_much'
      )
    ),
  training_adherence text
    check (
      training_adherence is null
      or training_adherence in (
        'almost_entirely',
        'most_of_the_time',
        'some_of_the_time',
        'not_much'
      )
    ),
  recovery_feeling text
    check (
      recovery_feeling is null
      or recovery_feeling in (
        'struggling',
        'normal',
        'strong',
        'didnt_train'
      )
    ),
  context_notes text,
  context_tags text[] not null default '{}',
  coach_summary text,
  recommendation_kind text
    check (
      recommendation_kind is null
      or recommendation_kind in (
        'keep_plan',
        'adjust_nutrition',
        'adjust_training',
        'improve_consistency',
        'review_goal',
        'inconclusive'
      )
    ),
  recommendation_text text,
  proposal_status text
    check (
      proposal_status is null
      or proposal_status in ('none', 'pending', 'accepted', 'rejected')
    ),
  proposed_daily_calories integer,
  proposed_protein_g integer,
  proposed_carbs_g integer,
  proposed_fat_g integer,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start_date)
);

create index if not exists weekly_check_ins_user_week_idx
  on public.weekly_check_ins (user_id, week_start_date desc);

drop trigger if exists weekly_check_ins_set_updated_at on public.weekly_check_ins;
create trigger weekly_check_ins_set_updated_at
before update on public.weekly_check_ins
for each row
execute procedure public.set_updated_at();

alter table public.weekly_check_ins enable row level security;

drop policy if exists "weekly_check_ins_select_own" on public.weekly_check_ins;
create policy "weekly_check_ins_select_own"
  on public.weekly_check_ins for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "weekly_check_ins_insert_own" on public.weekly_check_ins;
create policy "weekly_check_ins_insert_own"
  on public.weekly_check_ins for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "weekly_check_ins_update_own" on public.weekly_check_ins;
create policy "weekly_check_ins_update_own"
  on public.weekly_check_ins for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
