-- Exercise-level workout tracking, programmes, phases, set logs.
-- Additive only. Preserves existing training_sessions and plan entries.

-- ---------------------------------------------------------------------------
-- Shared exercise catalogue (not user-owned; readable by authenticated)
-- ---------------------------------------------------------------------------
create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  primary_muscles text[] not null default '{}',
  equipment text,
  weight_convention text not null default 'total'
    check (weight_convention in (
      'per_dumbbell',
      'total',
      'bodyweight',
      'assisted'
    )),
  default_increment_kg numeric not null default 2.5
    check (default_increment_kg > 0 and default_increment_kg <= 50),
  notes text,
  created_at timestamptz not null default now()
);

alter table public.exercises enable row level security;

drop policy if exists "exercises_select_authenticated" on public.exercises;
create policy "exercises_select_authenticated"
  on public.exercises for select to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- User programmes + phases + templates + prescriptions
-- ---------------------------------------------------------------------------
create table if not exists public.training_programmes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  slug text not null,
  name text not null,
  description text,
  status text not null default 'active'
    check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, slug)
);

create index if not exists training_programmes_user_status_idx
  on public.training_programmes (user_id, status);

drop trigger if exists training_programmes_set_updated_at on public.training_programmes;
create trigger training_programmes_set_updated_at
before update on public.training_programmes
for each row execute procedure public.set_updated_at();

alter table public.training_programmes enable row level security;

drop policy if exists "training_programmes_select_own" on public.training_programmes;
create policy "training_programmes_select_own"
  on public.training_programmes for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "training_programmes_insert_own" on public.training_programmes;
create policy "training_programmes_insert_own"
  on public.training_programmes for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "training_programmes_update_own" on public.training_programmes;
create policy "training_programmes_update_own"
  on public.training_programmes for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.training_phases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  programme_id uuid not null references public.training_programmes (id) on delete cascade,
  slug text not null,
  name text not null,
  kind text not null
    check (kind in ('muscle_building', 'fat_loss', 'other')),
  status text not null default 'upcoming'
    check (status in ('active', 'upcoming', 'completed')),
  start_date date,
  end_date date,
  duration_weeks smallint
    check (duration_weeks is null or (duration_weeks > 0 and duration_weeks <= 52)),
  notes text,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  unique (programme_id, slug)
);

create index if not exists training_phases_user_status_idx
  on public.training_phases (user_id, status);

alter table public.training_phases enable row level security;

drop policy if exists "training_phases_select_own" on public.training_phases;
create policy "training_phases_select_own"
  on public.training_phases for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "training_phases_insert_own" on public.training_phases;
create policy "training_phases_insert_own"
  on public.training_phases for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "training_phases_update_own" on public.training_phases;
create policy "training_phases_update_own"
  on public.training_phases for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.workout_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  programme_id uuid not null references public.training_programmes (id) on delete cascade,
  code text not null,
  name text not null,
  focus text,
  estimated_duration_minutes smallint
    check (
      estimated_duration_minutes is null
      or (estimated_duration_minutes > 0 and estimated_duration_minutes <= 600)
    ),
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (programme_id, code)
);

create index if not exists workout_templates_user_programme_idx
  on public.workout_templates (user_id, programme_id);

drop trigger if exists workout_templates_set_updated_at on public.workout_templates;
create trigger workout_templates_set_updated_at
before update on public.workout_templates
for each row execute procedure public.set_updated_at();

alter table public.workout_templates enable row level security;

drop policy if exists "workout_templates_select_own" on public.workout_templates;
create policy "workout_templates_select_own"
  on public.workout_templates for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "workout_templates_insert_own" on public.workout_templates;
create policy "workout_templates_insert_own"
  on public.workout_templates for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "workout_templates_update_own" on public.workout_templates;
create policy "workout_templates_update_own"
  on public.workout_templates for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "workout_templates_delete_own" on public.workout_templates;
create policy "workout_templates_delete_own"
  on public.workout_templates for delete to authenticated
  using (auth.uid() = user_id);

create table if not exists public.workout_template_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  template_id uuid not null references public.workout_templates (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete restrict,
  sort_order smallint not null default 0,
  prescribed_sets smallint not null
    check (prescribed_sets > 0 and prescribed_sets <= 20),
  reps_min smallint not null
    check (reps_min > 0 and reps_min <= 100),
  reps_max smallint not null
    check (reps_max > 0 and reps_max <= 100),
  rest_seconds smallint not null default 60
    check (rest_seconds >= 0 and rest_seconds <= 600),
  superset_group text,
  target_rir_min smallint
    check (target_rir_min is null or (target_rir_min >= 0 and target_rir_min <= 10)),
  target_rir_max smallint
    check (target_rir_max is null or (target_rir_max >= 0 and target_rir_max <= 10)),
  notes text,
  created_at timestamptz not null default now(),
  check (reps_max >= reps_min),
  check (
    target_rir_min is null
    or target_rir_max is null
    or target_rir_max >= target_rir_min
  )
);

create index if not exists workout_template_exercises_template_idx
  on public.workout_template_exercises (template_id, sort_order);

alter table public.workout_template_exercises enable row level security;

drop policy if exists "workout_template_exercises_select_own" on public.workout_template_exercises;
create policy "workout_template_exercises_select_own"
  on public.workout_template_exercises for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "workout_template_exercises_insert_own" on public.workout_template_exercises;
create policy "workout_template_exercises_insert_own"
  on public.workout_template_exercises for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "workout_template_exercises_update_own" on public.workout_template_exercises;
create policy "workout_template_exercises_update_own"
  on public.workout_template_exercises for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "workout_template_exercises_delete_own" on public.workout_template_exercises;
create policy "workout_template_exercises_delete_own"
  on public.workout_template_exercises for delete to authenticated
  using (auth.uid() = user_id);

-- Weekly schedule slots (0=Mon … 6=Sun)
create table if not exists public.programme_week_slots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  programme_id uuid not null references public.training_programmes (id) on delete cascade,
  day_of_week smallint not null
    check (day_of_week >= 0 and day_of_week <= 6),
  slot_type text not null
    check (slot_type in ('strength', 'hiit', 'rest', 'other')),
  template_id uuid references public.workout_templates (id) on delete set null,
  title text,
  sort_order smallint not null default 0,
  unique (programme_id, day_of_week, sort_order)
);

alter table public.programme_week_slots enable row level security;

drop policy if exists "programme_week_slots_select_own" on public.programme_week_slots;
create policy "programme_week_slots_select_own"
  on public.programme_week_slots for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "programme_week_slots_insert_own" on public.programme_week_slots;
create policy "programme_week_slots_insert_own"
  on public.programme_week_slots for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "programme_week_slots_update_own" on public.programme_week_slots;
create policy "programme_week_slots_update_own"
  on public.programme_week_slots for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "programme_week_slots_delete_own" on public.programme_week_slots;
create policy "programme_week_slots_delete_own"
  on public.programme_week_slots for delete to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Sessions: in-progress support + template/phase links
-- ---------------------------------------------------------------------------
alter table public.training_sessions
  add column if not exists session_status text
    check (
      session_status is null
      or session_status in ('in_progress', 'completed', 'abandoned')
    ),
  add column if not exists started_at timestamptz,
  add column if not exists finished_at timestamptz,
  add column if not exists paused_at timestamptz,
  add column if not exists workout_template_id uuid
    references public.workout_templates (id) on delete set null,
  add column if not exists programme_phase_id uuid
    references public.training_phases (id) on delete set null;

-- Backfill legacy rows as completed.
update public.training_sessions
set session_status = 'completed'
where session_status is null;

alter table public.training_sessions
  alter column session_status set default 'completed';

alter table public.training_plan_entries
  add column if not exists workout_template_id uuid
    references public.workout_templates (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Per-set logs
-- ---------------------------------------------------------------------------
create table if not exists public.workout_set_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  training_session_id uuid not null
    references public.training_sessions (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete restrict,
  template_exercise_id uuid
    references public.workout_template_exercises (id) on delete set null,
  set_number smallint not null
    check (set_number > 0 and set_number <= 30),
  weight_kg numeric
    check (weight_kg is null or (weight_kg >= 0 and weight_kg < 1000)),
  reps smallint
    check (reps is null or (reps >= 0 and reps <= 200)),
  rir smallint
    check (rir is null or (rir >= 0 and rir <= 10)),
  effort text
    check (
      effort is null
      or effort in ('easy', 'moderate', 'hard', 'very_hard')
    ),
  completed boolean not null default false,
  skipped boolean not null default false,
  pain_reported boolean not null default false,
  pain_notes text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (training_session_id, exercise_id, set_number)
);

create index if not exists workout_set_logs_user_session_idx
  on public.workout_set_logs (user_id, training_session_id);

create index if not exists workout_set_logs_user_exercise_idx
  on public.workout_set_logs (user_id, exercise_id, completed_at desc);

drop trigger if exists workout_set_logs_set_updated_at on public.workout_set_logs;
create trigger workout_set_logs_set_updated_at
before update on public.workout_set_logs
for each row execute procedure public.set_updated_at();

alter table public.workout_set_logs enable row level security;

drop policy if exists "workout_set_logs_select_own" on public.workout_set_logs;
create policy "workout_set_logs_select_own"
  on public.workout_set_logs for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "workout_set_logs_insert_own" on public.workout_set_logs;
create policy "workout_set_logs_insert_own"
  on public.workout_set_logs for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "workout_set_logs_update_own" on public.workout_set_logs;
create policy "workout_set_logs_update_own"
  on public.workout_set_logs for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "workout_set_logs_delete_own" on public.workout_set_logs;
create policy "workout_set_logs_delete_own"
  on public.workout_set_logs for delete to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Seed exercise catalogue (idempotent by slug)
-- ---------------------------------------------------------------------------
insert into public.exercises (slug, name, primary_muscles, equipment, weight_convention, default_increment_kg, notes)
values
  ('seated-db-shoulder-press', 'Seated dumbbell shoulder press', array['shoulders'], 'dumbbells', 'per_dumbbell', 2.0, 'Prior neck/shoulder comfort — stop if pain appears.'),
  ('db-lateral-raise', 'Dumbbell lateral raise', array['shoulders'], 'dumbbells', 'per_dumbbell', 1.0, null),
  ('db-rear-delt-fly', 'Dumbbell rear-delt fly', array['shoulders','upper_back'], 'dumbbells', 'per_dumbbell', 1.0, null),
  ('incline-db-bench-press', 'Incline dumbbell bench press', array['chest','shoulders'], 'dumbbells', 'per_dumbbell', 2.0, null),
  ('cable-triceps-pressdown', 'Cable triceps pressdown', array['triceps'], 'cable', 'total', 2.5, null),
  ('cable-overhead-triceps-extension', 'Cable overhead triceps extension', array['triceps'], 'cable', 'total', 2.5, null),
  ('cable-chest-fly', 'Cable chest fly', array['chest'], 'cable', 'total', 2.5, null),
  ('cable-crunch', 'Cable crunch', array['core'], 'cable', 'total', 2.5, null),
  ('single-arm-db-row', 'Single-arm dumbbell row', array['back'], 'dumbbells', 'per_dumbbell', 2.0, null),
  ('seated-cable-row', 'Seated cable row', array['back'], 'cable', 'total', 2.5, null),
  ('straight-arm-cable-pulldown', 'Straight-arm cable pulldown', array['back','lats'], 'cable', 'total', 2.5, null),
  ('cable-face-pull', 'Cable face pull', array['shoulders','upper_back'], 'cable', 'total', 2.5, null),
  ('incline-db-curl', 'Incline dumbbell curl', array['biceps'], 'dumbbells', 'per_dumbbell', 1.0, null),
  ('cable-rope-curl', 'Cable rope curl', array['biceps'], 'cable', 'total', 2.5, null),
  ('lying-leg-raise', 'Lying leg raise', array['core'], 'bodyweight', 'bodyweight', 1.0, null),
  ('goblet-squat', 'Goblet squat', array['quads','glutes'], 'dumbbells', 'total', 2.0, null),
  ('db-romanian-deadlift', 'Dumbbell Romanian deadlift', array['hamstrings','glutes'], 'dumbbells', 'per_dumbbell', 2.0, null),
  ('cable-lateral-raise', 'Cable lateral raise', array['shoulders'], 'cable', 'total', 1.25, null),
  ('db-curl', 'Dumbbell curl', array['biceps'], 'dumbbells', 'per_dumbbell', 1.0, null),
  ('standing-calf-raise', 'Standing calf raise', array['calves'], 'bodyweight', 'bodyweight', 5.0, null)
on conflict (slug) do nothing;
