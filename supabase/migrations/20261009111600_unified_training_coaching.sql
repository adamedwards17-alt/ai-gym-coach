-- Unified training: multi-session days, skip/reschedule, proposals, availability.
-- Additive only. Preserves existing plan entries, sessions, RLS patterns.

-- ---------------------------------------------------------------------------
-- Plan entries: allow multiple workouts per day; richer statuses & lineage
-- ---------------------------------------------------------------------------
alter table public.training_plan_entries
  drop constraint if exists training_plan_entries_user_id_plan_date_key;

alter table public.training_plan_entries
  drop constraint if exists training_plan_entries_status_check;

alter table public.training_plan_entries
  add constraint training_plan_entries_status_check
  check (status in ('planned', 'completed', 'skipped', 'rescheduled'));

alter table public.training_plan_entries
  add column if not exists original_plan_date date,
  add column if not exists skip_reason text
    check (
      skip_reason is null
      or skip_reason in (
        'too_busy',
        'low_energy',
        'sore_recovery',
        'away_travelling',
        'not_motivated',
        'other'
      )
    ),
  add column if not exists skip_notes text,
  add column if not exists sort_order smallint not null default 0,
  add column if not exists rescheduled_from_id uuid
    references public.training_plan_entries (id) on delete set null;

-- Backfill original_plan_date from plan_date where missing.
update public.training_plan_entries
set original_plan_date = plan_date
where original_plan_date is null;

create index if not exists training_plan_entries_user_date_sort_idx
  on public.training_plan_entries (user_id, plan_date, sort_order);

-- ---------------------------------------------------------------------------
-- Logged sessions: optional strength detail (exercises / sets / reps / weights)
-- ---------------------------------------------------------------------------
alter table public.training_sessions
  add column if not exists strength_details jsonb;

-- ---------------------------------------------------------------------------
-- Temporary availability / travel constraints (expire by end_date)
-- ---------------------------------------------------------------------------
create table if not exists public.availability_constraints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  start_date date not null,
  end_date date not null,
  constraint_type text not null
    check (constraint_type in (
      'unavailable',
      'travelling',
      'limited_time',
      'no_gym_access',
      'other'
    )),
  notes text,
  active boolean not null default true,
  source_conversation_id uuid
    references public.coach_conversations (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create index if not exists availability_constraints_user_active_idx
  on public.availability_constraints (user_id, active, end_date);

create index if not exists availability_constraints_user_range_idx
  on public.availability_constraints (user_id, start_date, end_date);

drop trigger if exists availability_constraints_set_updated_at on public.availability_constraints;
create trigger availability_constraints_set_updated_at
before update on public.availability_constraints
for each row
execute procedure public.set_updated_at();

alter table public.availability_constraints enable row level security;

drop policy if exists "availability_constraints_select_own" on public.availability_constraints;
create policy "availability_constraints_select_own"
  on public.availability_constraints
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "availability_constraints_insert_own" on public.availability_constraints;
create policy "availability_constraints_insert_own"
  on public.availability_constraints
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "availability_constraints_update_own" on public.availability_constraints;
create policy "availability_constraints_update_own"
  on public.availability_constraints
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "availability_constraints_delete_own" on public.availability_constraints;
create policy "availability_constraints_delete_own"
  on public.availability_constraints
  for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on table public.availability_constraints to authenticated;

-- ---------------------------------------------------------------------------
-- Explicit plan-change proposals (Coach suggests; user must confirm)
-- ---------------------------------------------------------------------------
create table if not exists public.training_plan_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  conversation_id uuid
    references public.coach_conversations (id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'superseded')),
  reason text,
  changes jsonb not null default '[]'::jsonb,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (user_id, idempotency_key)
);

create index if not exists training_plan_proposals_user_status_idx
  on public.training_plan_proposals (user_id, status, created_at desc);

drop trigger if exists training_plan_proposals_set_updated_at on public.training_plan_proposals;
create trigger training_plan_proposals_set_updated_at
before update on public.training_plan_proposals
for each row
execute procedure public.set_updated_at();

alter table public.training_plan_proposals enable row level security;

drop policy if exists "training_plan_proposals_select_own" on public.training_plan_proposals;
create policy "training_plan_proposals_select_own"
  on public.training_plan_proposals
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "training_plan_proposals_insert_own" on public.training_plan_proposals;
create policy "training_plan_proposals_insert_own"
  on public.training_plan_proposals
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "training_plan_proposals_update_own" on public.training_plan_proposals;
create policy "training_plan_proposals_update_own"
  on public.training_plan_proposals
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "training_plan_proposals_delete_own" on public.training_plan_proposals;
create policy "training_plan_proposals_delete_own"
  on public.training_plan_proposals
  for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on table public.training_plan_proposals to authenticated;

notify pgrst, 'reload schema';
