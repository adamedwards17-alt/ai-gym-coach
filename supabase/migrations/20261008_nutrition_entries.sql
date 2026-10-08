-- AI Gym Coach: natural-language food log (what the user actually ate).
-- Multiple entries per user per local calendar day are allowed.
-- Does not store calories, macros, or AI responses.

create table if not exists public.nutrition_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  logged_date date not null,
  meal_type text
    check (
      meal_type is null
      or meal_type in (
        'breakfast', 'lunch', 'dinner', 'snack', 'drink', 'other'
      )
    ),
  description text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists nutrition_entries_user_date_idx
  on public.nutrition_entries (user_id, logged_date desc, created_at desc);

drop trigger if exists nutrition_entries_set_updated_at on public.nutrition_entries;
create trigger nutrition_entries_set_updated_at
before update on public.nutrition_entries
for each row
execute procedure public.set_updated_at();

alter table public.nutrition_entries enable row level security;

drop policy if exists "nutrition_entries_select_own" on public.nutrition_entries;
create policy "nutrition_entries_select_own"
  on public.nutrition_entries
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "nutrition_entries_insert_own" on public.nutrition_entries;
create policy "nutrition_entries_insert_own"
  on public.nutrition_entries
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "nutrition_entries_update_own" on public.nutrition_entries;
create policy "nutrition_entries_update_own"
  on public.nutrition_entries
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "nutrition_entries_delete_own" on public.nutrition_entries;
create policy "nutrition_entries_delete_own"
  on public.nutrition_entries
  for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on table public.nutrition_entries to authenticated;
