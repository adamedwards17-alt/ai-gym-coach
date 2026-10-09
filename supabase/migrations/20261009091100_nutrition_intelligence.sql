-- Nutrition intelligence: display names, searchable aliases, barcode metadata,
-- and habit preference suppression for Coach prompts.
-- Additive; existing rows remain valid. RLS mirrors nutrition_entries patterns.

alter table public.nutrition_entries
  add column if not exists display_name text,
  add column if not exists search_aliases text[] not null default '{}',
  add column if not exists barcode text,
  add column if not exists brand text;

-- Allow Open Food Facts as an estimation source (barcode products).
-- The original inline check from 20261008_nutrition_v2.sql is auto-named
-- nutrition_entries_estimation_source_check.
alter table public.nutrition_entries
  drop constraint if exists nutrition_entries_estimation_source_check;

alter table public.nutrition_entries
  add constraint nutrition_entries_estimation_source_check
  check (
    estimation_source is null
    or estimation_source in ('gemini', 'user', 'open_food_facts', 'none')
  );

-- Backfill display names for existing entries.
update public.nutrition_entries
set display_name = description
where display_name is null;

create index if not exists nutrition_entries_display_name_idx
  on public.nutrition_entries (user_id, lower(display_name));

create index if not exists nutrition_entries_search_aliases_gin
  on public.nutrition_entries using gin (search_aliases);

create index if not exists nutrition_entries_barcode_idx
  on public.nutrition_entries (user_id, barcode)
  where barcode is not null;

-- Persist "I no longer have this habit" suppressions for Coach habit prompts.
create table if not exists public.nutrition_habit_prefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  habit_key text not null,
  status text not null check (status in ('stopped')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, habit_key)
);

create index if not exists nutrition_habit_prefs_user_idx
  on public.nutrition_habit_prefs (user_id);

alter table public.nutrition_habit_prefs enable row level security;

drop policy if exists "nutrition_habit_prefs_select_own" on public.nutrition_habit_prefs;
create policy "nutrition_habit_prefs_select_own"
  on public.nutrition_habit_prefs
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "nutrition_habit_prefs_insert_own" on public.nutrition_habit_prefs;
create policy "nutrition_habit_prefs_insert_own"
  on public.nutrition_habit_prefs
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "nutrition_habit_prefs_update_own" on public.nutrition_habit_prefs;
create policy "nutrition_habit_prefs_update_own"
  on public.nutrition_habit_prefs
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "nutrition_habit_prefs_delete_own" on public.nutrition_habit_prefs;
create policy "nutrition_habit_prefs_delete_own"
  on public.nutrition_habit_prefs
  for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on table public.nutrition_habit_prefs to authenticated;

notify pgrst, 'reload schema';
