-- Coaching notification preferences and send history.
-- Additive. Does not change push_subscriptions or VAPID data.

alter table public.profiles
  add column if not exists timezone text not null default 'Europe/London',
  add column if not exists coaching_notifications_enabled boolean not null default true;

alter table public.profiles
  drop constraint if exists profiles_timezone_length;

alter table public.profiles
  add constraint profiles_timezone_length
  check (char_length(timezone) between 1 and 64);

create table if not exists public.coaching_notification_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  purpose text not null
    check (purpose in (
      'morning_intention',
      'nutrition',
      'workout',
      'evening_wrapup'
    )),
  local_date date not null,
  status text not null
    check (status in ('claimed', 'sent', 'failed')),
  title text not null,
  body text not null,
  destination text not null,
  provider_status smallint,
  created_at timestamptz not null default now(),
  unique (user_id, purpose, local_date)
);

create index if not exists coaching_notification_events_user_date_idx
  on public.coaching_notification_events (user_id, local_date desc);

alter table public.coaching_notification_events enable row level security;

drop policy if exists "coaching_notification_events_select_own"
  on public.coaching_notification_events;
create policy "coaching_notification_events_select_own"
  on public.coaching_notification_events
  for select
  to authenticated
  using (auth.uid() = user_id);

grant select on table public.coaching_notification_events to authenticated;
grant select, insert, update, delete
  on table public.coaching_notification_events
  to service_role;
