-- Coach-confirmed durable changes (nutrition, programme phases, activity).
-- Additive only. Proposals stay pending until the user confirms.

-- ---------------------------------------------------------------------------
-- Profile activity pattern (commute / routine detail for calorie estimates)
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists cycle_commute_days_per_week smallint
    check (
      cycle_commute_days_per_week is null
      or (cycle_commute_days_per_week >= 0 and cycle_commute_days_per_week <= 7)
    ),
  add column if not exists cycle_commute_minutes smallint
    check (
      cycle_commute_minutes is null
      or (cycle_commute_minutes > 0 and cycle_commute_minutes <= 180)
    ),
  add column if not exists activity_pattern_notes text;

comment on column public.profiles.cycle_commute_days_per_week is
  'Days per week the user typically cycles to work/study (0–7). Not assumed daily.';
comment on column public.profiles.cycle_commute_minutes is
  'Typical one-way cycle commute duration in minutes.';

-- ---------------------------------------------------------------------------
-- Unified coach change proposals (nutrition / programme / activity / goal)
-- ---------------------------------------------------------------------------
create table if not exists public.coach_change_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  conversation_id uuid
    references public.coach_conversations (id) on delete set null,
  kind text not null
    check (kind in (
      'nutrition_targets',
      'programme_phases',
      'activity_pattern',
      'goal'
    )),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'superseded')),
  reason text,
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (user_id, idempotency_key)
);

create index if not exists coach_change_proposals_user_status_idx
  on public.coach_change_proposals (user_id, status, created_at desc);

create index if not exists coach_change_proposals_conversation_idx
  on public.coach_change_proposals (conversation_id, status)
  where conversation_id is not null;

drop trigger if exists coach_change_proposals_set_updated_at
  on public.coach_change_proposals;
create trigger coach_change_proposals_set_updated_at
before update on public.coach_change_proposals
for each row
execute procedure public.set_updated_at();

alter table public.coach_change_proposals enable row level security;

drop policy if exists "coach_change_proposals_select_own"
  on public.coach_change_proposals;
create policy "coach_change_proposals_select_own"
  on public.coach_change_proposals
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "coach_change_proposals_insert_own"
  on public.coach_change_proposals;
create policy "coach_change_proposals_insert_own"
  on public.coach_change_proposals
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "coach_change_proposals_update_own"
  on public.coach_change_proposals;
create policy "coach_change_proposals_update_own"
  on public.coach_change_proposals
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "coach_change_proposals_delete_own"
  on public.coach_change_proposals;
create policy "coach_change_proposals_delete_own"
  on public.coach_change_proposals
  for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete
  on table public.coach_change_proposals to authenticated;
