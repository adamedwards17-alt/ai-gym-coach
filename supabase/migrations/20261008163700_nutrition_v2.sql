-- Nutrition 2.0: persisted daily targets + estimated macros on food entries.
-- Does not modify historical description/meal_type/logged_date data.

-- ---------------------------------------------------------------------------
-- nutrition_targets (one current target set per user; auditable & versioned)
-- ---------------------------------------------------------------------------

create table if not exists public.nutrition_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  daily_calories integer not null
    check (daily_calories > 0 and daily_calories <= 6000),
  protein_g integer not null
    check (protein_g > 0 and protein_g <= 400),
  carbs_g integer not null
    check (carbs_g >= 0 and carbs_g <= 800),
  fat_g integer not null
    check (fat_g > 0 and fat_g <= 300),
  methodology_version text not null,
  calculated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create index if not exists nutrition_targets_user_idx
  on public.nutrition_targets (user_id);

drop trigger if exists nutrition_targets_set_updated_at on public.nutrition_targets;
create trigger nutrition_targets_set_updated_at
before update on public.nutrition_targets
for each row
execute procedure public.set_updated_at();

alter table public.nutrition_targets enable row level security;

drop policy if exists "nutrition_targets_select_own" on public.nutrition_targets;
create policy "nutrition_targets_select_own"
  on public.nutrition_targets
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "nutrition_targets_insert_own" on public.nutrition_targets;
create policy "nutrition_targets_insert_own"
  on public.nutrition_targets
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "nutrition_targets_update_own" on public.nutrition_targets;
create policy "nutrition_targets_update_own"
  on public.nutrition_targets
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "nutrition_targets_delete_own" on public.nutrition_targets;
create policy "nutrition_targets_delete_own"
  on public.nutrition_targets
  for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on table public.nutrition_targets to authenticated;

-- ---------------------------------------------------------------------------
-- Extend nutrition_entries (additive; existing rows remain valid)
-- ---------------------------------------------------------------------------

alter table public.nutrition_entries
  add column if not exists calories_estimated integer
    check (calories_estimated is null or calories_estimated >= 0),
  add column if not exists protein_g_estimated numeric
    check (protein_g_estimated is null or protein_g_estimated >= 0),
  add column if not exists carbs_g_estimated numeric
    check (carbs_g_estimated is null or carbs_g_estimated >= 0),
  add column if not exists fat_g_estimated numeric
    check (fat_g_estimated is null or fat_g_estimated >= 0),
  add column if not exists estimation_confidence text
    check (
      estimation_confidence is null
      or estimation_confidence in ('high', 'medium', 'low')
    ),
  add column if not exists estimation_source text
    check (
      estimation_source is null
      or estimation_source in ('gemini', 'user', 'none')
    ),
  add column if not exists status text not null default 'eaten'
    check (status in ('eaten', 'planned'));

-- Backfill any null status for safety (default handles new rows).
update public.nutrition_entries
set status = 'eaten'
where status is null;
