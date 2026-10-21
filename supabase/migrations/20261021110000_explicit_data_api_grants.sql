-- Explicit Data API grants for tables whose original migrations relied on
-- Supabase's automatic public-schema privileges.
--
-- From 30 October 2026, new tables in public are not exposed to supabase-js
-- until a role is granted. These statements only add the privileges the
-- signed-in app and the coaching notification job already use. They do not
-- revoke existing privileges, do not grant anon, and do not change RLS.

-- Signed-in app. Privileges match the existing policies on each table.

grant select, insert, update on table public.profiles to authenticated;

grant select on table public.exercises to authenticated;

grant select, insert, update on table public.training_programmes to authenticated;
grant select, insert, update on table public.training_phases to authenticated;

grant select, insert, update, delete on table public.workout_templates to authenticated;
grant select, insert, update, delete on table public.workout_template_exercises to authenticated;
grant select, insert, update, delete on table public.programme_week_slots to authenticated;
grant select, insert, update, delete on table public.workout_set_logs to authenticated;

grant select, insert, update, delete on table public.weight_measurements to authenticated;
grant select, insert, update on table public.goal_history to authenticated;
grant select, insert on table public.nutrition_target_history to authenticated;
grant select, insert, update on table public.weekly_check_ins to authenticated;

-- Coaching notification job (service role). Read-only, except removing an
-- expired push subscription. The events table already grants this role.

grant select on table public.profiles to service_role;
grant select, delete on table public.push_subscriptions to service_role;
grant select on table public.daily_check_ins to service_role;
grant select on table public.nutrition_entries to service_role;
grant select on table public.training_sessions to service_role;
grant select on table public.training_plan_entries to service_role;
grant select on table public.nutrition_targets to service_role;
grant select on table public.coach_messages to service_role;
