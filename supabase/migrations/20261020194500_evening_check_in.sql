-- Evening check-in answers live on the same daily row.
-- Morning fields stay nullable so an evening review can be saved
-- before sleep, feeling and the morning plan have been recorded.
-- A null morning field means "no morning check-in", not a default answer.

alter table public.daily_check_ins
  add column if not exists evening_review jsonb;

alter table public.daily_check_ins
  alter column feeling drop not null,
  alter column sleep_rating drop not null,
  alter column planned_training drop not null;

notify pgrst, 'reload schema';
