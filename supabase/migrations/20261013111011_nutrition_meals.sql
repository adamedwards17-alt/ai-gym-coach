-- Reusable meal definitions (1-portion recipes) with ingredient rows.
-- Logged nutrition_entries may reference a meal + portions eaten without
-- rewriting historical entries when the recipe later changes.
-- Additive only. Existing RLS patterns mirrored.

create table if not exists public.nutrition_meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  search_aliases text[] not null default '{}',
  brand text,
  estimation_source text
    check (
      estimation_source is null
      or estimation_source in ('gemini', 'user', 'open_food_facts', 'none')
    ),
  estimation_confidence text
    check (
      estimation_confidence is null
      or estimation_confidence in ('high', 'medium', 'low')
    ),
  calories_per_portion numeric,
  protein_g_per_portion numeric,
  carbs_g_per_portion numeric,
  fat_g_per_portion numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists nutrition_meals_user_idx
  on public.nutrition_meals (user_id, lower(name));

create index if not exists nutrition_meals_aliases_gin
  on public.nutrition_meals using gin (search_aliases);

create table if not exists public.nutrition_meal_ingredients (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null references public.nutrition_meals (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  sort_order integer not null default 0,
  name text not null,
  quantity_amount numeric,
  quantity_unit text,
  quantity_label text,
  calories numeric,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  estimated boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists nutrition_meal_ingredients_meal_idx
  on public.nutrition_meal_ingredients (meal_id, sort_order);

alter table public.nutrition_entries
  add column if not exists meal_id uuid references public.nutrition_meals (id) on delete set null,
  add column if not exists portions numeric;

create index if not exists nutrition_entries_meal_id_idx
  on public.nutrition_entries (user_id, meal_id)
  where meal_id is not null;

alter table public.nutrition_meals enable row level security;
alter table public.nutrition_meal_ingredients enable row level security;

drop policy if exists "nutrition_meals_select_own" on public.nutrition_meals;
create policy "nutrition_meals_select_own"
  on public.nutrition_meals for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "nutrition_meals_insert_own" on public.nutrition_meals;
create policy "nutrition_meals_insert_own"
  on public.nutrition_meals for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "nutrition_meals_update_own" on public.nutrition_meals;
create policy "nutrition_meals_update_own"
  on public.nutrition_meals for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "nutrition_meals_delete_own" on public.nutrition_meals;
create policy "nutrition_meals_delete_own"
  on public.nutrition_meals for delete to authenticated
  using (auth.uid() = user_id);

drop policy if exists "nutrition_meal_ingredients_select_own" on public.nutrition_meal_ingredients;
create policy "nutrition_meal_ingredients_select_own"
  on public.nutrition_meal_ingredients for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "nutrition_meal_ingredients_insert_own" on public.nutrition_meal_ingredients;
create policy "nutrition_meal_ingredients_insert_own"
  on public.nutrition_meal_ingredients for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "nutrition_meal_ingredients_update_own" on public.nutrition_meal_ingredients;
create policy "nutrition_meal_ingredients_update_own"
  on public.nutrition_meal_ingredients for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "nutrition_meal_ingredients_delete_own" on public.nutrition_meal_ingredients;
create policy "nutrition_meal_ingredients_delete_own"
  on public.nutrition_meal_ingredients for delete to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on table public.nutrition_meals to authenticated;
grant select, insert, update, delete on table public.nutrition_meal_ingredients to authenticated;

notify pgrst, 'reload schema';
