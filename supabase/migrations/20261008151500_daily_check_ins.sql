-- AI Gym Coach: one completed daily check-in per user per local calendar day.
-- Does not store AI coaching responses yet.

create table if not exists public.daily_check_ins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  check_in_date date not null,
  feeling text not null
    check (feeling in ('strong', 'good', 'flat', 'tired', 'sore')),
  sleep_rating smallint not null
    check (sleep_rating between 1 and 5),
  planned_training text not null
    check (planned_training in ('strength', 'hiit', 'recovery', 'rest', 'unsure')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, check_in_date)
);

create index if not exists daily_check_ins_user_date_idx
  on public.daily_check_ins (user_id, check_in_date desc);

drop trigger if exists daily_check_ins_set_updated_at on public.daily_check_ins;
create trigger daily_check_ins_set_updated_at
before update on public.daily_check_ins
for each row
execute procedure public.set_updated_at();

alter table public.daily_check_ins enable row level security;

drop policy if exists "daily_check_ins_select_own" on public.daily_check_ins;
create policy "daily_check_ins_select_own"
  on public.daily_check_ins
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "daily_check_ins_insert_own" on public.daily_check_ins;
create policy "daily_check_ins_insert_own"
  on public.daily_check_ins
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "daily_check_ins_update_own" on public.daily_check_ins;
create policy "daily_check_ins_update_own"
  on public.daily_check_ins
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update on table public.daily_check_ins to authenticated;
