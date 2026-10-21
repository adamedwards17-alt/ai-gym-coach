-- Serving text and default quantity live on the reusable meal, not on past logs.
-- nutrition_entries already store a calorie snapshot, so editing a saved food
-- must not need to rewrite those rows. Existing table grants cover the new columns.

alter table public.nutrition_meals
  add column if not exists serving_label text,
  add column if not exists default_portions numeric;

alter table public.nutrition_meals
  drop constraint if exists nutrition_meals_default_portions_range;

alter table public.nutrition_meals
  add constraint nutrition_meals_default_portions_range
  check (
    default_portions is null
    or (default_portions > 0 and default_portions <= 12)
  );
