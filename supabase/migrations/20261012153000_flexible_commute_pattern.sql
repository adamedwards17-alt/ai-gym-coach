-- Flexible routine commute / transport pattern for calorie estimates.
-- Additive only. Preserves existing cycle_commute_* values via backfill.

alter table public.profiles
  add column if not exists commute_situation text
    check (
      commute_situation is null
      or commute_situation in (
        'work_from_home',
        'no_regular_commute',
        'commutes'
      )
    ),
  add column if not exists commute_pattern jsonb not null default '[]'::jsonb;

comment on column public.profiles.commute_situation is
  'Optional: work_from_home, no_regular_commute, or commutes. Null means unset — do not invent.';
comment on column public.profiles.commute_pattern is
  'JSON array of { method, daysPerWeek, minutesOneWay }. Methods: walking, cycling, e_scooter, public_transport, driving, other.';

-- Preserve existing cycling commute as a structured pattern entry.
update public.profiles
set
  commute_situation = coalesce(commute_situation, 'commutes'),
  commute_pattern = jsonb_build_array(
    jsonb_build_object(
      'method', 'cycling',
      'daysPerWeek', cycle_commute_days_per_week,
      'minutesOneWay', coalesce(cycle_commute_minutes, 20)
    )
  )
where cycle_commute_days_per_week is not null
  and cycle_commute_days_per_week > 0
  and (
    commute_pattern is null
    or commute_pattern = '[]'::jsonb
  );
