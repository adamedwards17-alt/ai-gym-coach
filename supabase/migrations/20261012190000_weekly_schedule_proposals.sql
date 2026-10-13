-- Allow coach-confirmed recurring weekly schedule proposals.
-- Additive only. Existing proposal kinds unchanged.

alter table public.coach_change_proposals
  drop constraint if exists coach_change_proposals_kind_check;

alter table public.coach_change_proposals
  add constraint coach_change_proposals_kind_check
  check (kind in (
    'nutrition_targets',
    'programme_phases',
    'activity_pattern',
    'goal',
    'weekly_schedule'
  ));

comment on constraint coach_change_proposals_kind_check
  on public.coach_change_proposals is
  'Typed coach-confirmed changes, including recurring weekly_schedule.';
