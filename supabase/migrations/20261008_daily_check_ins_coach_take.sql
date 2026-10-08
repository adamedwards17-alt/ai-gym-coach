-- Persist Gemini Coach's Take on the same day's check-in row.
-- Nullable so existing rows and Gemini failures stay valid.

alter table public.daily_check_ins
  add column if not exists coach_take text;

notify pgrst, 'reload schema';
