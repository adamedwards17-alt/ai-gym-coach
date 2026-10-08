-- AI Gym Coach: logged training sessions (what the user actually did).
-- Multiple sessions per user per local calendar day are allowed.
-- Does not store AI responses.

create table if not exists public.training_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  session_date date not null,
  training_type text not null
    check (training_type in (
      'strength', 'hiit', 'cardio', 'sport', 'recovery', 'other'
    )),
  title text not null,
  duration_minutes smallint
    check (
      duration_minutes is null
      or (duration_minutes > 0 and duration_minutes <= 600)
    ),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists training_sessions_user_date_idx
  on public.training_sessions (user_id, session_date desc);

drop trigger if exists training_sessions_set_updated_at on public.training_sessions;
create trigger training_sessions_set_updated_at
before update on public.training_sessions
for each row
execute procedure public.set_updated_at();

alter table public.training_sessions enable row level security;

drop policy if exists "training_sessions_select_own" on public.training_sessions;
create policy "training_sessions_select_own"
  on public.training_sessions
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "training_sessions_insert_own" on public.training_sessions;
create policy "training_sessions_insert_own"
  on public.training_sessions
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "training_sessions_update_own" on public.training_sessions;
create policy "training_sessions_update_own"
  on public.training_sessions
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "training_sessions_delete_own" on public.training_sessions;
create policy "training_sessions_delete_own"
  on public.training_sessions
  for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on table public.training_sessions to authenticated;
