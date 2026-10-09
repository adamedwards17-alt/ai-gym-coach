-- Today recovery check-in fields (additive; keeps sleep_rating for compatibility).

alter table public.daily_check_ins
  add column if not exists sleep_hours numeric
    check (
      sleep_hours is null
      or (sleep_hours >= 3 and sleep_hours <= 14)
    ),
  add column if not exists sleep_quality text
    check (
      sleep_quality is null
      or sleep_quality in ('bad', 'okay', 'good', 'very_good')
    ),
  add column if not exists feeling_rating smallint
    check (
      feeling_rating is null
      or (feeling_rating between 1 and 5)
    );

-- Existing RLS policies and grants on daily_check_ins already cover these columns.
notify pgrst, 'reload schema';
