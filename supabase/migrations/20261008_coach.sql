-- AI Gym Coach: Coach conversations, messages, and cross-conversation events.
-- Structured fitness data remains in profiles / daily_check_ins /
-- training_sessions / nutrition_entries. coach_events only stores meaningful
-- coaching facts that are not already captured there.

create table if not exists public.coach_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists coach_conversations_user_updated_idx
  on public.coach_conversations (user_id, updated_at desc);

drop trigger if exists coach_conversations_set_updated_at on public.coach_conversations;
create trigger coach_conversations_set_updated_at
before update on public.coach_conversations
for each row
execute procedure public.set_updated_at();

alter table public.coach_conversations enable row level security;

drop policy if exists "coach_conversations_select_own" on public.coach_conversations;
create policy "coach_conversations_select_own"
  on public.coach_conversations
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "coach_conversations_insert_own" on public.coach_conversations;
create policy "coach_conversations_insert_own"
  on public.coach_conversations
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "coach_conversations_update_own" on public.coach_conversations;
create policy "coach_conversations_update_own"
  on public.coach_conversations
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "coach_conversations_delete_own" on public.coach_conversations;
create policy "coach_conversations_delete_own"
  on public.coach_conversations
  for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on table public.coach_conversations to authenticated;

create table if not exists public.coach_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null
    references public.coach_conversations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null
    check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists coach_messages_conversation_created_idx
  on public.coach_messages (conversation_id, created_at asc);

alter table public.coach_messages enable row level security;

drop policy if exists "coach_messages_select_own" on public.coach_messages;
create policy "coach_messages_select_own"
  on public.coach_messages
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "coach_messages_insert_own" on public.coach_messages;
create policy "coach_messages_insert_own"
  on public.coach_messages
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "coach_messages_update_own" on public.coach_messages;
create policy "coach_messages_update_own"
  on public.coach_messages
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "coach_messages_delete_own" on public.coach_messages;
create policy "coach_messages_delete_own"
  on public.coach_messages
  for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on table public.coach_messages to authenticated;

create table if not exists public.coach_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  event_date date not null,
  event_type text not null
    check (event_type in (
      'training_skipped',
      'training_note',
      'soreness',
      'recovery_day',
      'sleep_note',
      'plan_change',
      'nutrition_decision',
      'goal_note',
      'upcoming_event',
      'lifestyle_note',
      'other'
    )),
  summary text not null,
  source_conversation_id uuid
    references public.coach_conversations (id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists coach_events_user_date_idx
  on public.coach_events (user_id, event_date desc, created_at desc);

create index if not exists coach_events_user_active_idx
  on public.coach_events (user_id, active);

drop trigger if exists coach_events_set_updated_at on public.coach_events;
create trigger coach_events_set_updated_at
before update on public.coach_events
for each row
execute procedure public.set_updated_at();

alter table public.coach_events enable row level security;

drop policy if exists "coach_events_select_own" on public.coach_events;
create policy "coach_events_select_own"
  on public.coach_events
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "coach_events_insert_own" on public.coach_events;
create policy "coach_events_insert_own"
  on public.coach_events
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "coach_events_update_own" on public.coach_events;
create policy "coach_events_update_own"
  on public.coach_events
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "coach_events_delete_own" on public.coach_events;
create policy "coach_events_delete_own"
  on public.coach_events
  for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on table public.coach_events to authenticated;
